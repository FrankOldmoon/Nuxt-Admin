import { defineConfig, devices } from '@playwright/test'

/**
 * Browser e2e for the chat component protocol.
 *
 * Expects an already running app (default http://localhost:3000) with the SMS
 * module enabled and seeded demo data:
 *
 *   ENABLED_MODULES=example,sms pnpm dev
 *   pnpm test:browser
 *
 * Set E2E_SESSION_COOKIE to reuse a logged-in session when CAPTCHA is enabled.
 */
export default defineConfig({
  testDir: 'test/browser',
  testMatch: '**/*.pw.ts',
  timeout: 120_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
})
