// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// This app has no Firebase emulator set up — tests run against the live
// wa-network-cms project via whatever .env.local points to. Keep e2e tests
// read-only or clearly-scoped-to-test-data; there's no sandboxed backend.
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Deliberately on a dedicated port (3100, not the usual CRA 3000) —
  // this machine has other unrelated local servers, so testing must not
  // assume port 3000 is this project. Also sidesteps ever needing to
  // touch whatever's already listening on 3000.
  webServer: {
    command: 'set PORT=3100 && npm start',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
