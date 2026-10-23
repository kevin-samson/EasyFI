'use client';

import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, TextInput } from '@/components/ui/Field';
import { api, ApiError, unwrap } from '@/lib/api/client';

export type AuthFormProps = {
  mode: 'sign-in' | 'sign-up';
  /** Prefill for the invite code (e.g. from ?invite=). */
  inviteCode?: string;
  /** Where to go after signing in (from ?next=). */
  next?: string;
  /** Local demo mode: show the demo login. */
  demo?: { email: string; password: string; inviteCode: string } | null;
};

const safeNext = (n: string | undefined) =>
  n && n.startsWith('/') && !n.startsWith('//') ? n : '/';

/** Email + password form; sign-up adds name and invite code. Posts to /api/v1/auth/*. */
export function AuthForm({ mode, inviteCode, next, demo }: AuthFormProps) {
  const signUp = mode === 'sign-up';
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(email: string, password: string) {
    unwrap(await api.POST('/auth/sign-in', { body: { email, password } }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? '').trim();
    setBusy(true);
    setError(null);
    try {
      if (signUp) {
        unwrap(
          await api.POST('/auth/sign-up', {
            body: {
              email: get('email'),
              password: String(f.get('password') ?? ''),
              displayName: get('displayName') || undefined,
              inviteCode: get('inviteCode'),
            },
          }),
        );
      } else {
        await signIn(get('email'), String(f.get('password') ?? ''));
      }
      // full navigation: the client router may hold a pre-login redirect for this URL
      window.location.assign(safeNext(next));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  async function signInDemo() {
    if (!demo) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(demo.email, demo.password);
      // full navigation: the client router may hold a pre-login redirect for this URL
      window.location.assign(safeNext(next));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Demo sign-in failed.');
      setBusy(false);
    }
  }

  const footer: ReactNode = signUp ? (
    <>
      Already have an account?{' '}
      <Link href="/sign-in" className="font-medium text-up hover:underline">
        Sign in
      </Link>
    </>
  ) : (
    <>
      Have an invite code?{' '}
      <Link href="/sign-up" className="font-medium text-up hover:underline">
        Create an account
      </Link>
    </>
  );

  return (
    <>
      <Card className="!p-6 sm:!p-8">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-fg">
          {signUp ? 'Create your account' : 'Sign in to EasyFI'}
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          {signUp
            ? 'EasyFI is invite-only. Enter the code a friend sent you.'
            : 'See what your portfolio really owns.'}
        </p>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-[var(--sev-high-bg)] px-3 py-2 text-[13px] text-[var(--sev-high-fg)]"
          >
            {error}
          </p>
        ) : null}
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {signUp ? (
            <>
              <Field label="Invite code">
                <TextInput
                  name="inviteCode"
                  required
                  defaultValue={inviteCode}
                  placeholder={demo ? demo.inviteCode : 'EFI-XXXX-XXXX'}
                  autoCapitalize="characters"
                  className="font-mono tracking-wide"
                />
              </Field>
              <Field label="Name">
                <TextInput name="displayName" required autoComplete="name" />
              </Field>
            </>
          ) : null}
          <Field label="Email">
            <TextInput name="email" type="email" required autoComplete="email" />
          </Field>
          <Field label="Password" hint={signUp ? 'At least 8 characters.' : undefined}>
            <TextInput
              name="password"
              type="password"
              required
              minLength={signUp ? 8 : undefined}
              autoComplete={signUp ? 'new-password' : 'current-password'}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
            {busy ? 'One moment…' : signUp ? 'Create account' : 'Sign in'}
          </Button>
        </form>
        {demo && !signUp ? (
          <div className="mt-5 border-t border-line pt-5">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={signInDemo}
            >
              Explore the demo portfolios
            </Button>
            <p className="mt-2 text-center text-[12px] text-faint">
              Local demo mode · {demo.email} / {demo.password} · invite code {demo.inviteCode}
            </p>
          </div>
        ) : null}
      </Card>
      <p className="mt-5 text-center text-[13px] text-muted">{footer}</p>
    </>
  );
}
