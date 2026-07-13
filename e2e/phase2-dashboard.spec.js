const { test, expect } = require('@playwright/test');

// Phase 2 back-test: the rebuilt dashboard renders its new sections against
// real data without crashing. Detector correctness is covered separately by
// src/utils/attentionEngine.test.js (unit). Needs QA-MGR6 (owner-equivalent,
// pinLength:6). Gated on QA_PHASE2=1.
const RUN = process.env.QA_PHASE2 === '1';
const MGR_PIN = process.env.QA_MGR_PIN || '902417';

async function login(page, userId, pin) {
  await page.goto('/login');
  await page.getByLabel('User ID').fill(userId);
  for (let i = 0; i < pin.length; i++) {
    await page.getByLabel(`PIN digit ${i + 1}`).fill(pin[i]);
  }
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/', { timeout: 15000 });
}

test('dashboard renders KPI strip, Needs Attention, and project sections', async ({ page }) => {
  test.skip(!RUN, 'Set QA_PHASE2=1 (and seed QA-MGR6) to run');
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await login(page, 'QA-MGR6', MGR_PIN);

  // KPI strip: scope to the KPI label spans specifically — "Active Projects"
  // also appears as a section heading further down the page, so an unscoped
  // getByText would match both.
  const kpiLabels = page.locator('[class*="kpiLabel"]');
  await expect(kpiLabels.filter({ hasText: 'Active Projects' })).toBeVisible({ timeout: 15000 });
  await expect(kpiLabels.filter({ hasText: 'Workers' })).toBeVisible();

  // Needs Attention section always renders (feed or "all clear").
  await expect(page.getByRole('heading', { name: 'Needs Attention' })).toBeVisible();

  // A real KPI number rendered next to the label (count-up leaves a numeric
  // value in the sibling .kpiVal).
  const kpiVals = page.locator('[class*="kpiVal"]');
  await expect(kpiVals.first()).toHaveText(/[\d$]/, { timeout: 5000 });

  // No uncaught runtime errors during load/animation.
  await page.waitForTimeout(1500);
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('clicking a Needs Attention row (if any) navigates without error', async ({ page }) => {
  test.skip(!RUN, 'Set QA_PHASE2=1 (and seed QA-MGR6) to run');
  await login(page, 'QA-MGR6', MGR_PIN);
  await expect(page.getByRole('heading', { name: 'Needs Attention' })).toBeVisible();

  const rows = page.locator('button', { hasText: /./ }).filter({ has: page.locator('span') });
  // Only assert navigation if the feed actually has rows; an "all clear"
  // state is an equally valid pass and needs no interaction.
  const allClear = await page.getByText('All clear').count();
  if (allClear === 0) {
    // The first attention row should navigate somewhere in-app.
    const firstAttn = page.locator('[class*="attnRow"]').first();
    if (await firstAttn.count() > 0) {
      await firstAttn.click();
      await expect(page).not.toHaveURL('/login');
    }
  }
});
