import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Clock, History as HistoryIcon, Mic, Play, Trash2 } from 'lucide-react';
import api, { apiError } from '../api';
import { Chip, EmptyState, ErrorBanner, PageHeader, Skeleton, TrendChart, cx, fmtDate, fmtDateTime, scoreText, scoreTone } from '../components/ui';

const FILTERS = ['all', 'completed', 'in_progress'];

function Transcript({ iv }) {
  return (
    <div className="space-y-5 border-t border-slate-100 px-5 py-5 dark:border-slate-800">
      {iv.questions.map((q, i) => {
        const a = iv.answers.find((x) => x.questionIndex === i);
        const ev = a?.evaluation;
        return (
          <div key={i} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Q{i + 1}{q.topic ? ` · ${q.topic}` : ''}</div>
                <p className="mt-1 font-medium text-slate-900 dark:text-white">{q.text}</p>
              </div>
              {ev && <Chip tone={scoreTone(ev.score)} className="shrink-0 tabular-nums">{ev.score.toFixed(1)}/10</Chip>}
            </div>
            {a ? (
              <>
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-500">
                    {a.inputMode === 'voice' && <Mic className="h-3 w-3" />} Your answer
                    <span className="flex items-center gap-1 font-normal"><Clock className="h-3 w-3" />{a.timeTaken}s</span>
                  </div>
                  <p className={cx('whitespace-pre-wrap', a.inputMode === 'code' && 'font-mono text-[13px]')}>{a.answer || <em className="text-slate-400">Skipped</em>}</p>
                </div>
                {ev && (
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Strengths</div>
                      <ul className="list-disc space-y-1 pl-4">{ev.strengths.length ? ev.strengths.map((s, k) => <li key={k}>{s}</li>) : <li className="list-none text-slate-400">—</li>}</ul>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-semibold text-amber-600 dark:text-amber-400">To improve</div>
                      <ul className="list-disc space-y-1 pl-4">{ev.improvements.map((s, k) => <li key={k}>{s}</li>)}</ul>
                    </div>
                  </div>
                )}
                {ev?.ideal?.sampleAnswer && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-semibold text-brand-600 dark:text-brand-300">Ideal answer blueprint</summary>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">{ev.ideal.outline.map((s, k) => <li key={k}>{s}</li>)}</ol>
                    <p className="mt-2 rounded-lg bg-brand-50 p-3 text-slate-700 dark:bg-brand-500/10 dark:text-slate-300">{ev.ideal.sampleAnswer}</p>
                  </details>
                )}
              </>
            ) : <p className="mt-2 text-sm text-slate-400">Not answered yet.</p>}
          </div>
        );
      })}
    </div>
  );
}

export default function History() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.get('/interviews').then((r) => setItems(r.data.items)).catch((e) => setError(apiError(e)));
  }, []);

  const shown = useMemo(() => (items || []).filter((i) => filter === 'all' || i.status === filter), [items, filter]);
  const points = useMemo(
    () => (items || []).filter((i) => i.status === 'completed').reverse().map((i) => ({
      value: i.overallScore, label: fmtDate(i.completedAt || i.createdAt), title: `${i.config.role} · ${i.config.interviewType}`,
    })),
    [items]
  );

  async function remove(id) {
    if (!window.confirm('Delete this interview session permanently?')) return;
    try {
      await api.delete(`/interviews/${id}`);
      setItems((l) => l.filter((i) => i._id !== id));
    } catch (e) { setError(apiError(e)); }
  }

  return (
    <>
      <PageHeader title="Interview history" subtitle="Review transcripts, feedback and ideal answers from past sessions." />
      <ErrorBanner message={error} onClose={() => setError('')} />
      {!items && !error && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>}

      {items && !items.length && (
        <div className="card"><EmptyState icon={HistoryIcon} title="No sessions yet" text="Your mock interviews will be saved here with full transcripts and AI feedback."
          action={<Link to="/setup" className="btn btn-primary">Start your first interview</Link>} /></div>
      )}

      {items?.length > 0 && (
        <>
          {points.length > 1 && (
            <div className="card mb-6 p-5">
              <h2 className="mb-2 font-semibold">Score trend</h2>
              <TrendChart points={points} height={200} />
            </div>
          )}
          <div className="mb-4 flex gap-2">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cx('rounded-full border px-3.5 py-1.5 text-xs font-semibold capitalize transition',
                  filter === f ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800')}>
                {f.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {shown.map((iv) => {
              const isOpen = open === iv._id;
              return (
                <div key={iv._id} className="card animate-slide-up overflow-hidden">
                  <div className="flex items-center gap-3 p-4 sm:p-5">
                    <button className="flex min-w-0 flex-1 items-center gap-4 text-left" onClick={() => setOpen(isOpen ? null : iv._id)} aria-expanded={isOpen}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-slate-900 dark:text-white">{iv.config.role}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Chip tone="brand">{iv.config.interviewType}</Chip><Chip>{iv.config.difficulty}</Chip>
                          {iv.config.useGaps && <Chip tone="red">Gap-focused</Chip>}
                          <span className="text-xs text-slate-500">{fmtDateTime(iv.createdAt)}</span>
                        </div>
                      </div>
                      {iv.status === 'completed'
                        ? <div className={cx('text-2xl font-bold tabular-nums', scoreText(iv.overallScore, 100))}>{iv.overallScore}%</div>
                        : <Chip tone="amber">{iv.answers.length}/{iv.questions.length}</Chip>}
                      <ChevronDown className={cx('h-5 w-5 shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
                    </button>
                    {iv.status !== 'completed' && <Link to={`/interview/${iv._id}`} className="btn btn-primary hidden sm:inline-flex"><Play className="h-4 w-4" /> Resume</Link>}
                    <button onClick={() => remove(iv._id)} aria-label="Delete session" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {isOpen && <Transcript iv={iv} />}
                </div>
              );
            })}
            {!shown.length && <p className="py-8 text-center text-sm text-slate-500">No sessions match this filter.</p>}
          </div>
        </>
      )}
    </>
  );
}
