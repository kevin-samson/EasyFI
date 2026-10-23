'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { setTheme } from '@/components/ui/ThemeToggle';
import { api, unwrap } from '@/lib/api/client';
import { errorMessage, FormStatus } from './FormStatus';
import type { Me } from './types';

type ThemePref = Me['theme'];

function applyTheme(t: ThemePref) {
  const resolved =
    t === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : t;
  setTheme(resolved);
}

/** Display name + theme preference → PATCH /me. Theme also applies immediately on this device. */
export function ProfileForm({ me }: { me: Me }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [theme, setThemePref] = useState<ThemePref>(me.theme);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const dirty = displayName.trim() !== me.displayName || theme !== me.theme;

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!displayName.trim()) return;
        setBusy(true);
        setError(null);
        setOk(null);
        try {
          unwrap(await api.PATCH('/me', { body: { displayName: displayName.trim(), theme } }));
          applyTheme(theme);
          setOk('Saved');
          router.refresh();
        } catch (err) {
          setError(errorMessage(err, 'Could not save your profile.'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Display name">
        <TextInput
          name="displayName"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            setOk(null);
          }}
          autoComplete="name"
          required
          maxLength={60}
        />
      </Field>
      <Field
        label="Email"
        hint={
          me.authMode === 'demo'
            ? 'Demo mode: single local user.'
            : 'Used to sign in. Contact the owner to change it.'
        }
      >
        <TextInput value={me.email ?? '—'} readOnly aria-readonly className="text-muted" />
      </Field>
      <Field label="Base currency">
        <Select name="currency" defaultValue={me.baseCurrency} disabled>
          <option value="USD">USD — US dollar</option>
        </Select>
      </Field>
      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-muted">Theme</span>
        <SegmentedTabs<ThemePref>
          label="Theme"
          value={theme}
          onChange={(t) => {
            setThemePref(t);
            setOk(null);
            applyTheme(t);
          }}
          options={[
            { value: 'dark', label: 'Dark', icon: <Moon aria-hidden className="h-3.5 w-3.5" /> },
            { value: 'light', label: 'Light', icon: <Sun aria-hidden className="h-3.5 w-3.5" /> },
            {
              value: 'system',
              label: 'System',
              icon: <Monitor aria-hidden className="h-3.5 w-3.5" />,
            },
          ]}
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2 sm:justify-end">
        <FormStatus error={error} ok={ok} />
        <Button type="submit" variant="primary" disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </form>
  );
}
