"""Modular LLM provider abstraction with strict JSON validation.

Providers (Groq primary, Ollama local fallback) only know how to return raw text.
`LLMClient.generate_json` owns the hard part: it cleans markdown fences / stray
prose, validates the result against a Pydantic schema, feeds validation errors back
to the model for a corrective retry, and finally falls through to the next provider.
Malformed model output therefore never reaches (or crashes) the API layer.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from abc import ABC, abstractmethod
from typing import Callable, Optional, Type, TypeVar

import httpx
from pydantic import BaseModel

log = logging.getLogger("prep-ai.llm")
T = TypeVar("T", bound=BaseModel)

DEFAULT_SYSTEM = (
    "You are a precise assistant that replies with a single valid JSON object only. "
    "Never use markdown code fences, never add commentary before or after the JSON."
)


class LLMError(Exception):
    """Raised when every provider failed to return a valid response."""


class ProviderError(Exception):
    """A single provider call failed. `retryable` marks transient failures."""

    def __init__(self, message: str, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


# --------------------------------------------------------------------------- #
# Providers
# --------------------------------------------------------------------------- #
class LLMProvider(ABC):
    name = "base"

    @property
    def available(self) -> bool:
        return True

    @abstractmethod
    async def complete(
        self, system: str, prompt: str, *, temperature: float = 0.3, json_mode: bool = True
    ) -> str:
        """Return the raw text completion."""


class GroqProvider(LLMProvider):
    name = "groq"

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None,
                 base_url: Optional[str] = None, timeout: float = 60.0):
        self.api_key = api_key if api_key is not None else os.getenv("GROQ_API_KEY", "")
        self.model = model or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        self.base_url = (base_url or os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")).rstrip("/")
        self.timeout = timeout

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    async def complete(self, system, prompt, *, temperature=0.3, json_mode=True) -> str:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": 4096,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
        except httpx.HTTPError as e:
            raise ProviderError(f"groq transport error: {e!r}", retryable=True) from e
        if r.status_code >= 400:
            retryable = r.status_code in (408, 429, 500, 502, 503, 504) or "json_validate_failed" in r.text
            raise ProviderError(f"groq HTTP {r.status_code}: {r.text[:200]}", retryable=retryable)
        try:
            return r.json()["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, ValueError) as e:
            raise ProviderError("groq returned a malformed envelope", retryable=True) from e


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self, host: Optional[str] = None, model: Optional[str] = None, timeout: float = 180.0):
        self.host = (host or os.getenv("OLLAMA_HOST", "http://localhost:11434")).rstrip("/")
        self.model = model or os.getenv("OLLAMA_MODEL", "mistral")
        self.timeout = timeout

    @property
    def available(self) -> bool:
        return os.getenv("OLLAMA_ENABLED", "true").lower() not in ("0", "false", "no")

    async def complete(self, system, prompt, *, temperature=0.3, json_mode=True) -> str:
        payload = {
            "model": self.model,
            "stream": False,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "options": {"temperature": temperature},
        }
        if json_mode:
            payload["format"] = "json"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.post(f"{self.host}/api/chat", json=payload)
        except httpx.HTTPError as e:
            raise ProviderError(f"ollama unreachable: {e!r}", retryable=False) from e
        if r.status_code >= 400:
            raise ProviderError(f"ollama HTTP {r.status_code}: {r.text[:200]}", retryable=r.status_code >= 500)
        try:
            return r.json()["message"]["content"] or ""
        except (KeyError, ValueError) as e:
            raise ProviderError("ollama returned a malformed envelope", retryable=True) from e


PROVIDER_REGISTRY: dict[str, Callable[[], LLMProvider]] = {
    "groq": GroqProvider,
    "ollama": OllamaProvider,
}


def build_providers(order: Optional[str] = None) -> list[LLMProvider]:
    """Instantiate providers in priority order (env LLM_PROVIDERS, default groq,ollama)."""
    order = order or os.getenv("LLM_PROVIDERS", "groq,ollama")
    providers: list[LLMProvider] = []
    for name in (n.strip().lower() for n in order.split(",") if n.strip()):
        factory = PROVIDER_REGISTRY.get(name)
        if not factory:
            log.warning("Unknown LLM provider '%s' ignored", name)
            continue
        p = factory()
        if p.available:
            providers.append(p)
        else:
            log.info("Provider '%s' skipped (not configured)", name)
    return providers


# --------------------------------------------------------------------------- #
# JSON cleanup
# --------------------------------------------------------------------------- #
def clean_json_text(raw: str) -> str:
    """Strip markdown fences / surrounding prose and trailing commas from model output."""
    text = (raw or "").strip().lstrip("﻿")
    fence = re.search(r"```(?:json|JSON)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    else:
        text = re.sub(r"^```(?:json|JSON)?", "", text).strip()
    starts = [i for i in (text.find("{"), text.find("[")) if i != -1]
    if not starts:
        return text
    start = min(starts)
    close = "}" if text[start] == "{" else "]"
    end = text.rfind(close)
    if end > start:
        text = text[start : end + 1]
    return re.sub(r",\s*([}\]])", r"\1", text)


# --------------------------------------------------------------------------- #
# Client with validation + retry + fallback
# --------------------------------------------------------------------------- #
class LLMClient:
    def __init__(self, providers: Optional[list[LLMProvider]] = None):
        self.providers = providers if providers is not None else build_providers()

    @property
    def provider_names(self) -> list[str]:
        return [p.name for p in self.providers]

    async def generate_json(
        self,
        prompt: str,
        model: Type[T],
        *,
        example: Optional[str] = None,
        system: str = DEFAULT_SYSTEM,
        temperature: float = 0.3,
        max_attempts: int = 3,
        post_validate: Optional[Callable[[T], None]] = None,
    ) -> T:
        """Return a validated `model` instance or raise LLMError.

        `post_validate` may raise ValueError for semantic checks (e.g. "need 5 questions");
        the message is fed back to the model on the next attempt.
        """
        if not self.providers:
            raise LLMError("No LLM provider is configured (set GROQ_API_KEY or run Ollama).")

        base = prompt.strip()
        if example:
            base += (
                "\n\nReply with ONE JSON object that has exactly this shape "
                "(same keys, same types; replace the sample values):\n" + example.strip()
            )
        base += "\n\nOutput JSON only."

        errors: list[str] = []
        for provider in self.providers:
            current = base
            for attempt in range(1, max_attempts + 1):
                try:
                    raw = await provider.complete(
                        system, current,
                        temperature=temperature if attempt == 1 else max(0.1, temperature - 0.15),
                    )
                except ProviderError as e:
                    errors.append(f"{provider.name}: {e}")
                    log.warning("provider %s attempt %d failed: %s", provider.name, attempt, e)
                    if e.retryable and attempt < max_attempts:
                        await asyncio.sleep(min(1.5 * attempt, 5))
                        continue
                    break  # next provider

                try:
                    data = json.loads(clean_json_text(raw), strict=False)
                    obj = model.model_validate(data)  # pydantic ValidationError is a ValueError
                    if post_validate:
                        post_validate(obj)
                    return obj
                except ValueError as e:  # includes json.JSONDecodeError and ValidationError
                    msg = " ".join(str(e).split())[:400]
                    errors.append(f"{provider.name}: invalid output ({msg})")
                    log.warning("provider %s attempt %d produced invalid JSON: %s", provider.name, attempt, msg)
                    current = (
                        base
                        + f"\n\nYour previous reply was rejected: {msg}\n"
                        "Reply again with ONLY the corrected JSON object."
                    )
        raise LLMError("All LLM providers failed. " + " | ".join(errors[-4:]))
