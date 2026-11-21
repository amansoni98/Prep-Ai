import { NavLink, Outlet, Link } from 'react-router-dom';
import { FileText, History, LayoutDashboard, LogOut, Mic2, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle, cx } from './ui';

export const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/resume', label: 'Resume & JD', icon: FileText },
  { to: '/setup', label: 'Mock Interview', icon: Mic2 },
  { to: '/history', label: 'History', icon: History },
];

export function Logo({ className }) {
  return (
    <Link to="/dashboard" className={cx('flex items-center gap-2.5', className)}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-lg shadow-brand-500/30">
        <Sparkles className="h-5 w-5" />
      </span>
      <span className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
        PREP<span className="text-brand-500">-AI</span>
      </span>
    </Link>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white/80 p-5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 lg:flex">
        <Logo className="mb-8" />
        <nav className="flex-1 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) =>
                cx(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/70'
                )
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user?.name}</div>
            <div className="truncate text-xs text-slate-500">{user?.email}</div>
          </div>
          <button onClick={logout} title="Sign out" aria-label="Sign out" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 sm:px-8">
        <Logo className="lg:invisible" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button onClick={logout} className="btn btn-secondary h-10 lg:hidden" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-8 lg:pb-12">
        <Outlet />
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to} to={to}
            className={({ isActive }) =>
              cx('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-500')
            }
          >
            <Icon className="h-5 w-5" />
            {label.split(' ')[0]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
