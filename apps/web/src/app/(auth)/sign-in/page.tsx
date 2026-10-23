import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/AuthForm';
import { demoLogin } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-in" next={next} demo={await demoLogin()} />;
}
