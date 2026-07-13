const { test, expect } = require('@playwright/test');

// Phase 0 back-test: 6-digit PIN migration + double-submit fix.
// Needs the throwaway QA accounts from the session's setup-qa-users.js
// script, so it's gated on QA_PHASE0=1 (plus optional PIN overrides).
//   QA_PHASE0=1 npm run test:e2e -- phase0-pin
const RUN = process.env.QA_PHASE0 === '1';
const MGR_PIN = process.env.QA_MGR_PIN || '902417';
const LEG_PIN = process.env.QA_LEG_PIN || '4471';

async function login(page, userId, pin) {
  await page.goto('/login');
  await page.getByLabel('User ID').fill(userId);
  for (let i = 0; i < pin.length; i++) {
    await page.getByLabel(`PIN digit ${i + 1}`).fill(pin[i]);
  }
  await page.getByRole('button', { name: /sign in/i }).click();
}

test('6-digit login lands on the app with no upgrade gate', async ({ page }) => {
  test.skip(!RUN, 'Set QA_PHASE0=1 (and create QA accounts) to run');
  await login(page, 'QA-MGR6', MGR_PIN);
  await expect(page).toHaveURL('/', { timeout: 15000 });
  await expect(page.getByText('Security upgrade')).not.toBeVisible();
  // Something from the real app shell proves we're past every gate
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15000 });
});

test('legacy 4-digit login is accepted and hits the forced upgrade screen', async ({ page }) => {
  test.skip(!RUN, 'Set QA_PHASE0=1 (and create QA accounts) to run');
  await login(page, 'QA-LEG4', LEG_PIN);
  await expect(page.getByText('Security upgrade — 6-digit PIN')).toBeVisible({ timeout: 15000 });
  // The gate blocks the app — no sidebar/nav behind it
  await expect(page.getByRole('button', { name: 'Upgrade PIN & Continue' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
});

test('double-clicking Save Job creates exactly one job', async ({ page }) => {
  test.skip(!RUN, 'Set QA_PHASE0=1 (and create QA accounts) to run');
  // Signature upload goes through the real Dropbox Cloud Function — a cold
  // start plus token refresh can exceed Playwright's defaults.
  test.setTimeout(240000);
  await login(page, 'QA-MGR6', MGR_PIN);
  await expect(page).toHaveURL('/', { timeout: 15000 });

  await page.goto('/customers');
  await page.getByText(/QA Phase0 Customer/).first().click();
  await expect(page).toHaveURL(/\/customers\/.+/);

  await expect(page.getByRole('heading', { name: 'Service Jobs' })).toBeVisible();
  await page.getByRole('button', { name: 'New Report' }).click();

  const jobDescription = `Phase0 double-submit check ${Date.now()}`;
  await expect(page.getByLabel('Job Description')).toBeVisible({ timeout: 10000 });
  await page.getByLabel('Job Description').fill(jobDescription);
  await page.getByLabel('Action Taken').fill('Automated Phase 0 regression — no real work performed.');

  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 20);
  await page.mouse.move(box.x + 100, box.y + box.height - 20);
  await page.mouse.up();

  await page.getByLabel("Signer's Name").fill('Phase0 QA Signer');

  // The regression this guards: two clicks in the same frame used to create
  // two identical serviceJobs documents.
  await page.getByRole('button', { name: 'Save Job' }).dblclick();

  await expect(page.getByRole('heading', { name: 'New Service Job' })).not.toBeVisible({ timeout: 120000 });

  const rows = page.getByRole('button', { name: new RegExp(jobDescription) });
  await expect(rows).toHaveCount(1, { timeout: 10000 });
});
