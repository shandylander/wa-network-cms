const { test, expect } = require('@playwright/test');

// One-shot Phase 0 test: a legacy 4-digit account completes the forced 4→6
// PIN upgrade end to end, then signs back in with the new PIN. Needs the
// deployed rules that allow the self-write of pinLength, and consumes the
// QA-LEG4 account's legacy state (rerunning needs the account re-seeded).
//   QA_PHASE0_UPGRADE=1 npm run test:e2e -- phase0-upgrade
const RUN = process.env.QA_PHASE0_UPGRADE === '1';
const LEG_PIN = process.env.QA_LEG_PIN || '4471';
const NEW_PIN = process.env.QA_LEG_NEW_PIN || '664410';

test('legacy account completes the forced 4→6 PIN upgrade and re-logs-in', async ({ page }) => {
  test.skip(!RUN, 'Set QA_PHASE0_UPGRADE=1 (and seed QA-LEG4) to run');
  test.setTimeout(120000);

  // Login with the legacy 4-digit PIN
  await page.goto('/login');
  await page.getByLabel('User ID').fill('QA-LEG4');
  for (let i = 0; i < LEG_PIN.length; i++) {
    await page.getByLabel(`PIN digit ${i + 1}`).fill(LEG_PIN[i]);
  }
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText('Security upgrade — 6-digit PIN')).toBeVisible({ timeout: 15000 });

  // Complete the upgrade form. exact: true matters — getByLabel substring-
  // matches by default, and "New PIN digit 1" is a substring of
  // "Confirm new PIN digit 1".
  for (let i = 0; i < 4; i++) {
    await page.getByLabel(`Current PIN digit ${i + 1}`, { exact: true }).fill(LEG_PIN[i]);
  }
  for (let i = 0; i < 6; i++) {
    await page.getByLabel(`New PIN digit ${i + 1}`, { exact: true }).fill(NEW_PIN[i]);
  }
  for (let i = 0; i < 6; i++) {
    await page.getByLabel(`Confirm new PIN digit ${i + 1}`, { exact: true }).fill(NEW_PIN[i]);
  }
  await page.getByRole('button', { name: 'Upgrade PIN & Continue' }).click();

  // Gate lifts — the live profile listener picks up pinLength: 6 and the
  // app renders (QA-LEG4 is staff, so WorkerHome appears at /)
  await expect(page.getByText('Security upgrade — 6-digit PIN')).not.toBeVisible({ timeout: 20000 });
  await expect(page).toHaveURL('/', { timeout: 15000 });

  // Sign out (staff role — sign-out lives in the mobile/worker chrome or
  // sidebar depending on viewport; clear auth by direct navigation instead)
  await page.context().clearCookies();
  await page.evaluate(() => window.indexedDB.databases?.().then(dbs => dbs.forEach(d => window.indexedDB.deleteDatabase(d.name))));
  await page.reload();

  // Re-login with the NEW 6-digit PIN
  await page.goto('/login');
  await page.getByLabel('User ID').fill('QA-LEG4');
  for (let i = 0; i < NEW_PIN.length; i++) {
    await page.getByLabel(`PIN digit ${i + 1}`).fill(NEW_PIN[i]);
  }
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/', { timeout: 15000 });
  await expect(page.getByText('Security upgrade')).not.toBeVisible();
});
