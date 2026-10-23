import { describe, expect, it } from 'vitest';
import { ResendEmailSender } from './email';
import { fakeFetch, jsonResponse } from './testing';

describe('ResendEmailSender', () => {
  it('posts to the Resend API with the key', async () => {
    const f = fakeFetch(() => jsonResponse({ id: 'e1' }));
    await new ResendEmailSender({ apiKey: 're_x', from: 'EasyFI <a@b.c>', fetch: f }).send({
      to: 'u@x.io',
      subject: 'Hi',
      text: 'Body',
    });
    expect(f.calls[0]!.url).toBe('https://api.resend.com/emails');
    expect(f.calls[0]!.init?.headers).toMatchObject({ Authorization: 'Bearer re_x' });
    expect(JSON.parse(String(f.calls[0]!.init?.body))).toEqual({
      from: 'EasyFI <a@b.c>',
      to: ['u@x.io'],
      subject: 'Hi',
      text: 'Body',
    });
  });

  it('throws on API errors', async () => {
    const f = fakeFetch(() => jsonResponse({ message: 'bad' }, 422));
    const s = new ResendEmailSender({ apiKey: 'k', from: 'x', fetch: f, sleep: async () => {} });
    await expect(s.send({ to: 'a', subject: 'b', text: 'c' })).rejects.toThrow('Resend error 422');
  });
});
