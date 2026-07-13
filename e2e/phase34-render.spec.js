const { test, expect } = require('@playwright/test');

// Phase 3b + 4 back-test: the new Jobs board views (Board, Calendar) and the
// leave calendar render against real seeded data with no runtime errors. The
// drag WRITE shapes are statically verified against the deployed rules; here we
// prove the views mount, show the seeded jobs, and don't throw. Needs QA-MGR6
// (owner-equivalent) + seeded jobs/leave (setup-qa-users.js + seed-phase34.js).
const RUN = process.env.QA_PHASE34 === '1';
const MGR_PIN = process.env.QA_MGR_PIN || '902417';

async function login(page) {
  await page.goto('/login');
  await page.getByLabel('User ID').fill('QA-MGR6');
  for (let i = 0; i < MGR_PIN.length; i++) {
    await page.getByLabel(`PIN digit ${i + 1}`).fill(MGR_PIN[i]);
  }
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/', { timeout: 15000 });
}

test('Jobs board: List, Board and Calendar views all render the seeded jobs', async ({ page }) => {
  test.skip(!RUN, 'Set QA_PHASE34=1 (and seed) to run');
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await login(page);
  await page.goto('/jobs');
  await expect(page.getByRole('heading', { name: 'Service Jobs' })).toBeVisible({ timeout: 15000 });

  // List view (default): the seeded completed job appears.
  await expect(page.getByText('QA Phase0 Customer').first()).toBeVisible({ timeout: 10000 });

  // Board view: columns render, drag hint present.
  await page.getByRole('button', { name: 'Board' }).click();
  await expect(page.getByText(/Awaiting Vet|Drag a card/).first()).toBeVisible();
  await expect(page.getByText('QA Phase0 Customer').first()).toBeVisible();

  // Calendar view: the technician row + week grid render.
  await page.getByRole('button', { name: 'Calendar' }).click();
  await expect(page.getByText('Technician')).toBeVisible();
  await expect(page.getByText('QA Legacy (delete me)').first()).toBeVisible();

  await page.waitForTimeout(1000);
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('Leave calendar tab renders the month grid with a leave chip', async ({ page }) => {
  test.skip(!RUN, 'Set QA_PHASE34=1 (and seed) to run');
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await login(page);
  await page.goto('/leave');
  // Owner sees Approvals + Entitlements + Calendar tabs.
  await page.getByRole('button', { name: 'Calendar' }).click();

  // The seeded approved AL for QA Legacy should show as a chip somewhere in the grid.
  await expect(page.getByText(/QA Legacy/).first()).toBeVisible({ timeout: 10000 });

  await page.waitForTimeout(500);
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});
