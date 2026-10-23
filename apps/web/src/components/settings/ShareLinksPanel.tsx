'use client';

import { ExternalLink, Link2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { Pill } from '@/components/ui/Pill';
import { api, unwrap } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatIsoDate } from '@/lib/format';
import { CopyButton } from './CopyButton';
import { errorMessage, FormStatus } from './FormStatus';
import type { PortfolioSummary, ShareLink } from './types';
import { useOrigin } from './useOrigin';

function sharedPath(token: string) {
  return `/shared/${encodeURIComponent(token)}`;
}

/** Read-only snapshot links: create per portfolio, copy, revoke. */
export function ShareLinksPanel({
  links,
  portfolios,
}: {
  links: ShareLink[];
  portfolios: Pick<PortfolioSummary, 'id' | 'name'>[];
}) {
  const router = useRouter();
  const origin = useOrigin();
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = links.filter((l) => !l.revokedAt);
  const revoked = links.filter((l) => l.revokedAt);

  async function run(key: string, fn: () => Promise<unknown>, fallback: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {links.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {[...active, ...revoked].map((s) => {
            const isRevoked = Boolean(s.revokedAt);
            return (
              <li
                key={s.token}
                className={cn(
                  'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[13px]',
                  isRevoked && 'opacity-60',
                )}
              >
                <Link2 aria-hidden className="h-4 w-4 text-faint" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-fg">{s.portfolioName}</div>
                  <div className="truncate text-faint">
                    {origin}
                    {sharedPath(s.token)}
                  </div>
                </div>
                <span className="text-muted">
                  created {formatIsoDate(s.createdAt)}
                  {s.revokedAt ? ` · revoked ${formatIsoDate(s.revokedAt)}` : ''}
                </span>
                {isRevoked ? (
                  <Pill tone="neutral">Revoked</Pill>
                ) : (
                  <div className="flex items-center gap-1">
                    <CopyButton
                      label="Copy"
                      ariaLabel={`Copy link for ${s.portfolioName}`}
                      text={() => `${window.location.origin}${sharedPath(s.token)}`}
                    />
                    <a
                      href={sharedPath(s.token)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-muted hover:bg-surface-2 hover:text-fg"
                      aria-label={`Open snapshot of ${s.portfolioName}`}
                    >
                      <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                    </a>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy === s.token}
                      aria-label={`Revoke link for ${s.portfolioName}`}
                      onClick={() =>
                        run(
                          s.token,
                          async () =>
                            unwrap(
                              await api.DELETE('/share-links/{token}', {
                                params: { path: { token: s.token } },
                              }),
                            ),
                          'Could not revoke the link.',
                        )
                      }
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" /> Revoke
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">No share links yet.</p>
      )}
      {portfolios.length ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!portfolioId) return;
            void run(
              'create',
              async () => unwrap(await api.POST('/share-links', { body: { portfolioId } })),
              'Could not create the link.',
            );
          }}
        >
          <Field label="Portfolio" className="min-w-[220px] flex-1 sm:flex-none">
            <Select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary" disabled={busy === 'create'}>
            <Plus aria-hidden className="h-4 w-4" />
            {busy === 'create' ? 'Creating…' : 'Create link'}
          </Button>
          <FormStatus error={error} />
        </form>
      ) : (
        <p className="mt-3 text-[13px] text-muted">Create a portfolio first to share it.</p>
      )}
    </>
  );
}
