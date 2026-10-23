import type { ExplorerStreamEvent } from './types';

const TYPES = new Set(['tool', 'delta', 'done', 'error']);

function parseLine(line: string): ExplorerStreamEvent | null {
  const t = line.trim();
  if (!t) return null;
  try {
    const v = JSON.parse(t) as { type?: unknown };
    return v && typeof v.type === 'string' && TYPES.has(v.type) ? (v as ExplorerStreamEvent) : null;
  } catch {
    return null;
  }
}

/**
 * POST a question to a thread and feed each NDJSON ExplorerStreamEvent to `onEvent`.
 * HTTP errors (401/404/400 envelopes) and dropped connections are reported as `error` events.
 */
export async function streamAnswer(
  threadId: string,
  text: string,
  onEvent: (e: ExplorerStreamEvent) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/explorer/threads/${encodeURIComponent(threadId)}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ text }),
    });
  } catch {
    onEvent({
      type: 'error',
      code: 'network',
      message: 'Could not reach EasyFI. Check your connection.',
    });
    return;
  }
  if (!res.ok || !res.body) {
    let code = 'internal';
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    onEvent({ type: 'error', code, message });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let finished = false;
  const flush = (chunk: string) => {
    for (const line of chunk.split('\n')) {
      const e = parseLine(line);
      if (!e) continue;
      if (e.type === 'done' || e.type === 'error') finished = true;
      onEvent(e);
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const nl = buf.lastIndexOf('\n');
      if (nl >= 0) {
        flush(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }
    flush(buf + decoder.decode());
  } catch {
    /* connection dropped — reported below */
  }
  if (!finished) {
    onEvent({
      type: 'error',
      code: 'network',
      message: 'The answer was cut off. Try asking again.',
    });
  }
}
