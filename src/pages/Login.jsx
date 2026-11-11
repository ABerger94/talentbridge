import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';
import TalentBridgeLogo from '@/components/TalentBridgeLogo';
import GoogleButton from '@/components/auth/GoogleButton';

const getSafeNextPath = (next) => {
  try {
    const url = new URL(next || '/', window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
};

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithEmailPassword, requestPasswordReset, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const nextPath = useMemo(() => getSafeNextPath(searchParams.get('next')), [searchParams]);
  const nextUrl = useMemo(() => new URL(nextPath, window.location.origin).toString(), [nextPath]);

  const handleGoogle = () => loginWithGoogle(nextUrl);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setIsSubmitting(true);

    try {
      await loginWithEmailPassword(email.trim(), password);
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err.message || 'Sign in failed. Check your email and password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    setError('');
    setNotice('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your email first so we can send the password setup link.');
      return;
    }

    setIsSendingReset(true);
    try {
      await requestPasswordReset(trimmedEmail);
      setNotice('Check your email for a password setup link, then return here to sign in.');
    } catch (err) {
      setError(err.message || 'Unable to send a password setup link.');
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <Link to="/" className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center text-primary-foreground">
            <TalentBridgeLogo size={28} />
          </div>
          <span className="text-xl font-bold tracking-tight">TalentBridge</span>
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Use your TalentBridge email and password.
          </p>
        </div>

        <GoogleButton onClick={handleGoogle} label="Sign in with Google" />

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wide">
            <span className="bg-card px-2 text-muted-foreground">or use email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={isSendingReset}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
              >
                {isSendingReset ? 'Sending link...' : 'Forgot password?'}
              </button>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {notice && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
              {notice}
            </div>
          )}

          <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
            <LogIn className="w-4 h-4" />
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-5">
          Signed up with Google before? Sign in with Google above, or enter the same address and use
          “Forgot password?” to set a password for this page.
        </p>

        <p className="text-sm text-muted-foreground text-center mt-6">
          New to TalentBridge?{' '}
          <Link
            to={`/signup?next=${encodeURIComponent(nextUrl)}`}
            className="font-medium text-primary hover:underline"
          >
            Create an account
          </Link>
        </p>
      </Card>
    </div>
  );
}