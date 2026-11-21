import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText, Gauge as GaugeIcon, Mic2, Target, Trophy, Upload } from 'lucide-react';
import api, { apiError } from '../api';
import { useAuth } from '../context/AuthContext';
import { Chip, EmptyState, ErrorBanner, PageHeader, Skeleton, TrendChart, cx, fmtDate, scoreText } from '../components/ui';

function StatCard({ icon: Icon, label, value, hint, children, delay = 0 }) {
  return (
    <div className="card animate-slide-up p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Icon className="h-[18px] w-[18px]" /></span>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-slate-500">{hint}</div>}
      {children}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/summary').then((r) => setData(r.data)).catch((e) => setError(apiError(e)));
  }, []);

  const points = (data?.trend || []).map((t) => ({
    value: t.score,
    label: fmtDate(t.date),
    title: `${t.role} · ${t.type}`,
  }));
  const maxWeight = Math.max(1, ...(data?.topGaps || []).map((g) => g.weight));

  return (
    <>
      <PageHeader
        title={`Hi ${user?.name?.split(' ')[0]} 👋`}
        subtitle="Here's where your placement prep stands today."
        action={<Link to="/setup" className="btn btn-primary"><Mic2 className="h-4 w-4" /> Start mock interview</Link>}
      />
      <ErrorBanner message={error} />

      {!data && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Mic2} label="Mock interviews" value={data.totalInterviews} hint={`${data.completedInterviews} completed`} />
            <StatCard icon={GaugeIcon} label="Avg readiness" delay={60}
              value={data.avgReadiness != null ? <span className={scoreText(data.avgReadiness, 100)}>{data.avgReadiness}%</span> : '—'}
              hint={data.bestScore != null ? `Best session ${data.bestScore}%` : 'Complete an interview to see this'}>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className="h-full rounded-full bg-brand-500 transition-all duration-1000" style={{ width: `${data.avgReadiness || 0}%` }} />
              </div>
            </StatCard>
            <StatCard icon={Target} label="Latest JD match" delay={120}
              value={data.latestMatch ? <span className={scoreText(data.latestMatch.score, 100)}>{data.latestMatch.score}%</span> : '—'}
              hint={data.latestMatch ? `${data.latestMatch.title} · ${data.latestMatch.missingCount} gaps` : 'Analyze a job description'} />
            <StatCard icon={Trophy} label="Top skill gaps" value={data.topGaps.length || '—'} delay={180}>
              <div className="mt-2 flex flex-wrap gap-1">
                {data.topGaps.slice(0, 3).map((g) => <Chip key={g.skill} tone="red">{g.skill}</Chip>)}
                {!data.topGaps.length && <span className="text-xs text-slate-500">None detected yet</span>}
              </div>
            </StatCard>
          </div>

          {!data.hasResume && (
            <div className="card mt-6 flex flex-wrap items-center justify-between gap-4 border-brand-200 bg-brand-50/60 p-5 dark:border-brand-500/30 dark:bg-brand-500/10">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-white"><Upload className="h-5 w-5" /></span>
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">Start by uploading your resume</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">We parse it, match it with a target job, and tailor your interview questions to your gaps.</div>
                </div>
              </div>
              <Link to="/resume" className="btn btn-primary">Upload resume <ArrowRight className="h-4 w-4" /></Link>
            </div>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="card p-5 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Readiness trend</h2>
                <span className="text-xs text-slate-500">Score per completed session</span>
              </div>
              {points.length ? <TrendChart points={points} /> : (
                <EmptyState icon={GaugeIcon} title="No completed sessions yet" text="Finish a mock interview and your score trend will appear here."
                  action={<Link to="/setup" className="btn btn-primary">Take your first interview</Link>} />
              )}
            </div>

            <div className="card p-5">
              <h2 className="mb-4 font-semibold">Skills to work on</h2>
              {data.topGaps.length ? (
                <ul className="space-y-3">
                  {data.topGaps.map((g) => (
                    <li key={g.skill}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium capitalize text-slate-800 dark:text-slate-200">{g.skill}</span>
                        <span className="text-xs text-slate-500">{g.jdMisses ? 'JD gap' : ''}{g.jdMisses && g.weakAnswers ? ' · ' : ''}{g.weakAnswers ? 'weak answer' : ''}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-rose-500" style={{ width: `${(g.weight / maxWeight) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-500">Analyze a job description to discover which skills you're missing.</p>}
              <Link to="/resume" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">
                <FileText className="h-4 w-4" /> Analyze a job description
              </Link>
            </div>
          </div>

          <div className="card mt-6 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Recent sessions</h2>
              <Link to="/history" className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">View all</Link>
            </div>
            {data.recent.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.recent.map((s) => (
                  <li key={s.id}>
                    <Link to={`/interview/${s.id}`} className="flex items-center justify-between gap-3 rounded-lg py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/40 sm:px-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900 dark:text-white">{s.role}</div>
                        <div className="text-xs text-slate-500">{s.type} · {s.difficulty} · {fmtDate(s.createdAt)}</div>
                      </div>
                      {s.status === 'completed'
                        ? <span className={cx('text-lg font-bold tabular-nums', scoreText(s.score, 100))}>{s.score}%</span>
                        : <Chip tone="amber">{s.answered}/{s.total} answered · Resume</Chip>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No sessions yet.</p>}
          </div>
        </>
      )}
    </>
  );
}
