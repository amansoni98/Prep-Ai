import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const cx = (...c) => c.filter(Boolean).join(' ');

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={cx('animate-spin', className)} />;
}

export function FullPageSpinner() {
  return (
    <div className="grid min-h-screen place-items-center">
      <Spinner className="h-8 w-8 text-brand-500" />
    </div>
  );
}

export function ThemeToggle({ className = '' }) {
  const { isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={cx(
        'relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:text-brand-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-amber-300',
        className
      )}
    >
      <Sun className={cx('absolute h-5 w-5 transition-all duration-500', isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')} />
      <Moon className={cx('absolute h-5 w-5 transition-all duration-500', isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0')} />
    </button>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 animate-fade-in dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onClose && (
        <button onClick={onClose} className="text-xs font-semibold underline">
          Dismiss
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const TONES = {
  slate: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  brand: 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  red: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
  amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
};
export function Chip({ tone = 'slate', children, className }) {
  return <span className={cx('chip', TONES[tone], className)}>{children}</span>;
}

/** Score -> semantic tone (value on a 0..max scale) */
export function scoreTone(value, max = 10) {
  const r = value / max;
  return r >= 0.75 ? 'green' : r >= 0.5 ? 'amber' : 'red';
}
const STROKE = { green: 'stroke-emerald-500', amber: 'stroke-amber-500', red: 'stroke-rose-500' };
const TEXT = { green: 'text-emerald-600 dark:text-emerald-400', amber: 'text-amber-600 dark:text-amber-400', red: 'text-rose-600 dark:text-rose-400' };
export const scoreText = (v, max = 10) => TEXT[scoreTone(v, max)];

/** Animated radial gauge. `value` on 0..max. */
export function ScoreGauge({ value = 0, max = 10, size = 140, stroke = 12, suffix, decimals = 1, caption }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, shown / max));
  const tone = scoreTone(value, max);
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Score ${value} out of ${max}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-slate-800" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - ratio)}
          className={cx('transition-[stroke-dashoffset] duration-1000 ease-out', STROKE[tone])}
        />
      </svg>
      <div className="absolute text-center leading-none">
        <div className={cx('font-bold tabular-nums', TEXT[tone])} style={{ fontSize: size * 0.26 }}>
          {Number(value).toFixed(decimals)}
          {suffix && <span style={{ fontSize: size * 0.14 }}>{suffix}</span>}
        </div>
        <div className="mt-1 text-[11px] font-medium text-slate-400">{caption ?? (suffix ? '' : `/ ${max}`)}</div>
      </div>
    </div>
  );
}

/** Single-series trend line with area fill, recessive grid and hover tooltip. Values on 0..100. */
export function TrendChart({ points = [], height = 230 }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 640, H = height, pl = 34, pr = 14, pt = 14, pb = 26;
  const iw = W - pl - pr, ih = H - pt - pb;
  const x = (i) => pl + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => pt + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = points.length > 1 ? `${line} L${x(points.length - 1)},${pt + ih} L${x(0)},${pt + ih} Z` : '';

  function onMove(e) {
    const rect = ref.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bd = Infinity;
    points.forEach((_, i) => { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  }
  const hp = hover != null ? points[hover] : null;
  const labelEvery = Math.ceil(points.length / 6);

  return (
    <div className="relative">
      <svg
        ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none text-brand-500"
        onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchMove={(e) => onMove(e.touches[0])} role="img"
        aria-label="Readiness score trend"
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" strokeDasharray={t === 0 ? '' : '3 4'} />
            <text x={pl - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{t}</text>
          </g>
        ))}
        {area && <path d={area} fill="url(#trendFill)" />}
        {points.length > 1 && <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4} fill="currentColor" className="stroke-white transition-all dark:stroke-slate-900" strokeWidth="2" />
            {(i % labelEvery === 0 || i === points.length - 1) && (
              <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-400 text-[10px]">{p.label}</text>
            )}
          </g>
        ))}
        {hp && <line x1={x(hover)} x2={x(hover)} y1={pt} y2={pt + ih} className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="1" />}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(hp.value) / H) * 100 - 3}%` }}
        >
          <div className="font-semibold text-slate-900 dark:text-white">{hp.value}% readiness</div>
          <div className="text-slate-500 dark:text-slate-400">{hp.title}</div>
          <div className="text-slate-400">{hp.label}</div>
        </div>
      )}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70', className)} />;
}

export const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const fmtDateTime = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
