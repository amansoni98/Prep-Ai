import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Eye, EyeOff, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiError } from '../api';
import AuthShell from '../components/AuthShell';
import { ErrorBanner, Spinner, cx } from '../components/ui';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const strong = form.password.length >= 8;

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(form.name, form.email, form.password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start practising with an AI interviewer in minutes."
      footer={<>Already registered? <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">Sign in</Link></>}
    >
      <ErrorBanner message={error} />
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" required minLength={2} autoComplete="name" className="input" placeholder="Aarav Sharma"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" className="input" placeholder="you@college.edu"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <div className="relative">
            <input id="password" type={show ? 'text' : 'password'} required minLength={8} autoComplete="new-password" className="input pr-11"
              placeholder="At least 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className={cx('mt-2 flex items-center gap-1.5 text-xs', strong ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>
            <Check className="h-3.5 w-3.5" /> 8+ characters
          </div>
        </div>
        <button disabled={busy} className="btn btn-primary w-full">
          {busy ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />} Create account
        </button>
      </form>
    </AuthShell>
  );
}
