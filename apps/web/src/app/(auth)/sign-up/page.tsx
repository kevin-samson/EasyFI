import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/AuthForm';
import { demoLogin } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  return <AuthForm mode="sign-up" inviteCode={invite} demo={await demoLogin()} />;
}
