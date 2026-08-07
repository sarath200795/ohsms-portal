import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import authService from '../services/auth/index.js';
import useStore from '../store/useStore.js';
import { Button, Card, Field, Input } from '../components/ui.jsx';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const initializeSession = useStore((s) => s.initializeSession);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = await authService.login(email, password);
      initializeSession(session);
      navigate(location.state?.from || '/app', { replace: true });
    } catch (err) {
      setError(
        /auth\/(invalid-credential|wrong-password|user-not-found)/.test(err.code || '')
          ? 'Email or password is incorrect. Check your details and try again.'
          : err.message || 'Sign-in failed. Check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-night p-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <img src="/we-ehs-logo.jpg" alt="WE EHS" className="size-10 rounded-xl object-cover" />
          <span className="text-xl font-extrabold text-white">WE EHS</span>
        </Link>
        <Card className="p-6">
          <div className="mb-5 text-center">
            <h1 className="text-lg font-extrabold">Sign in to your portal</h1>
            <p className="mt-1 text-sm text-soft">Occupational health & safety management</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Field label="Work email" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </Field>
            <Field label="Password" htmlFor="password" required>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-lg p-1.5 text-soft hover:bg-mist"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            {error && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-red-800">
                {error}
              </p>
            )}
            <Button type="submit" loading={loading} className="w-full">
              Sign in
            </Button>
          </form>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-faint">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Access is controlled by your organization's administrator.
          </p>
        </Card>
        <p className="mt-4 text-center text-xs text-slate-400">
          Connecting to a different database?{' '}
          <Link to="/setup" className="font-semibold text-slate-200 underline-offset-2 hover:underline">
            Runtime setup
          </Link>
        </p>
      </div>
    </div>
  );
}
