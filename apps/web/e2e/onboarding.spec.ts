import { expect, test } from '@playwright/test';

test('invite sign-up → portfolio → VOO + QQQ → look-through → Explorer', async ({ page }) => {
  const email = `friend+${Date.now()}@example.com`;

  // sign-up is gated by an invite code
  await page.goto('/sign-up');
  await page.getByLabel('Invite code').fill('NOT-A-CODE');
  await page.getByLabel('Name').fill('Friend');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText(/invite code/i);

  await page.getByLabel('Invite code').fill('DEMO-INVITE');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
  await expect(page.getByText('No portfolios yet')).toBeVisible();

  // create a portfolio
  await page.getByRole('link', { name: /Create your first portfolio/ }).click();
  await page.getByLabel('Name').fill('Roth IRA');
  await page.getByRole('button', { name: 'Create portfolio' }).click();
  await expect(page.getByRole('heading', { name: 'Manage holdings' })).toBeVisible();

  // add VOO and QQQ
  for (const [ticker, shares] of [
    ['VOO', '10'],
    ['QQQ', '5'],
  ] as const) {
    await page.getByRole('button', { name: 'Add holding' }).first().click();
    await page.getByRole('combobox').fill(ticker);
    await page.getByLabel('Shares').fill(shares);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('rowheader', { name: new RegExp(ticker) })).toBeVisible();
  }

  // look-through shows companies reached through both funds
  await page.getByRole('link', { name: 'Roth IRA' }).click();
  const nvda = page.getByRole('button', { name: /NVDA/ }).first();
  await expect(nvda).toBeVisible();
  await expect(page.getByText(/2 ETFs/).first()).toBeVisible();

  // ask the Explorer (rule-based demo LLM — no network)
  await page.goto('/explorer?q=Compare%20VOO%20and%20QQQ');
  await expect(page.getByText(/overlap by weight/i).first()).toBeVisible();
});
