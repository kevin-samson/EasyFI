import { fakeFetch, jsonResponse } from '@easyfi/data-sources';
import { describe, expect, it } from 'vitest';
import { supabaseStorageUploader } from './runtime';

describe('supabaseStorageUploader', () => {
  it('posts the image to the feedback bucket with the service role key', async () => {
    const f = fakeFetch(() => jsonResponse({ Key: 'x' }));
    const upload = supabaseStorageUploader('https://p.supabase.co/', 'srv', f);
    const path = await upload(new Uint8Array([1, 2, 3]), 'image/png');
    expect(path).toMatch(/^feedback\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.png$/);
    expect(f.calls[0]!.url).toMatch(/^https:\/\/p\.supabase\.co\/storage\/v1\/object\/feedback\//);
    expect(f.calls[0]!.init?.headers).toMatchObject({ apikey: 'srv', 'Content-Type': 'image/png' });
  });
});
