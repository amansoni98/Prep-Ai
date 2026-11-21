# PREP-AI

Personalized placement & mock-interview prep. Three decoupled tiers:

```
React + Vite + Tailwind  ──/api──▶  Express + Mongoose (MongoDB Atlas)  ──HTTP──▶  FastAPI AI service
      :5173                                  :5000                                      :8000
                                                                                  Groq llama-3.3-70b  ─fallback▶  Ollama mistral
```

## Quick start

Prereqs: Node 18+, Python 3.10+, a MongoDB Atlas URI, a Groq API key (and/or local Ollama with `ollama pull mistral`).

```bash
# 1) AI service
cd ai-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # add GROQ_API_KEY
uvicorn app.main:app --port 8000 --reload

# 2) Backend
cd backend
npm install
cp .env.example .env            # add MONGODB_URI and a long random JWT_SECRET
npm run dev

# 3) Frontend
cd frontend
npm install
npm run dev                     # http://localhost:5173  (proxies /api -> :5000)
```

Tests for the AI service: `cd ai-service && python -m pytest` (uses a scripted fake LLM; no keys needed).

## How the key requirements are met

| Requirement | Where |
|---|---|
| JWT + bcrypt auth, strict per-user scoping | `backend/src/middleware/auth.js` sets `req.userId`; **every** query in `server.js` filters by `userId` |
| PDF upload → parse | React drag-and-drop → `multer` memory buffer → FastAPI `pdfplumber` → LLM → structured JSON |
| Deterministic match score | `ai-service/app/main.py` `compute_match()`: set intersection over normalized skill sets (alias map + lexicon). The LLM never does the math; it only writes the gap analysis |
| Strict JSON from LLMs | `providers.py` `LLMClient.generate_json()`: strips fences/prose/trailing commas → Pydantic validation → corrective retry with the error message → next provider. Exhaustion becomes a clean HTTP 503 |
| Provider abstraction | `GroqProvider`, `OllamaProvider`, registry + `LLM_PROVIDERS` order; add a provider by subclassing `LLMProvider` |
| Gap-targeted questions | ≥60% of questions must target the latest JD's missing skills (`targets_gap`), enforced in the prompt and count-validated |
| Interview UI | Typewriter AI interviewer, stepper, text/code editor, `SpeechRecognition` dictation (auto-restarts on silence), optional gentle timer, score gauge, strengths/improvements, answer vs ideal-blueprint comparison |
| Dashboard / history | `/api/analytics/summary`, SVG trend chart with hover tooltips, expandable transcripts |
| Light / dark | Tailwind `class` strategy, persisted, no flash on load |

## Notes

- Voice dictation needs Chrome/Edge (Web Speech API) and mic permission; other browsers fall back to typing.
- Scanned (image-only) PDFs have no extractable text and are rejected with a clear message.
- Set `AI_SERVICE_KEY` in both `.env` files to require a shared secret between backend and AI service.
- Production: put the frontend `npm run build` output behind a static host / reverse proxy, set `CLIENT_ORIGIN`, and set `VITE_API_URL` if the API is on another origin.
