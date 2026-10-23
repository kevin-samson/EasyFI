'use client';

import { ImagePlus, Send, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, inputClass, TextInput } from '@/components/ui/Field';
import { api, unwrap } from '@/lib/api/client';
import { cn } from '@/lib/cn';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg'];

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}

/** Feedback → POST /feedback with an optional PNG/JPEG screenshot (≤ 2 MB, sent as a data URL). */
export function FeedbackForm() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [page, setPage] = useState('');
  const [shot, setShot] = useState<{ name: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div role="status" className="text-[13px] leading-relaxed text-muted">
        <p className="font-medium text-up">Thanks — your feedback was sent.</p>
        <Button className="mt-3" size="sm" variant="ghost" onClick={() => setSent(false)}>
          Send more
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!message.trim()) return setError('Tell us what happened or what you would like.');
        setBusy(true);
        setError(null);
        try {
          unwrap(
            await api.POST('/feedback', {
              body: {
                message: message.trim(),
                ...(page.trim() ? { page: page.trim().slice(0, 200) } : {}),
                ...(shot ? { screenshot: shot.dataUrl } : {}),
              },
            }),
          );
          setMessage('');
          setPage('');
          setShot(null);
          if (fileRef.current) fileRef.current.value = '';
          setSent(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not send feedback.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Message">
        <textarea
          className={cn(inputClass, 'h-28 resize-y py-2 leading-relaxed')}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={4000}
          placeholder="A bug, a confusing number, an idea…"
          required
        />
      </Field>
      <Field label="Page (optional)">
        <TextInput
          value={page}
          onChange={(e) => setPage(e.target.value)}
          placeholder="e.g. /portfolios or Dividends"
          maxLength={200}
        />
      </Field>
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          id="feedback-shot"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setError(null);
            if (!f) return setShot(null);
            if (!TYPES.includes(f.type)) {
              e.target.value = '';
              return setError('Screenshots must be PNG or JPEG.');
            }
            if (f.size > MAX_BYTES) {
              e.target.value = '';
              return setError('Screenshots must be 2 MB or smaller.');
            }
            try {
              setShot({ name: f.name, dataUrl: await readAsDataUrl(f) });
            } catch {
              setError('Could not read that file.');
            }
          }}
        />
        {shot ? (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.dataUrl} alt="" className="h-8 w-12 rounded object-cover" />
            <span className="min-w-0 flex-1 truncate text-muted">{shot.name}</span>
            <button
              type="button"
              aria-label="Remove screenshot"
              className="rounded p-1 text-faint hover:text-fg"
              onClick={() => {
                setShot(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <label
            htmlFor="feedback-shot"
            className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg"
          >
            <ImagePlus aria-hidden className="h-4 w-4" /> Attach a screenshot (PNG/JPEG, ≤ 2 MB)
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          <Send aria-hidden className="h-4 w-4" /> {busy ? 'Sending…' : 'Send feedback'}
        </Button>
        {error ? (
          <span role="alert" className="text-[13px] text-down">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
