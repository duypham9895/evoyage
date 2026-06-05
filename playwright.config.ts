import { defineConfig } from 'playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e',
  timeout: process.env.CI ? 60_000 : 30_000,
  retries: 2,
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- -p 3001',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    // Desktop browsers
    {
      name: 'Desktop Chrome',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'Desktop Safari',
      use: {
        browserName: 'webkit',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'Desktop Firefox',
      use: {
        browserName: 'firefox',
        viewport: { width: 1440, height: 900 },
      },
    },
    // Mobile browsers (reference design viewport 393x852)
    {
      name: 'Mobile Chrome',
      use: {
        browserName: 'chromium',
        viewport: { width: 393, height: 852 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'Mobile Safari',
      use: {
        browserName: 'webkit',
        viewport: { width: 393, height: 852 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
