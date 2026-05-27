import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';
import TalentBridgeLogo from '@/components/TalentBridgeLogo';

const getSafeNextPath = (next) => {
  try {
    const url = new URL(next || '/', window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
};

export default function Signup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { registerWithEmailPassword, verifyEmailOtpAndLogin, resendVerificationCode } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isVerificationStep, setIsVerificationStep] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const nextPath = useMemo(() => getSafeNextPath(searchParams.get('next')), [searchParams]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await registerWithEmailPassword(email.trim(), password);
      setIsVerificationStep(true);
      setNotice('Check your email for the 6-digit verification code.');
    } catch (err) {
      setError(err.message || 'Unable to create account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setIsSubmitting(true);

    try {
      await verifyEmailOtpAndLogin(email.trim(), password, otpCode.trim());
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid or expired verification code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setNotice('');
    setIsResending(true);

    try {
      await resendVerificationCode(email.trim());
      setNotice('A new verification code was sent.');
    } catch (err) {
      setError(err.message || 'Unable to resend the verification code.');
    } finally {
      setIsResending(false);
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

        {isVerificationStep ? (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold">Verify email</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Enter the 6-digit code sent to {email.trim()}.
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp-code">Verification code</Label>
                <Input
                  id="otp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value)}
                  maxLength={6}
                  required
                />
              </div>

              {notice && (
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                  {notice}
                </div>
              )}

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
                <UserPlus className="w-4 h-4" />
                {isSubmitting ? 'Verifying...' : 'Verify Email'}
              </Button>
            </form>

            <Button
              type="button"
              variant="ghost"
              className="w-full mt-3"
              onClick={handleResendCode}
              disabled={isResending}
            >
              {isResending ? 'Sending...' : 'Send a new code'}
            </Button>
          </>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold">Create account</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Create a TalentBridge account with your email and password.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </div>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
                <UserPlus className="w-4 h-4" />
                {isSubmitting ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>
          </>
        )}

        <p className="text-sm text-muted-foreground text-center mt-6">
          Already have an account?{' '}
          <Link
            to={`/login?next=${encodeURIComponent(new URL(nextPath, window.location.origin).toString())}`}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
