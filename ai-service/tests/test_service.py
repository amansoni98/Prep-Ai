import io, json
import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app import main
from app.providers import LLMClient, LLMProvider, LLMError, ProviderError, clean_json_text
from app.main import QuestionSet, normalize_skill, detect_skills, compute_match


class Scripted(LLMProvider):
    """Returns queued replies (str) or raises queued ProviderErrors."""
    def __init__(self, name, replies):
        self.name, self.replies, self.calls = name, list(replies), 0
    async def complete(self, system, prompt, *, temperature=0.3, json_mode=True):
        self.calls += 1
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


class Mini(BaseModel):
    x: int


def test_clean_json_variants():
    assert json.loads(clean_json_text('```json\n{"a": 1,}\n```')) == {"a": 1}
    assert json.loads(clean_json_text('Sure! Here you go:\n{"a": [1,2,],}\nHope it helps')) == {"a": [1, 2]}
    assert json.loads(clean_json_text('```{"a":1}')) == {"a": 1}


@pytest.mark.asyncio
async def test_retry_then_success():
    p = Scripted("p", ["not json at all", '```json\n{"x": "oops"}\n```', '{"x": 3}'])
    out = await LLMClient([p]).generate_json("go", Mini)
    assert out.x == 3 and p.calls == 3


@pytest.mark.asyncio
async def test_fallback_provider():
    a = Scripted("a", [ProviderError("down", retryable=False)])
    b = Scripted("b", ['{"x": 1}'])
    out = await LLMClient([a, b]).generate_json("go", Mini)
    assert out.x == 1 and a.calls == 1 and b.calls == 1


@pytest.mark.asyncio
async def test_all_fail_raises_llmerror_not_crash():
    a = Scripted("a", ["junk"] * 3)
    with pytest.raises(LLMError):
        await LLMClient([a]).generate_json("go", Mini)


@pytest.mark.asyncio
async def test_post_validate_count_enforced():
    one = json.dumps({"questions": [{"question": "What is a closure in JS?"}]})
    two = json.dumps({"questions": [{"question": "What is a closure in JS?"}, {"question": "Explain event loop phases."}]})
    p = Scripted("p", [one, two])
    def check(o):
        if len(o.questions) < 2: raise ValueError("need 2")
    out = await LLMClient([p]).generate_json("go", QuestionSet, post_validate=check)
    assert len(out.questions) == 2 and p.calls == 2


def test_normalization_and_detection():
    assert normalize_skill("ReactJS") == "react" == normalize_skill("React.js")
    assert normalize_skill("Node") == "node.js"
    assert normalize_skill("Amazon Web Services") == "aws"
    assert normalize_skill("Apache Kafka") == "kafka"
    assert normalize_skill("Data Structures & Algorithms") == "data structures and algorithms"
    d = detect_skills("We use Node.js, Express.js, PostgreSQL and JavaScript (not Java). C++ a plus. Go to market. Spring is here.")
    assert {"node.js", "express", "postgresql", "javascript", "java", "c++"} <= d
    assert "go" not in d and "c" not in d
    assert "java" in detect_skills("Java developer") and "java" not in detect_skills("only JavaScript here")


def test_match_math_is_deterministic():
    jd = {"python", "react", "docker", "kafka"}
    res = {"python", "react", "sql"}
    out = compute_match(jd, res, "")
    assert out["match_score"] == 50.0
    assert out["matched_skills"] == ["python", "react"] and out["missing_skills"] == ["docker", "kafka"]
    # free-form (non-lexicon) JD skill found literally in resume text
    assert compute_match({"figma plugins"}, set(), "Built Figma plugins for a startup")["match_score"] == 100.0


# ---- API level with a scripted LLM ----
def make_pdf(text):
    import reportlab  # noqa
    from reportlab.pdfgen import canvas
    buf = io.BytesIO(); c = canvas.Canvas(buf)
    y = 800
    for line in text.split("\n"):
        c.drawString(50, y, line); y -= 16
    c.save(); return buf.getvalue()


RESUME = "Aarav Sharma\nSummary: CS student building web apps.\nSkills: Python, React, MongoDB, Node.js, Git\nProject: Chat app using React and Node.js with MongoDB\nEducation: B.Tech Computer Science 2025 IIT"


def client_with(replies):
    prov = Scripted("fake", replies)
    main.llm = LLMClient([prov])
    return TestClient(main.app), prov


def test_parse_resume_and_match_flow():
    pytest.importorskip("reportlab")
    parsed = json.dumps({"summary": "CS student", "skills": ["Python", "ReactJS"], "projects": [{"name": "Chat app", "description": "x", "tech": ["Node"]}],
                         "experience": [], "education": [{"degree": "B.Tech", "institution": "IIT", "year": 2025}]})
    c, _ = client_with([parsed])
    r = c.post("/parse-resume", files={"file": ("cv.pdf", make_pdf(RESUME), "application/pdf")})
    assert r.status_code == 200, r.text
    body = r.json()
    skills = {normalize_skill(s) for s in body["parsed"]["skills"]}
    assert {"python", "react", "mongodb", "git", "node.js"} <= skills
    assert body["parsed"]["education"][0]["year"] == "2025"   # int coerced to str

    jd = "We need a Backend Engineer with Python, Docker, Kubernetes, PostgreSQL, React and AWS experience. Strong CI/CD knowledge."
    extract = json.dumps({"required_skills": ["Python", "Docker"], "preferred_skills": ["Kubernetes"]})
    analysis = "```json\n" + json.dumps({"summary": "Decent fit", "gaps": [{"skill": "docker", "why_it_matters": "deploy", "how_to_close": "build an image"}],
                                          "missing_keywords": ["Docker"], "resume_tips": "Add a deployment project; mention CI"}) + "\n```"
    c, prov = client_with([extract, analysis])
    r = c.post("/match", json={"resume": body["parsed"], "resume_text": body["raw_text"], "job_description": jd})
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["matched_skills"] == ["python", "react"]
    assert set(m["missing_skills"]) == {"aws", "ci/cd", "docker", "kubernetes", "postgresql"}
    assert m["match_score"] == round(100 * 2 / 7, 1)
    assert m["analysis"]["resume_tips"] == ["Add a deployment project", "mention CI"]


def test_match_degrades_when_llm_down():
    c, _ = client_with([ProviderError("x")] * 2)
    r = c.post("/match", json={"resume": {"skills": ["Python"]}, "resume_text": "python", "job_description": "Looking for Python and Docker engineer with great skills."})
    assert r.status_code == 200
    j = r.json()
    assert j["match_score"] == 50.0 and j["warnings"]


def test_generate_and_evaluate():
    qs = json.dumps({"questions": [{"question": f"Question number {i} about Docker?", "topic": "Docker", "skill_focus": "docker", "targets_gap": True, "hint": "h"} for i in range(5)]})
    c, _ = client_with([qs])
    r = c.post("/generate-questions", json={"role": "Backend Dev", "interview_type": "Technical", "difficulty": "Medium", "num_questions": 5, "skill_gaps": ["docker"]})
    assert r.status_code == 200 and len(r.json()["questions"]) == 5

    ev = json.dumps({"score": "8/10", "summary": "Good", "strengths": ["clear"], "improvements": ["more depth"],
                     "ideal_answer": {"outline": ["a", "b"], "key_points": ["k1", "k2"], "sample_answer": "s"}, "covered_points": ["k1"], "missed_points": ["k2"]})
    c, _ = client_with([ev])
    r = c.post("/evaluate-answer", json={"question": "What is Docker?", "answer": "A container runtime that packages apps."})
    assert r.status_code == 200 and r.json()["score"] == 8.0

    c, _ = client_with([ev])  # blank answer is forced to 0 regardless of LLM
    r = c.post("/evaluate-answer", json={"question": "What is Docker?", "answer": "  "})
    assert r.json()["score"] == 0.0 and r.json()["missed_points"] == ["k1", "k2"]


def test_llm_total_failure_is_503_not_500():
    c, _ = client_with(["junk"] * 3)
    r = c.post("/evaluate-answer", json={"question": "What is Docker?", "answer": "something"})
    assert r.status_code == 503


def test_bad_pdf_rejected():
    c, _ = client_with([])
    assert c.post("/parse-resume", files={"file": ("x.pdf", b"hello", "application/pdf")}).status_code == 422
