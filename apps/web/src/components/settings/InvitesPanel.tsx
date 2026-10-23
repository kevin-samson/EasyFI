'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { Pill } from '@/components/ui/Pill';
import { api, unwrap } from '@/lib/api/client';
import { formatIsoDate } from '@/lib/format';
import { CopyButton } from './CopyButton';
import { errorMessage, FormStatus } from './FormStatus';
import type { Invite } from './types';
import { useOrigin } from './useOrigin';

function signUpPath(code: string) {
  return `/sign-up?invite=${encodeURIComponent(code)}`;
}

/** Admin-only: invite codes with a copyable sign-up link, plus "create code". */
export function InvitesPanel({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const origin = useOrigin();
  const [maxUses, setMaxUses] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {invites.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {invites.map((i) => {
            const left = i.maxUses - i.used;
            return (
              <li key={i.code} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
                <code className="font-mono text-[13px] font-bold text-fg">{i.code}</code>
                {left > 0 ? (
                  <Pill tone="brand">
                    {left} of {i.maxUses} left
                  </Pill>
                ) : (
                  <Pill tone="low">Used up</Pill>
                )}
                <span className="ml-auto text-faint">created {formatIsoDate(i.createdAt)}</span>
                {left > 0 ? (
                  <CopyButton
                    label="Copy link"
                    ariaLabel={`Copy sign-up link for ${i.code}`}
                    text={() => `${window.location.origin}${signUpPath(i.code)}`}
                  />
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Revoke ${i.code}`}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      unwrap(
                        await api.DELETE('/invites/{code}', { params: { path: { code: i.code } } }),
                      );
                      router.refresh();
                    } catch (err) {
                      setError(errorMessage(err, 'Could not revoke the invite.'));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Revoke
                </Button>
                {left > 0 ? (
                  <span className="basis-full truncate text-[12px] text-faint">
                    {origin}
                    {signUpPath(i.code)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">No invite codes yet.</p>
      )}
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const n = Math.min(50, Math.max(1, Math.round(Number(maxUses) || 1)));
            unwrap(await api.POST('/invites', { body: { maxUses: n } }));
            router.refresh();
          } catch (err) {
            setError(errorMessage(err, 'Could not create an invite.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Uses" className="w-24">
          <TextInput
            type="number"
            min={1}
            max={50}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={busy}>
          <Plus aria-hidden className="h-4 w-4" /> {busy ? 'Creating…' : 'New invite code'}
        </Button>
        <FormStatus error={error} />
      </form>
    </>
  );
}
