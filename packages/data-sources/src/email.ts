import { fetchWithRetry, HttpError } from './http';
import type { FetchLike, SleepFn } from './types';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

export interface ResendOptions {
  apiKey: string;
  /** e.g. "EasyFI <alerts@yourdomain.com>" (Resend's onboarding@resend.dev works for testing). */
  from: string;
  fetch?: FetchLike;
  sleep?: SleepFn;
}

/** Resend (free tier: 3,000 emails/month) transactional email. */
export class ResendEmailSender implements EmailSender {
  private readonly fetch: FetchLike;

  constructor(private readonly opts: ResendOptions) {
    this.fetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
  }

  async send(msg: EmailMessage): Promise<void> {
    const res = await fetchWithRetry(
      this.fetch,
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.opts.from,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
        }),
      },
      { retries: 2, ...(this.opts.sleep ? { sleep: this.opts.sleep } : {}) },
    ).catch((e: unknown) => {
      // never echo the API key; status is enough
      throw new Error(`Resend error ${e instanceof HttpError ? e.status : 'network'}`);
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}`);
  }
}

/** Collects messages instead of sending (tests, demo mode). */
export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
  }
}
