const { test, expect } = require('@playwright/test');

// Requires real credentials, passed as env vars (never hardcoded — this
// file is committed to a public repo):
//   E2E_USER_ID=WA001 E2E_PIN=1234 npm run test:e2e -- service-job-adhoc
// Skips itself if they're not set, so the suite stays runnable without them.
// Only needs the manage:service-reports permission (not jobs:assign/jobs:vet)
// — this exercises the ad-hoc, technician-self-creates-and-completes path.
const { E2E_USER_ID, E2E_PIN } = process.env;

test('create an ad-hoc service job end to end', async ({ page }) => {
  test.skip(!E2E_USER_ID || !E2E_PIN, 'Set E2E_USER_ID and E2E_PIN to run this test');

  await page.goto('/login');
  await page.getByLabel('User ID').fill(E2E_USER_ID);
  for (let i = 0; i < E2E_PIN.length; i++) {
    await page.getByLabel(`PIN digit ${i + 1}`).fill(E2E_PIN[i]);
  }
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/', { timeout: 15000 });

  // Open the first customer's detail page
  await page.goto('/customers');
  await page.getByRole('heading', { level: 2 }).first().click();
  await expect(page).toHaveURL(/\/customers\/.+/);

  // Service Jobs section should be visible (permission was granted earlier)
  await expect(page.getByRole('heading', { name: 'Service Jobs' })).toBeVisible();
  await page.getByRole('button', { name: 'New Report' }).click();

  // Modal fetches the customer record before showing the form
  const jobDescription = `E2E test visit ${Date.now()}`;
  await expect(page.getByLabel('Job Description')).toBeVisible({ timeout: 10000 });
  await page.getByLabel('Job Description').fill(jobDescription);
  await page.getByLabel('Action Taken').fill('Automated test — no real work performed.');

  // Sign in the canvas pad (drag a couple of strokes) — must scroll it into
  // view first, since the modal body scrolls and a stale bounding box would
  // put the drag coordinates outside the visible canvas.
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 20);
  await page.mouse.move(box.x + 100, box.y + box.height - 20);
  await page.mouse.up();

  await page.getByLabel("Signer's Name").fill('E2E Test Signer');
  await page.getByRole('button', { name: 'Save Job' }).click();

  // Wait for the create modal to actually close (proves the Dropbox upload
  // + Firestore write succeeded) before looking for the list row — the
  // still-open form's own Job Description textarea contains the same
  // string, which would otherwise make a plain getByText(jobDescription)
  // match trivially true even if nothing was actually saved.
  await expect(page.getByRole('heading', { name: 'New Service Job' })).not.toBeVisible({ timeout: 30000 });

  // New job should show up at the top of the list
  const row = page.getByRole('button', { name: new RegExp(jobDescription) });
  await expect(row).toBeVisible();

  // Open it and confirm the print view renders what was entered
  await row.click();
  // level: 1 picks the print-area's own <h1> (the Modal chrome's <h2> title
  // bar also says "Service Report" — intentional duplication, since the
  // chrome is hidden during actual printing and the printed page needs its
  // own heading).
  await expect(page.getByRole('heading', { name: 'Service Report', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText('E2E Test Signer')).toBeVisible();
});
