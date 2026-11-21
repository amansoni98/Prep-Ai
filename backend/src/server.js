require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const axios = require('axios');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { auth, signToken } = require('./middleware/auth');
const { User, Resume, JobDescription, Interview } = require('./models/Database');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const validId = (id) => mongoose.isValidObjectId(id);
const str = (v, max) => String(v ?? '').trim().slice(0, max);

const app = express();
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '1mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    cb(ok ? null : new HttpError(415, 'Only PDF files are supported'), ok);
  },
});

// ---------------------------------------------------------------- AI client
const ai = axios.create({
  baseURL: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  timeout: 150000,
  headers: process.env.AI_SERVICE_KEY ? { 'x-service-key': process.env.AI_SERVICE_KEY } : {},
});

async function callAi(path, body) {
  try {
    const { data } = await ai.post(path, body);
    return data;
  } catch (err) {
    if (err.response) {
      const d = err.response.data;
      const msg = typeof d?.detail === 'string' ? d.detail : 'The AI service returned an error.';
      const s = err.response.status;
      throw new HttpError([413, 422, 503].includes(s) ? s : 502, msg);
    }
    throw new HttpError(503, 'AI service is unreachable. Make sure it is running.');
  }
}

// ---------------------------------------------------------------- Auth
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email });

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/register', h(async (req, res) => {
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 160).toLowerCase();
  const password = String(req.body.password ?? '');
  if (name.length < 2) throw new HttpError(400, 'Please enter your name');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email');
  if (password.length < 8 || password.length > 128) throw new HttpError(400, 'Password must be 8-128 characters');
  if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists');
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: signToken(user._id), user: publicUser(user) });
}));

app.post('/api/auth/login', h(async (req, res) => {
  const email = str(req.body.email, 160).toLowerCase();
  const password = String(req.body.password ?? '');
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  res.json({ token: signToken(user._id), user: publicUser(user) });
}));

app.get('/api/auth/me', auth, h(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Account not found');
  res.json({ user: publicUser(user) });
}));

// ---------------------------------------------------------------- Resume
app.post('/api/resume/upload', auth, upload.single('resume'), h(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Attach a PDF in the "resume" field');
  if (req.file.buffer.subarray(0, 4).toString() !== '%PDF') throw new HttpError(422, 'That file is not a valid PDF');
  const form = new FormData();
  form.append('file', new Blob([req.file.buffer], { type: 'application/pdf' }), req.file.originalname);
  const data = await callAi('/parse-resume', form);
  const resume = await Resume.create({
    userId: req.userId,
    fileName: req.file.originalname,
    rawText: data.raw_text,
    warning: data.warning || undefined,
    parsed: data.parsed,
  });
  const out = resume.toObject();
  delete out.rawText;
  res.status(201).json({ resume: out });
}));

app.get('/api/resume/latest', auth, h(async (req, res) => {
  const resume = await Resume.findOne({ userId: req.userId }).sort({ createdAt: -1 }).select('-rawText').lean();
  res.json({ resume });
}));

// ---------------------------------------------------------------- Job descriptions
const mapGap = (g) => ({ skill: g.skill, whyItMatters: g.why_it_matters, howToClose: g.how_to_close });

app.post('/api/jd/analyze', auth, h(async (req, res) => {
  const text = str(req.body.text, 20000);
  const title = str(req.body.title, 160) || 'Untitled role';
  if (text.length < 50) throw new HttpError(400, 'Paste the full job description (at least 50 characters)');
  const resume = await Resume.findOne({ userId: req.userId }).sort({ createdAt: -1 });
  if (!resume) throw new HttpError(400, 'Upload your resume first so we can compare it');

  const data = await callAi('/match', {
    resume: resume.parsed,
    resume_text: (resume.rawText || '').slice(0, 20000),
    job_description: text,
  });
  const a = data.analysis || {};
  const jd = await JobDescription.create({
    userId: req.userId,
    resumeId: resume._id,
    title,
    text,
    matchScore: data.match_score,
    matchedSkills: data.matched_skills,
    missingSkills: data.missing_skills,
    jdSkills: data.jd_skills,
    warnings: data.warnings,
    analysis: {
      summary: a.summary,
      gaps: (a.gaps || []).map(mapGap),
      missingKeywords: a.missing_keywords,
      resumeTips: a.resume_tips,
    },
  });
  res.status(201).json({ jd });
}));

app.get('/api/jd/latest', auth, h(async (req, res) => {
  res.json({ jd: await JobDescription.findOne({ userId: req.userId }).sort({ createdAt: -1 }).lean() });
}));

app.get('/api/jd', auth, h(async (req, res) => {
  const list = await JobDescription.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(10)
    .select('title matchScore missingSkills createdAt').lean();
  res.json({ items: list });
}));

app.get('/api/jd/:id', auth, h(async (req, res) => {
  if (!validId(req.params.id)) throw new HttpError(404, 'Not found');
  const jd = await JobDescription.findOne({ _id: req.params.id, userId: req.userId }).lean();
  if (!jd) throw new HttpError(404, 'Not found');
  res.json({ jd });
}));

// ---------------------------------------------------------------- Interviews
const TYPES = ['Technical', 'Behavioral', 'System Design', 'HR'];
const LEVELS = ['Easy', 'Medium', 'Hard'];

app.post('/api/interviews', auth, h(async (req, res) => {
  const b = req.body || {};
  const role = str(b.role, 120);
  if (role.length < 2) throw new HttpError(400, 'Target role is required');
  if (!TYPES.includes(b.interviewType)) throw new HttpError(400, 'Invalid interview type');
  if (!LEVELS.includes(b.difficulty)) throw new HttpError(400, 'Invalid difficulty');
  const num = Math.min(10, Math.max(3, parseInt(b.numQuestions, 10) || 5));
  const timed = !!b.timed;
  const seconds = Math.min(900, Math.max(30, parseInt(b.secondsPerQuestion, 10) || 120));
  const useGaps = !!b.useGaps;

  let gaps = [], candidateSkills = [], resumeSummary = '', resumeId, jdId;
  if (useGaps) {
    const [resume, jd] = await Promise.all([
      Resume.findOne({ userId: req.userId }).sort({ createdAt: -1 }).lean(),
      JobDescription.findOne({ userId: req.userId }).sort({ createdAt: -1 }).lean(),
    ]);
    if (resume) {
      resumeId = resume._id;
      candidateSkills = resume.parsed?.skills || [];
      resumeSummary = resume.parsed?.summary || '';
    }
    if (jd) {
      jdId = jd._id;
      gaps = jd.missingSkills || [];
    }
  }

  const data = await callAi('/generate-questions', {
    role,
    interview_type: b.interviewType,
    difficulty: b.difficulty,
    num_questions: num,
    skill_gaps: gaps,
    candidate_skills: candidateSkills,
    resume_summary: resumeSummary,
  });

  const interview = await Interview.create({
    userId: req.userId,
    config: {
      role, interviewType: b.interviewType, difficulty: b.difficulty,
      useGaps, timed, secondsPerQuestion: seconds, resumeId, jdId,
    },
    skillGaps: gaps,
    questions: data.questions.map((q) => ({
      text: q.question, topic: q.topic, skillFocus: q.skill_focus, targetsGap: !!q.targets_gap, hint: q.hint,
    })),
  });
  res.status(201).json({ interview });
}));

app.get('/api/interviews', auth, h(async (req, res) => {
  const items = await Interview.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ items });
}));

app.get('/api/interviews/:id', auth, h(async (req, res) => {
  if (!validId(req.params.id)) throw new HttpError(404, 'Interview not found');
  const interview = await Interview.findOne({ _id: req.params.id, userId: req.userId }).lean();
  if (!interview) throw new HttpError(404, 'Interview not found');
  res.json({ interview });
}));

app.delete('/api/interviews/:id', auth, h(async (req, res) => {
  if (!validId(req.params.id)) throw new HttpError(404, 'Interview not found');
  const r = await Interview.deleteOne({ _id: req.params.id, userId: req.userId });
  if (!r.deletedCount) throw new HttpError(404, 'Interview not found');
  res.json({ ok: true });
}));

app.post('/api/interviews/:id/answer', auth, h(async (req, res) => {
  if (!validId(req.params.id)) throw new HttpError(404, 'Interview not found');
  const iv = await Interview.findOne({ _id: req.params.id, userId: req.userId });
  if (!iv) throw new HttpError(404, 'Interview not found');

  const idx = Number(req.body.questionIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= iv.questions.length) throw new HttpError(400, 'Invalid question index');
  if (iv.answers.some((a) => a.questionIndex === idx)) throw new HttpError(409, 'This question was already answered');

  const answer = String(req.body.answer ?? '').slice(0, 8000);
  const inputMode = ['text', 'code', 'voice'].includes(req.body.inputMode) ? req.body.inputMode : 'text';
  const timeTaken = Math.max(0, Math.min(7200, parseInt(req.body.timeTaken, 10) || 0));
  const q = iv.questions[idx];

  const ev = await callAi('/evaluate-answer', {
    question: q.text,
    answer,
    role: iv.config.role,
    interview_type: iv.config.interviewType,
    difficulty: iv.config.difficulty,
    skill_focus: q.skillFocus || '',
    input_mode: inputMode,
  });
  const evaluation = {
    score: ev.score,
    summary: ev.summary,
    strengths: ev.strengths,
    improvements: ev.improvements,
    coveredPoints: ev.covered_points,
    missedPoints: ev.missed_points,
    ideal: {
      outline: ev.ideal_answer?.outline,
      keyPoints: ev.ideal_answer?.key_points,
      sampleAnswer: ev.ideal_answer?.sample_answer,
    },
  };

  // Atomic guard against double-submit of the same question.
  let updated = await Interview.findOneAndUpdate(
    { _id: iv._id, userId: req.userId, 'answers.questionIndex': { $ne: idx } },
    { $push: { answers: { questionIndex: idx, answer, inputMode, timeTaken, evaluation } } },
    { new: true }
  );
  if (!updated) throw new HttpError(409, 'This question was already answered');

  if (updated.answers.length >= updated.questions.length && updated.status !== 'completed') {
    const avg = updated.answers.reduce((s, a) => s + (a.evaluation?.score || 0), 0) / updated.answers.length;
    updated.overallScore = Math.round(avg * 100) / 10; // avg(0-10) -> 0-100, 1 decimal
    updated.status = 'completed';
    updated.completedAt = new Date();
    updated = await updated.save();
  }
  res.json({ evaluation, interview: updated });
}));

// ---------------------------------------------------------------- Analytics
app.get('/api/analytics/summary', auth, h(async (req, res) => {
  const userId = req.userId;
  const [interviews, jds, resumeCount] = await Promise.all([
    Interview.find({ userId }).sort({ createdAt: 1 }).lean(),
    JobDescription.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
    Resume.countDocuments({ userId }),
  ]);
  const completed = interviews.filter((i) => i.status === 'completed');
  const avgReadiness = completed.length
    ? Math.round((completed.reduce((s, i) => s + (i.overallScore || 0), 0) / completed.length) * 10) / 10
    : null;

  // Gap ranking: JD misses (latest 3 analyses) + weak interview answers (< 6/10)
  const gaps = new Map();
  const bump = (name, field) => {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return;
    const e = gaps.get(key) || { skill: String(name).trim(), jdMisses: 0, weakAnswers: 0 };
    e[field] += 1;
    gaps.set(key, e);
  };
  jds.slice(0, 3).forEach((jd) => (jd.missingSkills || []).forEach((s) => bump(s, 'jdMisses')));
  completed.forEach((i) =>
    (i.answers || []).forEach((a) => {
      if ((a.evaluation?.score ?? 10) < 6) bump(i.questions?.[a.questionIndex]?.skillFocus, 'weakAnswers');
    })
  );
  const topGaps = [...gaps.values()]
    .map((g) => ({ ...g, weight: g.jdMisses * 2 + g.weakAnswers }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);

  const latest = jds[0];
  res.json({
    totalInterviews: interviews.length,
    completedInterviews: completed.length,
    avgReadiness,
    bestScore: completed.length ? Math.max(...completed.map((i) => i.overallScore || 0)) : null,
    hasResume: resumeCount > 0,
    latestMatch: latest
      ? { score: latest.matchScore, title: latest.title, createdAt: latest.createdAt, missingCount: (latest.missingSkills || []).length }
      : null,
    topGaps,
    trend: completed.map((i) => ({
      id: i._id, date: i.completedAt || i.createdAt, score: i.overallScore,
      role: i.config.role, type: i.config.interviewType, difficulty: i.config.difficulty,
    })),
    recent: interviews.slice(-5).reverse().map((i) => ({
      id: i._id, role: i.config.role, type: i.config.interviewType, difficulty: i.config.difficulty,
      status: i.status, score: i.overallScore, answered: i.answers.length, total: i.questions.length, createdAt: i.createdAt,
    })),
  });
}));

// ---------------------------------------------------------------- Errors
app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'PDF is too large (max 8MB)' : err.message;
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: msg });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await connectDB();
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`[api] listening on :${port}`));
}

if (require.main === module) {
  start().catch((e) => {
    console.error('[fatal]', e.message);
    process.exit(1);
  });
}

module.exports = app;
