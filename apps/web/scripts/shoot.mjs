// Dev helper: sign in with the demo login and screenshot pages. Usage:
//   node scripts/shoot.mjs <baseUrl> <outDir> /path1 /path2 ...
import { chromium } from '@playwright/test';

const [base, out, ...paths] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const res = await ctx.request.post(`${base}/api/v1/auth/sign-in`, {
  data: { email: 'demo@easyfi.local', password: 'easyfi-demo' },
});
if (!res.ok()) throw new Error(`sign-in failed ${res.status()}`);
for (const p of paths) {
  await page.goto(base + p, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const name = p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home';
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: process.env.FULL === '1' });
  console.log('shot', p, '→', `${name}.png`);
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
