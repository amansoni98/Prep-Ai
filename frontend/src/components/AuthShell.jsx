import { Brain, FileSearch, Mic2, TrendingUp } from 'lucide-react';
import { Logo } from './Layout';
import { ThemeToggle } from './ui';

const FEATURES = [
  { icon: FileSearch, t: 'Resume ↔ JD match', d: 'Deterministic match score plus AI gap analysis.' },
  { icon: Brain, t: 'Gap-targeted questions', d: 'Practice exactly what the job asks and you lack.' },
  { icon: Mic2, t: 'Speak your answers', d: 'Voice dictation, timers and live AI coaching.' },
  { icon: TrendingUp, t: 'Track readiness', d: 'Watch your score climb session after session.' },
];

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-fuchsia-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="absolute -right-20 -top-20 h-80 w-80 animate-float rounded-full bg-white/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2.5 text-xl font-extrabold">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 backdrop-blur"><Brain className="h-5 w-5" /></span>
            PREP-AI
          </div>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight !text-white">Walk into every interview already warmed up.</h2>
          <p className="mt-3 text-white/80">Your personal AI interviewer, built around your resume and the roles you want.</p>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/15"><Icon className="h-4 w-4" /></span>
                <div><div className="font-semibold">{t}</div><div className="text-sm text-white/75">{d}</div></div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-sm text-white/60">© {new Date().getFullYear()} PREP-AI</div>
      </div>

      <div className="relative flex items-center justify-center px-6 py-12">
        <ThemeToggle className="absolute right-5 top-5" />
        <div className="w-full max-w-md animate-slide-up">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mb-8 mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          {children}
          <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>
        </div>
      </div>
    </div>
  );
}
