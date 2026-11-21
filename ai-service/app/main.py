"""PREP-AI AI microservice.

Endpoints
  GET  /health
  POST /parse-resume        PDF -> raw text (pdfplumber) -> structured JSON (LLM)
  POST /match               deterministic set-intersection Match Score + LLM gap analysis
  POST /generate-questions  interview questions focused on skill gaps
  POST /evaluate-answer     score (0-10), coaching, ideal answer blueprint
"""
from __future__ import annotations

import hmac
import io
import logging
import math
import os
import re
from typing import Annotated, Literal, Optional

import pdfplumber
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

load_dotenv()

from .providers import LLMClient, LLMError  # noqa: E402

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("prep-ai")

app = FastAPI(title="PREP-AI AI Service", version="1.0.0")
llm = LLMClient()
SERVICE_KEY = os.getenv("AI_SERVICE_KEY", "")


async def require_key(x_service_key: str = Header(default="")):
    if SERVICE_KEY and not hmac.compare_digest(x_service_key, SERVICE_KEY):
        raise HTTPException(status_code=401, detail="Invalid service key")


@app.exception_handler(LLMError)
async def llm_error_handler(_, exc: LLMError):
    log.error("LLM failure: %s", exc)
    return JSONResponse(status_code=503, content={"detail": "The AI model is unavailable or returned unusable output. Please try again."})


# --------------------------------------------------------------------------- #
# Lenient schema helpers (LLMs return None / strings / numbers unpredictably)
# --------------------------------------------------------------------------- #
def _s(v) -> str:
    return "" if v is None else str(v).strip()


def _slist(v) -> list[str]:
    if v is None:
        return []
    if isinstance(v, str):
        parts = re.split(r"[\n;•]+|,\s+(?=[A-Za-z0-9+#.])", v)
        return [p.strip(" -*\t") for p in parts if p.strip(" -*\t")]
    if isinstance(v, (list, tuple, set)):
        out = []
        for x in v:
            if isinstance(x, dict):
                x = " - ".join(str(y) for y in x.values() if y)
            s = _s(x)
            if s:
                out.append(s)
        return out
    return [_s(v)]


def _score(v) -> float:
    m = re.search(r"-?\d+(?:\.\d+)?", str(v))
    if not m:
        raise ValueError("score must be a number between 0 and 10")
    f = float(m.group())
    if 10 < f <= 100:
        f /= 10
    return max(0.0, min(10.0, round(f, 1)))


Str = Annotated[str, BeforeValidator(_s)]
StrList = Annotated[list[str], BeforeValidator(_slist)]
Score10 = Annotated[float, BeforeValidator(_score)]


class Lenient(BaseModel):
    model_config = ConfigDict(extra="ignore")


# --------------------------------------------------------------------------- #
# Skill lexicon + normalization (the basis of the deterministic match score)
# --------------------------------------------------------------------------- #
SKILLS: dict[str, list[str]] = {
    # languages
    "python": ["python3"], "java": [], "javascript": ["js", "ecmascript", "es6"], "typescript": ["ts"],
    "c++": ["cpp"], "c#": ["csharp", "c sharp"], "go": ["golang"], "rust": [], "kotlin": [], "swift": [],
    "php": [], "ruby": [], "scala": [], "r": ["r programming"], "c": ["c programming", "c language"],
    "sql": [], "nosql": [], "bash": ["shell scripting", "shell"], "matlab": [], "dart": [],
    # web
    "html": ["html5"], "css": ["css3"], "sass": ["scss"], "tailwind css": ["tailwind", "tailwindcss"],
    "bootstrap": [], "react": ["reactjs", "react.js"], "next.js": ["nextjs", "next js"], "redux": [],
    "vue": ["vue.js", "vuejs"], "angular": ["angularjs"], "svelte": [], "webpack": [], "vite": [],
    "node.js": ["node", "nodejs", "node js"], "express": ["express.js", "expressjs"],
    "django": [], "flask": [], "fastapi": [], "spring boot": ["springboot"], "spring": [],
    ".net": ["dotnet", ".net core", "asp.net"], "laravel": [], "graphql": [], "rest": ["rest api", "rest apis", "restful", "restful api", "restful apis"],
    "grpc": [], "websockets": ["websocket"], "jwt": [], "oauth": ["oauth2"],
    # mobile
    "react native": [], "flutter": [], "android": [], "ios": [],
    # data / ai
    "machine learning": ["ml"], "deep learning": [], "nlp": ["natural language processing"],
    "llm": ["llms", "large language models"], "prompt engineering": [], "langchain": [],
    "retrieval augmented generation": ["rag"], "hugging face": ["huggingface"],
    "tensorflow": [], "pytorch": [], "scikit-learn": ["sklearn", "scikit learn"], "pandas": [], "numpy": [],
    "opencv": [], "computer vision": [], "data analysis": ["data analytics"], "data visualization": [],
    "statistics": [], "pyspark": [], "apache spark": [], "hadoop": [], "airflow": [], "etl": [],
    "power bi": ["powerbi"], "tableau": [], "excel": ["ms excel", "microsoft excel"],
    # databases
    "mongodb": ["mongo"], "mysql": [], "postgresql": ["postgres"], "redis": [], "elasticsearch": [],
    "sqlite": [], "dynamodb": [], "firebase": [], "oracle": [], "cassandra": [], "kafka": ["apache kafka"],
    "rabbitmq": [],
    # cloud / devops
    "aws": ["amazon web services"], "azure": ["microsoft azure"], "gcp": ["google cloud", "google cloud platform"],
    "docker": [], "kubernetes": ["k8s"], "terraform": [], "ansible": [], "jenkins": [],
    "github actions": [], "ci/cd": ["cicd", "ci cd", "continuous integration"], "linux": [],
    "git": [], "github": [], "gitlab": [], "nginx": [], "devops": [], "microservices": ["microservice"],
    # CS fundamentals
    "data structures and algorithms": ["dsa", "data structures", "algorithms", "data structures & algorithms"],
    "oop": ["object oriented programming", "object-oriented programming", "object oriented", "object-oriented", "oops"],
    "dbms": ["database management systems", "database management system"],
    "operating systems": [], "computer networks": ["networking"], "system design": ["distributed systems", "high level design", "low level design"],
    "design patterns": [], "multithreading": ["concurrency"], "api design": [],
    # testing / process
    "unit testing": [], "tdd": ["test driven development"], "jest": [], "pytest": [], "junit": [],
    "selenium": [], "cypress": [], "postman": [], "agile": ["agile methodology"], "scrum": [], "jira": [], "figma": [],
}

# Bare words that are too ambiguous in free text to be *detected* (they still normalize when
# they appear as an explicit skill entry, e.g. a resume "Skills: C, R, Go").
NO_DETECT = {"c", "r", "go", "node", "express", "rest", "excel", "shell", "spring", "ts", "js", "ml", "rag", "os"}

ALIAS: dict[str, str] = {}
for _canon, _aliases in SKILLS.items():
    ALIAS[_canon] = _canon
    for _a in _aliases:
        ALIAS[_a] = _canon
ALIAS.update({"rest": "rest", "node": "node.js", "express": "express", "spring": "spring"})

_BOUND_L, _BOUND_R = r"(?<![a-z0-9+#.])", r"(?![a-z0-9+#])"
_PATTERNS: dict[str, re.Pattern] = {}
for _canon, _aliases in SKILLS.items():
    names = sorted({_canon, *_aliases} - NO_DETECT, key=len, reverse=True)
    if names:
        _PATTERNS[_canon] = re.compile(_BOUND_L + "(?:" + "|".join(re.escape(n) for n in names) + ")" + _BOUND_R)


def normalize_skill(skill: str) -> str:
    """Canonical lowercase form so 'ReactJS', 'react.js' and 'React' compare equal."""
    t = _s(skill).lower().replace("&", " and ")
    t = re.sub(r"[()\[\]{}\"'`,;:!?]", " ", t)
    t = re.sub(r"\s+", " ", t).strip(" -•*/\t").rstrip(".")
    if t in ALIAS:
        return ALIAS[t]
    t2 = re.sub(r"^(apache|microsoft|ms)\s+", "", t)
    if t2 in ALIAS:
        return ALIAS[t2]
    t3 = re.sub(r"\s+(framework|library|language|programming|development|database|api|apis)$", "", t2)
    return ALIAS.get(t3, t3)


def detect_skills(text: str) -> set[str]:
    low = (text or "").lower()
    return {canon for canon, pat in _PATTERNS.items() if pat.search(low)}


def _present_in_text(skill: str, low_text: str) -> bool:
    return bool(re.search(_BOUND_L + re.escape(skill) + _BOUND_R, low_text))


def compute_match(jd_skills: set[str], resume_skills: set[str], resume_text: str = "") -> dict:
    """Pure set math. Free-form JD skills outside the lexicon count as present if the
    resume text literally contains them. No LLM involved."""
    low = (resume_text or "").lower()
    have = set(resume_skills)
    for s in jd_skills:
        if s not in SKILLS and s not in have and low and _present_in_text(s, low):
            have.add(s)
    matched = sorted(jd_skills & have)
    missing = sorted(jd_skills - have)
    score = round(100.0 * len(matched) / len(jd_skills), 1) if jd_skills else 0.0
    return {"match_score": score, "matched_skills": matched, "missing_skills": missing}


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class Project(Lenient):
    name: Str = ""
    description: Str = ""
    tech: StrList = Field(default_factory=list)


class Experience(Lenient):
    role: Str = ""
    company: Str = ""
    duration: Str = ""
    highlights: StrList = Field(default_factory=list)


class Education(Lenient):
    degree: Str = ""
    institution: Str = ""
    year: Str = ""


class ParsedResume(Lenient):
    summary: Str = ""
    skills: StrList = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    experience: list[Experience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)


class JDSkills(Lenient):
    required_skills: StrList = Field(default_factory=list)
    preferred_skills: StrList = Field(default_factory=list)


class Gap(Lenient):
    skill: Str
    why_it_matters: Str = ""
    how_to_close: Str = ""


class GapAnalysis(Lenient):
    summary: Str = ""
    gaps: list[Gap] = Field(default_factory=list)
    missing_keywords: StrList = Field(default_factory=list)
    resume_tips: StrList = Field(default_factory=list)


class MatchRequest(BaseModel):
    resume: ParsedResume
    resume_text: str = ""
    job_description: str = Field(min_length=30, max_length=20000)


InterviewType = Literal["Technical", "Behavioral", "System Design", "HR"]
Difficulty = Literal["Easy", "Medium", "Hard"]


class GenerateRequest(BaseModel):
    role: str = Field(min_length=2, max_length=120)
    interview_type: InterviewType
    difficulty: Difficulty
    num_questions: int = Field(default=5, ge=1, le=15)
    skill_gaps: list[str] = Field(default_factory=list)
    candidate_skills: list[str] = Field(default_factory=list)
    resume_summary: str = ""


class GenQuestion(Lenient):
    question: Str
    topic: Str = ""
    skill_focus: Str = ""
    targets_gap: bool = False
    hint: Str = ""


class QuestionSet(Lenient):
    questions: list[GenQuestion]


class EvaluateRequest(BaseModel):
    question: str = Field(min_length=5, max_length=2000)
    answer: str = Field(default="", max_length=10000)
    role: str = Field(default="Software Engineer", max_length=120)
    interview_type: InterviewType = "Technical"
    difficulty: Difficulty = "Medium"
    skill_focus: str = ""
    input_mode: Literal["text", "code", "voice"] = "text"


class IdealAnswer(Lenient):
    outline: StrList = Field(default_factory=list)
    key_points: StrList = Field(default_factory=list)
    sample_answer: Str = ""


class Evaluation(Lenient):
    score: Score10
    summary: Str = ""
    strengths: StrList = Field(default_factory=list)
    improvements: StrList = Field(default_factory=list)
    covered_points: StrList = Field(default_factory=list)
    missed_points: StrList = Field(default_factory=list)
    ideal_answer: IdealAnswer = Field(default_factory=IdealAnswer)


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.get("/health")
async def health():
    return {"status": "ok", "providers": llm.provider_names}


def extract_pdf_text(data: bytes) -> str:
    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages[:12]:
            parts.append(page.extract_text(x_tolerance=1.5, y_tolerance=3) or "")
    text = "\n".join(parts)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


RESUME_EXAMPLE = """{
  "summary": "2-3 sentence professional summary",
  "skills": ["Python", "React"],
  "projects": [{"name": "", "description": "", "tech": ["Node.js"]}],
  "experience": [{"role": "", "company": "", "duration": "", "highlights": [""]}],
  "education": [{"degree": "", "institution": "", "year": ""}]
}"""


@app.post("/parse-resume", dependencies=[Depends(require_key)])
async def parse_resume(file: UploadFile = File(...)):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(422, "That file is not a valid PDF.")
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "PDF is too large (max 10MB).")
    try:
        text = await run_in_threadpool(extract_pdf_text, data)
    except Exception as e:  # corrupt / encrypted PDFs
        log.warning("pdf extraction failed: %r", e)
        raise HTTPException(422, "Could not read this PDF. It may be corrupted or password protected.")
    if len(text) < 60:
        raise HTTPException(422, "No readable text found. Scanned/image-only PDFs are not supported - export a text-based PDF.")

    prompt = (
        "Extract structured data from the resume text below.\n"
        "Rules: use ONLY information present in the text, never invent facts. "
        "'skills' is a flat list of individual technical skills, tools and concepts (no sentences). "
        "Each project/experience description must be concise (max 2 sentences / 4 bullets). "
        "'summary' is a 2-3 sentence professional summary based on the resume.\n\n"
        f"RESUME TEXT:\n\"\"\"\n{text[:12000]}\n\"\"\""
    )
    warning = None
    try:
        parsed = await llm.generate_json(prompt, ParsedResume, example=RESUME_EXAMPLE, temperature=0.1)
    except LLMError as e:
        log.error("resume LLM parse failed, degrading to lexicon: %s", e)
        parsed = ParsedResume(summary=text[:300].replace("\n", " "))
        warning = "AI parsing was unavailable; only skills were detected automatically."

    skills = {normalize_skill(s) for s in parsed.skills if s}
    for p in parsed.projects:
        skills |= {normalize_skill(t) for t in p.tech if t}
    skills |= detect_skills(text)
    # Preserve the model's original casing where possible, add detected extras.
    seen = {normalize_skill(s) for s in parsed.skills}
    merged = list(dict.fromkeys(parsed.skills)) + [s for s in sorted(skills) if s not in seen and s]
    parsed.skills = [s for s in merged if s]
    return {"raw_text": text, "parsed": parsed.model_dump(), "warning": warning}


@app.post("/match", dependencies=[Depends(require_key)])
async def match(req: MatchRequest):
    jd_text = req.job_description
    warnings: list[str] = []

    # 1) JD skill set = lexicon scan  U  LLM-extracted skills (both normalized)
    jd_skills = detect_skills(jd_text)
    try:
        extracted = await llm.generate_json(
            "List the technical skills, tools, languages, frameworks and CS concepts named in this job description. "
            "Short names only (e.g. 'React', 'PostgreSQL', 'System Design'); no soft skills, no sentences.\n\n"
            f"JOB DESCRIPTION:\n\"\"\"\n{jd_text[:8000]}\n\"\"\"",
            JDSkills,
            example='{"required_skills": ["Python"], "preferred_skills": ["Docker"]}',
            temperature=0.0,
        )
        for s in extracted.required_skills + extracted.preferred_skills:
            n = normalize_skill(s)
            if n and len(n) <= 40 and len(n.split()) <= 4:
                jd_skills.add(n)
    except LLMError:
        warnings.append("LLM skill extraction unavailable; used keyword detection only.")
    if not jd_skills:
        raise HTTPException(422, "No recognizable skills were found in this job description. Paste the full requirements section.")

    # 2) Resume skill set
    r = req.resume
    resume_skills = {normalize_skill(s) for s in r.skills if s}
    for p in r.projects:
        resume_skills |= {normalize_skill(t) for t in p.tech if t}
    resume_skills |= detect_skills(req.resume_text)
    resume_skills.discard("")

    # 3) Deterministic score - NO LLM math
    result = compute_match(jd_skills, resume_skills, req.resume_text)

    # 4) LLM for qualitative analysis only
    resume_brief = (
        f"Summary: {r.summary}\nSkills: {', '.join(r.skills[:40])}\n"
        f"Experience: {'; '.join(f'{e.role} at {e.company}' for e in r.experience[:5])}\n"
        f"Projects: {'; '.join(p.name for p in r.projects[:5])}"
    )
    prompt = (
        "You are a career coach. A deterministic algorithm already compared a candidate's resume with a job description. "
        "Do NOT compute or mention any percentage or score. Use the lists as given.\n\n"
        f"MATCHED SKILLS: {', '.join(result['matched_skills']) or 'none'}\n"
        f"MISSING SKILLS: {', '.join(result['missing_skills']) or 'none'}\n\n"
        f"CANDIDATE RESUME:\n{resume_brief}\n\n"
        f"JOB DESCRIPTION (excerpt):\n{jd_text[:3500]}\n\n"
        "Write: a 2-3 sentence 'summary' of fit; up to 6 'gaps' (most important missing skills, each with 'why_it_matters' "
        "for THIS job and a concrete 'how_to_close' in one sentence); 'missing_keywords' (ATS keywords to add to the resume, "
        "only where truthful); and 4-6 specific 'resume_tips' to improve the resume for this job."
    )
    try:
        analysis = await llm.generate_json(
            prompt, GapAnalysis,
            example='{"summary": "", "gaps": [{"skill": "", "why_it_matters": "", "how_to_close": ""}], '
                    '"missing_keywords": [""], "resume_tips": [""]}',
            temperature=0.3,
        )
    except LLMError:
        warnings.append("AI gap analysis is unavailable right now; showing the deterministic result only.")
        analysis = GapAnalysis(
            summary=f"You match {len(result['matched_skills'])} of {len(jd_skills)} skills detected in this job description.",
            gaps=[Gap(skill=s) for s in result["missing_skills"][:6]],
            missing_keywords=result["missing_skills"][:10],
        )
    return {**result, "jd_skills": sorted(jd_skills), "analysis": analysis.model_dump(), "warnings": warnings}


TYPE_GUIDE = {
    "Technical": "core technical knowledge, practical problem solving, debugging, trade-offs, and short coding/algorithm reasoning questions",
    "Behavioral": "past experiences in STAR format (situation, task, action, result): teamwork, conflict, failure, ownership, learning",
    "System Design": "designing scalable systems: requirements, APIs, data modeling, scaling, caching, consistency, failure handling",
    "HR": "motivation, career goals, strengths/weaknesses, culture fit, salary/availability style questions, why this role",
}
DIFF_GUIDE = {
    "Easy": "fundamentals; suitable for a fresher or intern",
    "Medium": "applied, scenario-based; suitable for 1-3 years of experience",
    "Hard": "deep, multi-layered, edge cases and trade-offs; suitable for a strong senior candidate",
}


@app.post("/generate-questions", dependencies=[Depends(require_key)])
async def generate_questions(req: GenerateRequest):
    n = req.num_questions
    gaps = [g for g in dict.fromkeys(g.strip() for g in req.skill_gaps if g.strip())][:12]
    gap_n = min(n, math.ceil(0.6 * n)) if gaps else 0

    gap_block = ""
    if gaps:
        gap_block = (
            f"\nCANDIDATE SKILL GAPS (skills the job needs that the candidate lacks): {', '.join(gaps)}\n"
            f"At least {gap_n} of the {n} questions MUST probe these gaps (set targets_gap=true and put the gap in skill_focus). "
            "For Behavioral/HR interviews, frame gap questions as 'how would you ramp up on X' or 'tell me about a time you had to learn something new like X'.\n"
        )
    strengths = ", ".join(req.candidate_skills[:15])
    prompt = (
        f"Create exactly {n} mock interview questions for a candidate applying as: {req.role}.\n"
        f"Interview type: {req.interview_type} - focus on {TYPE_GUIDE[req.interview_type]}.\n"
        f"Difficulty: {req.difficulty} - {DIFF_GUIDE[req.difficulty]}.\n"
        f"{gap_block}"
        + (f"Candidate's existing skills (use for the remaining questions): {strengths}\n" if strengths else "")
        + (f"Candidate background: {req.resume_summary[:600]}\n" if req.resume_summary else "")
        + "\nRules: each question is self-contained, specific, answerable verbally in 2-4 minutes, and distinct from the others. "
        "Order them from warm-up to hardest. 'topic' is a 2-4 word label, 'skill_focus' is the single main skill/competency tested, "
        "'hint' is one short nudge that does NOT reveal the answer."
    )

    def check(obj: QuestionSet):
        valid = [q for q in obj.questions if len(q.question) >= 15]
        if len(valid) < n:
            raise ValueError(f"You returned {len(valid)} valid questions but exactly {n} are required")
        obj.questions = valid

    qs = await llm.generate_json(
        prompt, QuestionSet,
        example='{"questions": [{"question": "", "topic": "", "skill_focus": "", "targets_gap": false, "hint": ""}]}',
        temperature=0.6, post_validate=check,
    )
    seen, out = set(), []
    for q in qs.questions:
        key = q.question.lower()[:80]
        if key in seen:
            continue
        seen.add(key)
        out.append(q.model_dump())
    return {"questions": out[:n]}


@app.post("/evaluate-answer", dependencies=[Depends(require_key)])
async def evaluate_answer(req: EvaluateRequest):
    answer = req.answer.strip()
    blank = len(answer) < 3
    mode_note = {
        "voice": "The answer was dictated by voice, so ignore missing punctuation/capitalization and judge mainly substance and structure.",
        "code": "The answer may contain code or pseudocode: judge correctness, clarity, complexity analysis and edge cases.",
        "text": "",
    }[req.input_mode]
    prompt = (
        f"You are a senior interviewer for a {req.role} role running a {req.interview_type} interview at {req.difficulty} difficulty. "
        "Evaluate the candidate's answer strictly but constructively.\n\n"
        f"QUESTION: {req.question}\n"
        + (f"SKILL BEING TESTED: {req.skill_focus}\n" if req.skill_focus else "")
        + f"CANDIDATE ANSWER:\n\"\"\"\n{answer[:6000] if not blank else '(no answer given)'}\n\"\"\"\n{mode_note}\n\n"
        "Scoring rubric for 'score' (0-10, one decimal): 0-2 empty or irrelevant; 3-4 weak/major gaps; 5-6 partially correct, shallow; "
        "7-8 good and mostly complete; 9-10 excellent, precise, with trade-offs/examples. Calibrate to the stated difficulty.\n"
        "Return: 'summary' (2 sentences of overall feedback); 'strengths' (1-4 specific items, quote or reference what they said); "
        "'improvements' (2-4 specific, actionable items); 'ideal_answer' with 'outline' (4-6 ordered steps of a model answer), "
        "'key_points' (4-6 essential points a great answer includes) and 'sample_answer' (a concise model answer, max 150 words); "
        "'covered_points' = the key_points the candidate addressed, 'missed_points' = the key_points they missed (copy the wording exactly)."
    )

    def check(ev: Evaluation):
        if not ev.ideal_answer.outline or not ev.ideal_answer.key_points:
            raise ValueError("ideal_answer.outline and ideal_answer.key_points must be non-empty")
        if not ev.summary:
            raise ValueError("summary must be non-empty")

    ev = await llm.generate_json(
        prompt, Evaluation,
        example='{"score": 7.5, "summary": "", "strengths": [""], "improvements": [""], '
                '"covered_points": [""], "missed_points": [""], '
                '"ideal_answer": {"outline": [""], "key_points": [""], "sample_answer": ""}}',
        temperature=0.2, post_validate=check,
    )
    if blank:
        ev.score = 0.0
        ev.strengths = []
        ev.covered_points = []
        ev.missed_points = ev.ideal_answer.key_points
        ev.summary = "No answer was provided for this question. " + ev.summary
    return ev.model_dump()
