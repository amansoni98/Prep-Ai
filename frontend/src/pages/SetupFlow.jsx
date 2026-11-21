import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Code2, MessageSquare, Network, Rocket, Target, Timer, Users } from 'lucide-react';
import api, { apiError } from '../api';
import { Chip, ErrorBanner, PageHeader, Spinner, cx } from '../components/ui';

const ROLES = ['Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full-Stack Developer', 'Data Analyst', 'Data Scientist', 'DevOps Engineer', 'Product Manager'];
const TYPES = [
  { v: 'Technical', icon: Code2, d: 'Core concepts, problem solving and coding reasoning.' },
  { v: 'Behavioral', icon: MessageSquare, d: 'STAR-style stories about teamwork, conflict and ownership.' },
  { v: 'System Design', icon: Network, d: 'Architect scalable systems and defend trade-offs.' },
  { v: 'HR', icon: Users, d: 'Motivation, culture fit, goals and career story.' },
];
const LEVELS = [
  { v: 'Easy', d: 'Fundamentals · freshers' },
  { v: 'Medium', d: 'Applied scenarios · 1–3 yrs' },
  { v: 'Hard', d: 'Deep dives & edge cases' },
];
const STEPS = ['Role', 'Type', 'Difficulty', 'Personalize', 'Review'];

function Toggle({ checked, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40', checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700')}>
      <span className={cx('absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}

export default function SetupFlow() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState({
    role: state?.role && state.role !== 'Untitled role' ? state.role : '',
    interviewType: 'Technical', difficulty: 'Medium', numQuestions: 5,
    useGaps: !!state?.useGaps, timed: false, secondsPerQuestion: 120,
  });
  const [ctx, setCtx] = useState({ loaded: false, hasResume: false, gaps: [], jdTitle: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  useEffect(() => {
    Promise.all([api.get('/resume/latest'), api.get('/jd/latest')]).then(([r, j]) => {
      const gaps = j.data.jd?.missingSkills || [];
      setCtx({ loaded: true, hasResume: !!r.data.resume, gaps, jdTitle: j.data.jd?.title || '' });
      setCfg((c) => ({ ...c, useGaps: state?.useGaps !== undefined ? state.useGaps && (gaps.length > 0 || !!r.data.resume) : gaps.length > 0 }));
    }).catch(() => setCtx((c) => ({ ...c, loaded: true })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canGaps = ctx.hasResume || ctx.gaps.length > 0;
  const canNext = step === 0 ? cfg.role.trim().length >= 2 : true;

  async function launch() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/interviews', cfg);
      navigate(`/interview/${data.interview._id}`);
    } catch (e) {
      setError(apiError(e));
      setBusy(false);
    }
  }

  if (busy) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-center animate-fade-in">
        <div>
          <div className="relative mx-auto mb-6 grid h-20 w-20 place-items-center">
            <span className="absolute inset-0 animate-ring rounded-full bg-brand-500/40" />
            <span className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white"><Spinner className="h-8 w-8" /></span>
          </div>
          <h2 className="text-xl font-semibold">Aria is preparing your interview…</h2>
          <p className="mt-1 text-sm text-slate-500">Crafting {cfg.numQuestions} {cfg.difficulty.toLowerCase()} {cfg.interviewType.toLowerCase()} questions{cfg.useGaps && ' around your skill gaps'}. This takes a few seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Set up your mock interview" subtitle="Five quick steps to a fully personalized practice session." />
      <ErrorBanner message={error} onClose={() => setError('')} />

      {/* Stepper */}
      <ol className="mb-8 flex items-center">
        {STEPS.map((s, i) => (
          <li key={s} className={cx('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
            <button disabled={i > step} onClick={() => setStep(i)} className="flex items-center gap-2" aria-current={i === step ? 'step' : undefined}>
              <span className={cx('grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition-all',
                i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-600 text-white ring-4 ring-brand-500/25' : 'bg-slate-200 text-slate-500 dark:bg-slate-800')}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cx('hidden text-sm font-medium sm:block', i === step ? 'text-slate-900 dark:text-white' : 'text-slate-500')}>{s}</span>
            </button>
            {i < STEPS.length - 1 && <div className={cx('mx-3 h-0.5 flex-1 rounded transition-colors', i < step ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-800')} />}
          </li>
        ))}
      </ol>

      <div key={step} className="card animate-slide-up p-6 sm:p-8">
        {step === 0 && (
          <>
            <h2 className="text-xl font-semibold">What role are you preparing for?</h2>
            <p className="mb-5 mt-1 text-sm text-slate-500">The interviewer tailors every question to this role.</p>
            <input autoFocus className="input !py-3 !text-base" placeholder="e.g. Backend Developer Intern" value={cfg.role} maxLength={100}
              onChange={(e) => set({ role: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && canNext && setStep(1)} />
            <div className="mt-4 flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button key={r} onClick={() => set({ role: r })}
                  className={cx('rounded-full border px-3 py-1.5 text-xs font-medium transition', cfg.role === r ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'border-slate-200 text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:text-slate-400')}>{r}</button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-xl font-semibold">Choose an interview type</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {TYPES.map(({ v, icon: Icon, d }) => (
                <button key={v} onClick={() => set({ interviewType: v })}
                  className={cx('flex gap-3 rounded-2xl border-2 p-4 text-left transition-all hover:-translate-y-0.5',
                    cfg.interviewType === v ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 hover:border-brand-300 dark:border-slate-800')}>
                  <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl', cfg.interviewType === v ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}><Icon className="h-5 w-5" /></span>
                  <span><span className="block font-semibold text-slate-900 dark:text-white">{v}</span><span className="text-sm text-slate-500">{d}</span></span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-xl font-semibold">Pick the difficulty</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {LEVELS.map(({ v, d }) => (
                <button key={v} onClick={() => set({ difficulty: v })}
                  className={cx('rounded-2xl border-2 p-4 text-left transition-all', cfg.difficulty === v ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 hover:border-brand-300 dark:border-slate-800')}>
                  <div className="font-semibold text-slate-900 dark:text-white">{v}</div>
                  <div className="text-sm text-slate-500">{d}</div>
                </button>
              ))}
            </div>
            <div className="mt-8">
              <div className="mb-2 flex items-center justify-between"><span className="label !mb-0">Number of questions</span><span className="text-lg font-bold text-brand-600 dark:text-brand-300">{cfg.numQuestions}</span></div>
              <input type="range" min={3} max={10} value={cfg.numQuestions} onChange={(e) => set({ numQuestions: +e.target.value })} className="w-full accent-brand-600" aria-label="Number of questions" />
              <div className="flex justify-between text-xs text-slate-400"><span>3 · quick</span><span>10 · full round</span></div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-xl font-semibold">Personalize & pacing</h2>
            <div className="mt-5 space-y-4">
              <div className={cx('rounded-2xl border-2 p-4 transition-colors', cfg.useGaps ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-800')}>
                <div className="flex items-start gap-3">
                  <Target className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900 dark:text-white">Base questions on my resume & skill gaps</div>
                    <p className="mt-0.5 text-sm text-slate-500">At least 60% of questions will probe the skills your target job needs but your resume lacks.</p>
                    {ctx.loaded && cfg.useGaps && ctx.gaps.length > 0 && (
                      <div className="mt-3"><div className="mb-1 text-xs text-slate-500">Detected gaps{ctx.jdTitle && ` for “${ctx.jdTitle}”`}:</div>
                        <div className="flex flex-wrap gap-1.5">{ctx.gaps.slice(0, 10).map((g) => <Chip key={g} tone="red">{g}</Chip>)}</div></div>
                    )}
                    {ctx.loaded && !canGaps && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">No resume yet. <Link to="/resume" className="font-semibold underline">Upload one</Link> to unlock this.</p>}
                    {ctx.loaded && canGaps && ctx.gaps.length === 0 && <p className="mt-2 text-xs text-slate-500">No JD analysed yet — questions will use your resume only. <Link to="/resume" className="font-semibold text-brand-600 underline">Analyze a JD</Link></p>}
                  </div>
                  <Toggle checked={cfg.useGaps} onChange={(v) => set({ useGaps: v })} disabled={!canGaps} />
                </div>
              </div>

              <div className={cx('rounded-2xl border-2 p-4 transition-colors', cfg.timed ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-800')}>
                <div className="flex items-start gap-3">
                  <Timer className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900 dark:text-white">Timed mode</div>
                    <p className="mt-0.5 text-sm text-slate-500">A gentle countdown per question to practise pacing. Nothing is cut off when time runs out.</p>
                    {cfg.timed && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[60, 120, 180, 300].map((s) => (
                          <button key={s} onClick={() => set({ secondsPerQuestion: s })}
                            className={cx('rounded-lg border px-3 py-1.5 text-xs font-semibold', cfg.secondsPerQuestion === s ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-700')}>{s / 60} min</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Toggle checked={cfg.timed} onChange={(v) => set({ timed: v })} />
                </div>
              </div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-xl font-semibold">Ready to start?</h2>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              {[['Role', cfg.role], ['Type', cfg.interviewType], ['Difficulty', cfg.difficulty], ['Questions', cfg.numQuestions],
                ['Personalized', cfg.useGaps ? 'Resume & skill gaps' : 'General'], ['Timer', cfg.timed ? `${cfg.secondsPerQuestion / 60} min / question` : 'Off']].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/50">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-sm text-slate-500">Tip: use Chrome or Edge to answer by voice. You can speak, then edit the transcript before submitting.</p>
          </>
        )}

        <div className="mt-8 flex items-center justify-between">
          <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}><ArrowLeft className="h-4 w-4" /> Back</button>
          {step < STEPS.length - 1
            ? <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>Continue <ArrowRight className="h-4 w-4" /></button>
            : <button className="btn btn-primary" onClick={launch}><Rocket className="h-4 w-4" /> Start interview</button>}
        </div>
      </div>
    </>
  );
}
