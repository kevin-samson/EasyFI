'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';

/** Copies `text` (or the result of `getText`, evaluated on click) to the clipboard. */
export function CopyButton({
  text,
  label = 'Copy',
  ariaLabel,
}: {
  text: string | (() => string);
  label?: string;
  ariaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={ariaLabel}
      onClick={async () => {
        const value = typeof text === 'function' ? text() : text;
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          window.prompt('Copy this link', value);
        }
      }}
    >
      {copied ? (
        <Check aria-hidden className="h-3.5 w-3.5 text-up" />
      ) : (
        <Copy aria-hidden className="h-3.5 w-3.5" />
      )}
      {copied ? 'Copied' : label}
    </Button>
  );
}
