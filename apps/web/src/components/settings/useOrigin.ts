'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/** window.location.origin on the client, '' during SSR (links render as paths until hydrated). */
export function useOrigin() {
  return useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => '',
  );
}
