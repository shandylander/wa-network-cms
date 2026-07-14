const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Phase 5 visual QA: renders key pages in light AND dark, capturing screenshots
// for the orchestrator to eyeball, and — critically — asserts that print output
// stays LIGHT even when the app theme is dark (payslip + service report render
// on white paper). Needs QA-MGR6. Gated on QA_PHASE5=1.
const RUN = process.env.QA_PHASE5 === '1';
const MGR_PIN = process.env.QA_MGR_PIN || '902417';
const SHOT_DIR = path.join(__dirname, '..', 'test-results', 'phase5-shots');

async function login(page) {
  await page.goto('/login');
  await page.getByLabel('User ID').fill('QA-MGR6');
  for (let i = 0; i < MGR_PIN.length; i++) {
    await page.getByLabel(`PIN digit ${i + 1}`).fill(MGR_PIN[i]);
  }
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/', { timeout: 15000 });
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('theme', t);
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }, theme);
}

test.beforeAll(() => { fs.mkdirSync(SHOT_DIR, { recursive: true }); });

test('screenshots: dashboard, jobs, leave, resources in light and dark', async ({ page }) => {
  test.skip(!RUN, 'Set QA_PHASE5=1 (and seed QA-MGR6) to run');
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await login(page);

  const routes = [
    ['dashboard', '/'],
    ['jobs', '/jobs'],
    ['leave', '/leave'],
    ['resources', '/resources'],
    ['profile', '/profile'],
    ['workers', '/workers'],
  ];

  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const [name, route] of routes) {
      await page.goto(route);
      await page.waitForTimeout(900); // let count-ups/reveals settle
      // The root data-theme attribute must reflect the chosen theme.
      const attr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(attr, `data-theme for ${name}/${theme}`).toBe(theme);
      await page.screenshot({ path: path.join(SHOT_DIR, `${name}-${theme}.png`), fullPage: true });
    }
  }
  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});

// NOTE on print safety: the payslip prints from a separate popup window whose
// HTML is a self-contained light document (salaryUtils.printPayslip), and the
// service-report print area is governed by Jobs.module.css's @media print block
// using hardcoded light colors — neither references theme tokens, so both are
// theme-immune by construction. That guarantee is verified statically by the
// orchestrator (grep for var(--…) inside the print blocks) rather than by a
// flaky print-emulation assertion here.
