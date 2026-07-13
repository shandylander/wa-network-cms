const { test, expect } = require('@playwright/test');

// Phase 1 back-test: sidebar regrouping + HSE→Resources rename/routing.
// Needs an owner/manager-equivalent QA account already on the 6-digit
// standard (pinLength:6) so it skips the upgrade gate — seeded by the
// session's setup-qa-users.js (QA-MGR6). Gated on QA_PHASE1=1.
const RUN = process.env.QA_PHASE1 === '1';
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

test('sidebar shows the regrouped zones and renamed items', async ({ page }) => {
  test.skip(!RUN, 'Set QA_PHASE1=1 (and seed QA-MGR6) to run');
  await login(page, 'QA-MGR6', MGR_PIN);

  const sidebar = page.locator('aside');
  // Zone labels
  for (const zone of ['Overview', 'Operations', 'People', 'Company', 'Account']) {
    await expect(sidebar.getByText(zone, { exact: true })).toBeVisible();
  }
  // Renamed items present
  await expect(sidebar.getByRole('link', { name: 'Resources' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Service Jobs' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Site Workforce' })).toBeVisible();
  // Old labels gone from the sidebar
  await expect(sidebar.getByRole('link', { name: 'HSE', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Uploads Audit' })).toHaveCount(0);
});

test('Resources page loads and /hse redirects to it', async ({ page }) => {
  test.skip(!RUN, 'Set QA_PHASE1=1 (and seed QA-MGR6) to run');
  await login(page, 'QA-MGR6', MGR_PIN);

  await page.goto('/resources');
  await expect(page.getByRole('heading', { name: 'Resources', level: 1 })).toBeVisible();
  await expect(page.getByText('Safety forms, training manuals, standards and templates')).toBeVisible();

  // Legacy route redirects
  await page.goto('/hse');
  await expect(page).toHaveURL(/\/resources$/, { timeout: 10000 });
});

test('Resources category filter chips and search are present', async ({ page }) => {
  test.skip(!RUN, 'Set QA_PHASE1=1 (and seed QA-MGR6) to run');
  await login(page, 'QA-MGR6', MGR_PIN);
  await page.goto('/resources');

  // If the seeded PCS docs are visible, the toolbar renders; otherwise the
  // empty state shows. Either is a valid pass — assert the page didn't crash
  // and, when docs exist, the chips/search exist.
  const hasDocs = await page.getByRole('button', { name: /^All \(/ }).count();
  if (hasDocs > 0) {
    await expect(page.getByRole('button', { name: /HSE & Safety/ })).toBeVisible();
    await expect(page.getByPlaceholder('Search documents…')).toBeVisible();
  } else {
    await expect(page.getByText('No documents available')).toBeVisible();
  }
});

test('Uploads Audit is reachable from Settings', async ({ page }) => {
  test.skip(!RUN, 'Set QA_PHASE1=1 (and seed QA-MGR6) to run');
  await login(page, 'QA-MGR6', MGR_PIN);
  await page.goto('/settings');
  await expect(page.getByRole('link', { name: /Uploads Audit/ })).toBeVisible();
});
