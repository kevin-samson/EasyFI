'use client';

import { useEffect } from 'react';
import { THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * Applies the profile's saved theme on a device that has no local choice yet
 * ('system' follows prefers-color-scheme). A local toggle always wins afterwards.
 */
export function ThemeSync({ theme }: { theme: 'dark' | 'light' | 'system' }) {
  useEffect(() => {
    try {
      if (localStorage.getItem(THEME_STORAGE_KEY)) return;
    } catch {
      return;
    }
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : theme;
    document.documentElement.setAttribute('data-theme', resolved);
  }, [theme]);
  return null;
}
