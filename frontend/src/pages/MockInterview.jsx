import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, Bot, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, Code2, Lightbulb, Maximize2,
  Mic, MicOff, Minimize2, RotateCcw, Send, SkipForward, Sparkles, Timer, Type, User, Zap,
} from 'lucide-react';
import api, { apiError } from '../api';
import { Chip, ErrorBanner, ScoreGauge, Spinner, cx, scoreText, scoreTone } from '../components/ui';

const SpeechRecognitionAPI = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const mmss = (s) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;

/* ---------- hooks ---------- */
function useTypewriter(text, enabled, speed = 12) {
  const [n, setN] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) { setN(text.length); return undefined; }
    setN(0);
    const id = setInterval(() => setN((v) => { if (v >= text.length) { clearInterval(id); return v; } return v + 1; }), speed);
    return () => clearInterval(id);
  }, [text, enabled, speed]);
  return { shown: text.slice(0, n), done: n >= text.length, skip: () => setN(text.length) };
}

/* ---------- small presentational parts ---------- */
function Avatar({ state = 'idle', size = 44 }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {state !== 'idle' && <span className="absolute inset-0 animate-ring rounded-full bg-brand-500/50" />}
      <div className="relative grid h-full w-full place-items-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-lg shadow-brand-500/30">
        <Bot style={{ width: size * 0.5, height: size * 0.5 }} />
      </div>
      <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Aria is thinking">
      {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-dot rounded-full bg-brand-500" style={{ animationDelay: `${i * 0.16}s` }} />)}
    </span>
  );
}

function Stepper({ total, current, answers, maxReachable, onGo }) {
  return (
    <ol className="flex items-center" aria-label="Interview progress">
      {Array.from({ length: total }).map((_, i) => {
        const a = answers.find((x) => x.questionIndex === i);
        const reachable = i <= maxReachable;
        const tone = a ? scoreTone(a.evaluation.score) : null;
        return (
          <li key={i} className={cx('flex items-center', i < total - 1 && 'flex-1')}>
            <button
              disabled={!reachable} onClick={() => onGo(i)} aria-label={`Question ${i + 1}${a ? `, scored ${a.evaluation.score}` : ''}`}
              aria-current={i === current ? 'step' : undefined}
              className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-all',
                i === current && 'ring-4 ring-brand-500/25',
                a ? (tone === 'green' ? 'bg-emerald-500 text-white' : tone === 'amber' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white')
                  : i === current ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                reachable ? 'cursor-pointer hover:scale-110' : 'cursor-not-allowed opacity-70')}
            >
              {a ? a.evaluation.score.toFixed(0) : i + 1}
            </button>
            {i < total - 1 && <div className="mx-1.5 h-0.5 flex-1 overflow-hidden rounded bg-slate-200 dark:bg-slate-800"><div className={cx('h-full bg-brand-500 transition-all duration-700', i < maxReachable ? 'w-full' : 'w-0')} /></div>}
          </li>
        );
      })}
    </ol>
  );
}

function TimerRing({ elapsed, limit }) {
  const ratio = Math.min(1, elapsed / limit);
  const over = elapsed > limit;
  const r = 20, c = 2 * Math.PI * r;
  const color = over ? 'stroke-rose-500' : ratio > 0.8 ? 'stroke-amber-500' : 'stroke-brand-500';
  const msg = over ? 'Over time — wrap up your thought' : ratio > 0.8 ? 'Time to wrap up' : ratio > 0.5 ? 'Start shaping a conclusion' : "You're on pace";
  return (
    <div className="flex items-center gap-3" role="timer" aria-live="off">
      <div className="relative h-12 w-12">
        <svg viewBox="0 0 48 48" className="-rotate-90">
          <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className="stroke-slate-200 dark:stroke-slate-800" />
          <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * ratio} className={cx('transition-all duration-1000 ease-linear', color)} />
        </svg>
        <Timer className="absolute inset-0 m-auto h-4 w-4 text-slate-400" />
      </div>
      <div>
        <div className={cx('text-lg font-bold tabular-nums leading-none', over ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white')}>{over ? '+' : ''}{mmss(over ? elapsed - limit : limit - elapsed)}</div>
        <div className="mt-1 text-xs text-slate-500">{msg}</div>
      </div>
    </div>
  );
}

function Bubble({ who, children, className }) {
  const ai = who === 'ai';
  return (
    <div className={cx('flex gap-3 animate-slide-up', !ai && 'flex-row-reverse')}>
      {!ai && <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><User className="h-5 w-5" /></div>}
      <div className={cx('max-w-full rounded-2xl px-5 py-4 sm:max-w-[85%]', ai ? 'rounded-tl-sm border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900' : 'rounded-tr-sm bg-brand-600 text-white', className)}>{children}</div>
    </div>
  );
}

function FeedbackPanel({ ans, question }) {
  const ev = ans.evaluation;
  const covered = new Set((ev.coveredPoints || []).map((p) => p.toLowerCase().trim()));
  const isCovered = (p) => covered.has(p.toLowerCase().trim());
  return (
    <div className="animate-slide-up space-y-4">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-6">
          <ScoreGauge value={ev.score} max={10} size={130} />
          <div className="min-w-[220px] flex-1">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Sparkles className="h-3.5 w-3.5 text-brand-500" /> Aria's coaching</div>
            <p className="leading-relaxed text-slate-700 dark:text-slate-300">{ev.summary}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Strengths</h4>
            {ev.strengths.length ? <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">{ev.strengths.map((s, i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{s}</li>)}</ul> : <p className="text-sm text-slate-500">Nothing to highlight yet.</p>}
          </div>
          <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-500/10">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300"><Zap className="h-4 w-4" /> Areas to improve</h4>
            <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">{ev.improvements.map((s, i) => <li key={i} className="flex gap-2"><ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{s}</li>)}</ul>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold dark:border-slate-800">Side-by-side: your answer vs. ideal blueprint</div>
        <div className="grid divide-y divide-slate-100 dark:divide-slate-800 md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="p-5">
            <h4 className="label">Your answer {ans.inputMode === 'voice' && <Chip className="ml-1 normal-case"><Mic className="h-3 w-3" /> voice</Chip>}</h4>
            <p className={cx('max-h-72 overflow-auto whitespace-pre-wrap text-sm leading-relaxed', ans.inputMode === 'code' && 'rounded-lg bg-slate-50 p-3 font-mono text-[13px] dark:bg-slate-800/60')}>
              {ans.answer || <em className="text-slate-400">No answer submitted</em>}
            </p>
            {(ev.missedPoints?.length > 0) && (
              <div className="mt-4">
                <h4 className="label !text-rose-600 dark:!text-rose-400">What you missed</h4>
                <ul className="space-y-1 text-sm">{ev.missedPoints.map((p, i) => <li key={i} className="flex gap-2 text-slate-600 dark:text-slate-400"><Circle className="mt-1 h-3 w-3 shrink-0 text-rose-400" />{p}</li>)}</ul>
              </div>
            )}
          </div>
          <div className="bg-brand-50/50 p-5 dark:bg-brand-500/5">
            <h4 className="label">Ideal answer outline</h4>
            <ol className="space-y-2 text-sm">
              {ev.ideal.outline.map((s, i) => (
                <li key={i} className="flex gap-2.5"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{i + 1}</span><span className="text-slate-700 dark:text-slate-300">{s}</span></li>
              ))}
            </ol>
            <h4 className="label mt-5">Key points</h4>
            <ul className="space-y-1.5 text-sm">
              {ev.ideal.keyPoints.map((p, i) => (
                <li key={i} className="flex gap-2">
                  {isCovered(p) ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />}
                  <span className={isCovered(p) ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500'}>{p}</span>
                </li>
              ))}
            </ul>
            {ev.ideal.sampleAnswer && (
              <details className="mt-4 rounded-xl border border-brand-200 bg-white p-3 text-sm dark:border-brand-500/30 dark:bg-slate-900">
                <summary className="cursor-pointer font-semibold text-brand-700 dark:text-brand-300">Show a model answer</summary>
                <p className="mt-2 leading-relaxed text-slate-700 dark:text-slate-300">{ev.ideal.sampleAnswer}</p>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Summary({ iv, onReview }) {
  const navigate = useNavigate();
  const rows = iv.questions.map((q, i) => ({ q, a: iv.answers.find((x) => x.questionIndex === i) }));
  const scored = rows.filter((r) => r.a).sort((a, b) => b.a.evaluation.score - a.a.evaluation.score);
  const best = scored[0], worst = scored[scored.length - 1];
  const avgTime = iv.answers.length ? Math.round(iv.answers.reduce((s, a) => s + (a.timeTaken || 0), 0) / iv.answers.length) : 0;
  const verdict = iv.overallScore >= 75 ? 'Interview-ready — polish the finer points.' : iv.overallScore >= 50 ? 'Solid foundation — focus on the missed key points.' : 'Keep practising — review the blueprints below and retry.';
  return (
    <div className="mx-auto max-w-3xl animate-slide-up space-y-5">
      <div className="card p-8 text-center">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">Session complete</div>
        <h1 className="text-2xl font-bold">{iv.config.role} · {iv.config.interviewType}</h1>
        <div className="my-6"><ScoreGauge value={iv.overallScore} max={100} suffix="%" size={190} stroke={16} decimals={0} caption="readiness" /></div>
        <p className="text-slate-600 dark:text-slate-400">{verdict}</p>
        <div className="mt-5 flex justify-center gap-6 text-sm text-slate-500"><span>{iv.answers.length} answered</span><span>Avg {mmss(avgTime)} / question</span></div>
      </div>
      <div className="card p-5">
        <h2 className="mb-4 font-semibold">Question breakdown</h2>
        <ul className="space-y-3">
          {rows.map(({ q, a }, i) => (
            <li key={i}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="truncate text-slate-700 dark:text-slate-300">{i + 1}. {q.topic || q.text}</span><span className={cx('font-bold tabular-nums', a && scoreText(a.evaluation.score))}>{a ? a.evaluation.score.toFixed(1) : '—'}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className={cx('h-full rounded-full transition-all duration-1000', a && (scoreTone(a.evaluation.score) === 'green' ? 'bg-emerald-500' : scoreTone(a.evaluation.score) === 'amber' ? 'bg-amber-500' : 'bg-rose-500'))} style={{ width: `${(a?.evaluation.score || 0) * 10}%` }} /></div>
            </li>
          ))}
        </ul>
        {best && worst && best !== worst && (
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-500/10"><div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Strongest</div>{best.q.skillFocus || best.q.topic}</div>
            <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-500/10"><div className="text-xs font-semibold text-rose-700 dark:text-rose-300">Needs most work</div>{worst.q.skillFocus || worst.q.topic}</div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button className="btn btn-secondary" onClick={onReview}><ChevronLeft className="h-4 w-4" /> Review answers</button>
        <Link to="/setup" className="btn btn-primary"><RotateCcw className="h-4 w-4" /> Practice again</Link>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>Dashboard</button>
      </div>
    </div>
  );
}

/* ---------- main page ---------- */
export default function MockInterview() {
  const { id } = useParams();
  const [iv, setIv] = useState(null);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState('');
  const [idx, setIdx] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  const [answer, setAnswer] = useState('');
  const [mode, setMode] = useState('text');
  const [focus, setFocus] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recRef = useRef(null);
  const listeningRef = useRef(false);
  const usedVoice = useRef(false);

  const seen = useRef(new Set());
  const elapsedMap = useRef({});
  const [, tick] = useState(0);
  const feedbackRef = useRef(null);

  // load
  useEffect(() => {
    api.get(`/interviews/${id}`).then(({ data }) => {
      const d = data.interview;
      setIv(d);
      const next = d.questions.findIndex((_, i) => !d.answers.some((a) => a.questionIndex === i));
      setIdx(next === -1 ? 0 : next);
      setShowSummary(d.status === 'completed');
      d.answers.forEach((a) => seen.current.add(a.questionIndex));
    }).catch((e) => setFatal(apiError(e)));
  }, [id]);

  const total = iv?.questions.length || 0;
  const question = iv?.questions[idx];
  const ans = iv?.answers.find((a) => a.questionIndex === idx);
  const firstUnanswered = iv ? iv.questions.findIndex((_, i) => !iv.answers.some((a) => a.questionIndex === i)) : 0;
  const maxReachable = firstUnanswered === -1 ? total - 1 : firstUnanswered;

  const typing = useTypewriter(question?.text || '', !!question && !ans && !seen.current.has(idx));
  useEffect(() => { if (typing.done && question) seen.current.add(idx); }, [typing.done, idx, question]);

  const limit = iv?.config.secondsPerQuestion || 120;
  const timerOn = !!iv && !ans && typing.done && !submitting && !showSummary;
  useEffect(() => {
    if (!timerOn) return undefined;
    const t = setInterval(() => { elapsedMap.current[idx] = (elapsedMap.current[idx] || 0) + 1; tick((n) => n + 1); }, 1000);
    return () => clearInterval(t);
  }, [timerOn, idx]);
  const elapsed = elapsedMap.current[idx] || 0;

  /* voice */
  const stopListening = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    setInterim('');
    try { recRef.current?.stop(); } catch { /* noop */ }
    recRef.current = null;
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI) return;
    const rec = new SpeechRecognitionAPI();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    rec.onresult = (e) => {
      let fin = '', tmp = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t; else tmp += t;
      }
      if (fin) setAnswer((prev) => `${prev && !/\s$/.test(prev) ? `${prev} ` : prev}${fin.trim()} `);
      setInterim(tmp);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setError('Microphone permission was denied. Allow mic access in your browser to use voice.'); stopListening(); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setError(`Voice input error: ${e.error}`);
    };
    // Chrome ends sessions on silence; keep dictating until the user stops.
    rec.onend = () => { if (listeningRef.current) { try { rec.start(); } catch { /* already started */ } } else setListening(false); };
    try {
      rec.start();
      recRef.current = rec;
      listeningRef.current = true;
      usedVoice.current = true;
      setListening(true);
    } catch { setError('Could not start voice input.'); }
  }, [stopListening]);

  useEffect(() => () => { listeningRef.current = false; try { recRef.current?.stop(); } catch { /* noop */ } }, []);
  useEffect(() => { stopListening(); setShowHint(false); }, [idx, stopListening]);
  useEffect(() => { if (!focus) return undefined; const k = (e) => e.key === 'Escape' && setFocus(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [focus]);

  async function submit() {
    if (submitting || !iv) return;
    stopListening();
    setSubmitting(true);
    setError('');
    setFocus(false);
    try {
      const { data } = await api.post(`/interviews/${id}/answer`, {
        questionIndex: idx, answer, timeTaken: elapsedMap.current[idx] || 0,
        inputMode: usedVoice.current ? 'voice' : mode,
      });
      setIv(data.interview);
      setAnswer('');
      usedVoice.current = false;
      setTimeout(() => feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    } catch (e) { setError(apiError(e)); }
    finally { setSubmitting(false); }
  }

  function next() {
    if (idx < total - 1) { setIdx(idx + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else { setShowSummary(true); window.scrollTo({ top: 0 }); }
  }

  function onEditorKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); return; }
    if (mode === 'code' && e.key === 'Tab') {
      e.preventDefault();
      const t = e.target, s = t.selectionStart;
      const v = `${answer.slice(0, s)}  ${answer.slice(t.selectionEnd)}`;
      setAnswer(v);
      requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; });
    }
  }

  const words = useMemo(() => (answer.trim() ? answer.trim().split(/\s+/).length : 0), [answer]);

  if (fatal) return <div className="mx-auto max-w-md py-16 text-center"><ErrorBanner message={fatal} /><Link to="/history" className="btn btn-secondary">Back to history</Link></div>;
  if (!iv) return <div className="grid min-h-[50vh] place-items-center"><Spinner className="h-8 w-8 text-brand-500" /></div>;
  if (showSummary && iv.status === 'completed') return <Summary iv={iv} onReview={() => { setShowSummary(false); setIdx(0); }} />;

  const avatarState = submitting ? 'thinking' : !ans && !typing.done ? 'speaking' : 'idle';

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Header */}
      <div className="card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar state={avatarState} />
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">Aria <span className="font-normal text-slate-500">· AI Interviewer</span></div>
              <div className="text-xs text-slate-500">{avatarState === 'thinking' ? 'Evaluating your answer…' : avatarState === 'speaking' ? 'Asking a question…' : ans ? 'Reviewing with you' : 'Listening'}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="brand">{iv.config.role}</Chip><Chip>{iv.config.interviewType}</Chip><Chip>{iv.config.difficulty}</Chip>
            {iv.config.useGaps && <Chip tone="red">Gap-focused</Chip>}
          </div>
        </div>
        <Stepper total={total} current={idx} answers={iv.answers} maxReachable={maxReachable} onGo={(i) => { setIdx(i); }} />
        <div className="mt-2 text-xs text-slate-500">Question {idx + 1} of {total}{question?.topic && ` · ${question.topic}`}</div>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />

      {/* Conversation */}
      <div className="space-y-5">
        <div className="flex gap-3 animate-slide-up" key={`q${idx}`}>
          <Avatar state={avatarState} />
          <div className="max-w-full flex-1 sm:max-w-[88%]">
            <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900" onClick={() => !typing.done && typing.skip()}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {question.targetsGap && <Chip tone="red">Skill gap</Chip>}
                {question.skillFocus && <Chip>{question.skillFocus}</Chip>}
              </div>
              <p className="text-[17px] font-medium leading-relaxed text-slate-900 dark:text-white">
                {typing.shown}{!typing.done && <span className="ml-0.5 inline-block h-5 w-0.5 translate-y-1 animate-blink bg-brand-500" />}
              </p>
              {!typing.done && <div className="mt-2 text-xs text-slate-400">Click to skip animation</div>}
            </div>
            {question.hint && typing.done && !ans && (
              <div className="mt-2">
                {showHint
                  ? <div className="flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 animate-fade-in dark:bg-amber-500/10 dark:text-amber-200"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />{question.hint}</div>
                  : <button onClick={() => setShowHint(true)} className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400"><Lightbulb className="h-3.5 w-3.5" /> Need a hint?</button>}
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        {!ans && typing.done && (
          <div className={cx('animate-slide-up', focus && 'fixed inset-0 z-50 flex flex-col bg-slate-50/95 p-4 backdrop-blur-md dark:bg-slate-950/95 sm:p-10')}>
            {focus && <h2 className="mb-4 max-w-3xl text-lg font-semibold">{question.text}</h2>}
            <div className={cx('card overflow-hidden', focus && 'flex flex-1 flex-col')}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
                  {[['text', Type, 'Text'], ['code', Code2, 'Code']].map(([m, Icon, label]) => (
                    <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                      className={cx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition', mode === m ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500')}>
                      <Icon className="h-3.5 w-3.5" />{label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {iv.config.timed && <div className="hidden sm:block"><TimerRing elapsed={elapsed} limit={limit} /></div>}
                  <button onClick={() => (listening ? stopListening() : startListening())} disabled={!SpeechRecognitionAPI}
                    title={SpeechRecognitionAPI ? 'Dictate your answer' : 'Voice input is not supported in this browser (try Chrome or Edge)'}
                    className={cx('btn !py-2', listening ? 'bg-rose-600 text-white hover:bg-rose-500' : 'btn-secondary')} aria-pressed={listening}>
                    {listening ? <><span className="flex h-4 items-center gap-0.5">{[0, 1, 2, 3].map((i) => <span key={i} className="h-full w-0.5 origin-center animate-wave rounded bg-white" style={{ animationDelay: `${i * 0.12}s` }} />)}</span> Stop</> : SpeechRecognitionAPI ? <><Mic className="h-4 w-4" /> Dictate</> : <><MicOff className="h-4 w-4" /> No voice</>}
                  </button>
                  <button onClick={() => setFocus(!focus)} className="btn btn-ghost !p-2" aria-label={focus ? 'Exit focus mode' : 'Focus mode'} title={focus ? 'Exit focus (Esc)' : 'Distraction-free mode'}>
                    {focus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {iv.config.timed && <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-800 sm:hidden"><TimerRing elapsed={elapsed} limit={limit} /></div>}
              <textarea
                value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={onEditorKey} disabled={submitting}
                placeholder={mode === 'code' ? '// Write code or pseudocode…  (Tab indents)' : 'Type your answer, or click Dictate and speak it aloud…'}
                spellCheck={mode !== 'code'} aria-label="Your answer"
                className={cx('block w-full resize-y bg-transparent px-5 py-4 leading-relaxed placeholder-slate-400 disabled:opacity-60',
                  mode === 'code' ? 'bg-slate-50 font-mono text-[13px] dark:bg-slate-950/60' : 'text-[15px]', focus ? 'flex-1' : 'min-h-[220px]')}
              />
              {listening && (
                <div className="flex items-center gap-2 border-t border-rose-100 bg-rose-50 px-5 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-500/10 dark:text-rose-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> Listening… <span className="italic opacity-80">{interim}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                <span className="text-xs text-slate-500">{words} words · <kbd className="rounded border border-slate-300 px-1 dark:border-slate-600">Ctrl</kbd>+<kbd className="rounded border border-slate-300 px-1 dark:border-slate-600">Enter</kbd> to submit</span>
                <button onClick={submit} disabled={submitting} className="btn btn-primary">
                  {submitting ? <Spinner className="h-4 w-4" /> : answer.trim() ? <Send className="h-4 w-4" /> : <SkipForward className="h-4 w-4" />}
                  {submitting ? 'Submitting…' : answer.trim() ? 'Submit answer' : 'Skip question'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Evaluating state */}
        {submitting && (
          <>
            {answer.trim() && <Bubble who="user"><p className={cx('whitespace-pre-wrap text-sm', mode === 'code' && 'font-mono text-[13px]')}>{answer}</p></Bubble>}
            <div className="flex gap-3 animate-fade-in"><Avatar state="thinking" /><div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900"><TypingDots /><span className="ml-3 text-sm text-slate-500">Aria is evaluating your answer…</span></div></div>
          </>
        )}

        {/* Feedback */}
        {ans && (
          <div ref={feedbackRef} className="scroll-mt-24 space-y-5">
            <Bubble who="user"><p className={cx('whitespace-pre-wrap text-sm', ans.inputMode === 'code' && 'font-mono text-[13px]')}>{ans.answer || <em className="opacity-80">Skipped</em>}</p></Bubble>
            <FeedbackPanel ans={ans} question={question} />
            <div className="flex items-center justify-between">
              <button className="btn btn-ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronLeft className="h-4 w-4" /> Previous</button>
              <button className="btn btn-primary" onClick={next}>
                {idx < total - 1 ? <>Next question <ChevronRight className="h-4 w-4" /></> : <>Finish & view summary <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
