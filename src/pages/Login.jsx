import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, LogIn, MailCheck } from 'lucide-react';
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
  const {
    loginWithEmailPassword,
    requestPasswordReset,
    resetPasswordAndLogin,
    verifyEmailOtpAndLogin,
    resendVerificationCode,
    loginWithGoogle,
  } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'reset' | 'verify'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);

  const nextPath = useMemo(() => getSafeNextPath(searchParams.get('next')), [searchParams]);
  const nextUrl = useMemo(() => new URL(nextPath, window.location.origin).toString(), [nextPath]);

  const handleGoogle = () => loginWithGoogle(nextUrl);

  const resetMessages = () => {
    setError('');
    setNotice('');
  };

  const backToSignIn = () => {
    resetMessages();
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setMode('login');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    resetMessages();
    setIsSubmitting(true);

    try {
      await loginWithEmailPassword(email.trim(), password);
      navigate(nextPath, { replace: true });
    } catch (err) {
      if (err.code === 'email_not_verified') {
        // Send a fresh code (a 429 just means one went out under a minute ago).
        try {
          await resendVerificationCode(email.trim());
        } catch {
          /* recent code still valid */
        }
        setCode('');
        setMode('verify');
        setNotice(`Your email isn't verified yet. We sent a 6-digit code to ${email.trim()} — check your spam folder too.`);
      } else {
        setError(err.message || 'Sign in failed. Check your email and password.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendResetCode = async () => {
    resetMessages();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your email first so we can send a reset code.');
      return;
    }
    setIsSendingCode(true);
    try {
      await requestPasswordReset(trimmedEmail);
      setMode('reset');
      setNotice(`If an account exists for ${trimmedEmail}, we emailed it a 6-digit code. Check your spam folder too.`);
    } catch (err) {
      setError(err.message || 'Unable to send a reset code.');
    } finally {
      setIsSendingCode(false);
    }
  };

  const resendVerify = async () => {
    resetMessages();
    setIsSendingCode(true);
    try {
      await resendVerificationCode(email.trim());
      setNotice('A new code is on its way.');
    } catch (err) {
      setError(err.message || 'Unable to resend the code.');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleReset = async (event) => {
    event.preventDefault();
    resetMessages();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      await resetPasswordAndLogin(email.trim(), code.trim(), newPassword);
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid or expired code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    resetMessages();
    setIsSubmitting(true);
    try {
      await verifyEmailOtpAndLogin(email.trim(), password, code.trim());
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid or expired code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const messages = (
    <>
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
    </>
  );

  const codeField = (
    <div className="space-y-2">
      <Label htmlFor="code">6-digit code</Label>
      <Input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        required
      />
    </div>
  );

  const brand = (
    <Link to="/" className="flex items-center gap-2.5 mb-8">
      <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center text-primary-foreground">
        <TalentBridgeLogo size={28} />
      </div>
      <span className="text-xl font-bold tracking-tight">TalentBridge</span>
    </Link>
  );

  if (mode === 'reset' || mode === 'verify') {
    const isReset = mode === 'reset';
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md p-6 sm:p-8">
          {brand}
          <div className="mb-6">
            <h1 className="text-2xl font-bold">{isReset ? 'Set a new password' : 'Verify your email'}</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Enter the code we emailed to {email.trim()}{isReset ? ' and choose a new password.' : '.'}
            </p>
          </div>

          <form onSubmit={isReset ? handleReset : handleVerify} className="space-y-4">
            {codeField}
            {isReset && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </div>
              </>
            )}

            {messages}

            <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
              {isReset ? <KeyRound className="w-4 h-4" /> : <MailCheck className="w-4 h-4" />}
              {isSubmitting ? 'Please wait...' : isReset ? 'Save password and sign in' : 'Verify and sign in'}
            </Button>
          </form>

          <div className="flex items-center justify-between mt-5 text-sm">
            <button type="button" onClick={backToSignIn} className="text-muted-foreground hover:underline">
              Back to sign in
            </button>
            <button
              type="button"
              onClick={isReset ? sendResetCode : resendVerify}
              disabled={isSendingCode}
              className="font-medium text-primary hover:underline disabled:opacity-60"
            >
              {isSendingCode ? 'Sending...' : 'Resend code'}
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-6 sm:p-8">
        {brand}

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
                onClick={sendResetCode}
                disabled={isSendingCode}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
              >
                {isSendingCode ? 'Sending code...' : 'Forgot password?'}
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

          {messages}

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
