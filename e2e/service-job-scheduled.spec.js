const path = require('path');
const { test, expect } = require('@playwright/test');

// Requires TWO real accounts, passed as env vars (never hardcoded — this
// file is committed to a public repo):
//   E2E_USER_ID / E2E_PIN             — a manager/owner with jobs:assign
//                                       and jobs:vet granted
//   E2E_STAFF_USER_ID / E2E_STAFF_PIN — a staff-role technician with
//                                       manage:service-reports granted
// Skips itself if any are missing, so the suite stays runnable without them.
const { E2E_USER_ID, E2E_PIN, E2E_STAFF_USER_ID, E2E_STAFF_PIN } = process.env;

async function login(page, userId, pin) {
  await page.goto('/login');
  await page.getByLabel('User ID').fill(userId);
  for (let i = 0; i < pin.length; i++) {
    await page.getByLabel(`PIN digit ${i + 1}`).fill(pin[i]);
  }
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/', { timeout: 15000 });
}

test('manager schedules a job, technician checks in and completes it, manager vets', async ({ browser }) => {
  test.skip(
    !E2E_USER_ID || !E2E_PIN || !E2E_STAFF_USER_ID || !E2E_STAFF_PIN,
    'Set E2E_USER_ID/E2E_PIN (manager) and E2E_STAFF_USER_ID/E2E_STAFF_PIN (technician) to run this test'
  );

  // Technician's own context — logs in first just to read their real display
  // name off WorkerHome's greeting, so the manager step can select the
  // right person without having to hardcode a name as a third env var.
  const techCtx = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: 1.4382, longitude: 103.7891 }, // Woodlands, SG
  });
  const techPage = await techCtx.newPage();
  await login(techPage, E2E_STAFF_USER_ID, E2E_STAFF_PIN);
  const greeting = await techPage.locator('p').first().textContent();
  const techName = greeting.split(',').slice(1).join(',').trim();
  expect(techName.length).toBeGreaterThan(0);

  // --- Manager: schedule the job ---
  const managerCtx = await browser.newContext();
  const managerPage = await managerCtx.newPage();
  await login(managerPage, E2E_USER_ID, E2E_PIN);

  await managerPage.goto('/customers');
  await managerPage.getByRole('heading', { level: 2 }).first().click();
  await expect(managerPage).toHaveURL(/\/customers\/.+/);

  await managerPage.getByRole('button', { name: 'Schedule Job' }).click();
  await managerPage.getByLabel(techName).check();
  const notes = `E2E scheduled job ${Date.now()}`;
  await managerPage.getByLabel('Notes for the technician').fill(notes);
  await managerPage.getByRole('button', { name: 'Schedule Job' }).nth(1).click();
  await expect(managerPage.getByRole('heading', { name: 'Schedule Job' })).not.toBeVisible({ timeout: 15000 });

  // --- Technician: check in, add a photo, complete + sign ---
  await techPage.reload();
  const jobCard = techPage.getByText(notes, { exact: false });
  await expect(jobCard).toBeVisible({ timeout: 15000 });
  await jobCard.click();
  await expect(techPage).toHaveURL(/\/jobs\/.+/);

  await techPage.getByRole('button', { name: 'Check In' }).click();
  await expect(techPage.getByText(/^Checked in$/)).toBeVisible({ timeout: 15000 });

  await techPage.locator('input[type="file"]').setInputFiles(path.join(__dirname, 'fixtures', 'test-photo.png'));
  await expect(techPage.getByText('Photos · 1')).toBeVisible({ timeout: 20000 });

  await techPage.getByRole('button', { name: /Complete Job/ }).click();
  const jobDescription = `E2E test visit ${Date.now()}`;
  await expect(techPage.getByLabel('Job Description')).toBeVisible({ timeout: 10000 });
  await techPage.getByLabel('Job Description').fill(jobDescription);
  await techPage.getByLabel('Action Taken').fill('Automated test — no real work performed.');

  const canvas = techPage.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await techPage.mouse.move(box.x + 20, box.y + box.height / 2);
  await techPage.mouse.down();
  await techPage.mouse.move(box.x + 60, box.y + 20);
  await techPage.mouse.move(box.x + 100, box.y + box.height - 20);
  await techPage.mouse.up();
  await techPage.getByLabel("Signer's Name").fill('E2E Test Signer');
  await techPage.getByRole('button', { name: 'Complete & Sign Off' }).click();
  // JobDetail navigates back to wherever the technician came from
  // (navigate(-1)) — that's WorkerHome ("/"), since that's where the job
  // card was clicked from.
  await expect(techPage).toHaveURL('/', { timeout: 30000 });

  // --- Manager: vet the completed job ---
  await managerPage.goto('/jobs');
  const boardRow = managerPage.getByRole('button', { name: new RegExp(jobDescription) });
  await expect(boardRow).toBeVisible({ timeout: 15000 });
  await boardRow.click();
  await managerPage.getByRole('button', { name: 'Vet & Approve' }).click();
  await expect(managerPage.getByText('Vetted', { exact: true }).first()).toBeVisible({ timeout: 15000 });

  await techCtx.close();
  await managerCtx.close();
});
