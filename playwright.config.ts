import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'default',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/auth-state.json',
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 14'],
        storageState: 'tests/auth-state.json',
      },
    },
    {
      name: 'ldqa',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://ldqa.stackedbench.com',
      },
    },
  ],
  webServer: baseURL.includes('localhost')
    ? {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
});
