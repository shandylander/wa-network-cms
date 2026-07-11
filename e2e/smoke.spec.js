const { test, expect } = require('@playwright/test');

// Credential-free smoke test — proves the pipeline works (dev server up,
// real DOM rendered) without embedding any login PIN in a file that gets
// committed to a public repo. Add authenticated tests separately, reading
// credentials from environment variables (never hardcoded) — see README
// note in playwright.config.js.
test('login page renders with User ID and PIN fields', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByLabel('User ID')).toBeVisible();
  await expect(page.getByLabel('PIN digit 1')).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});
