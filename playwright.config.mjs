import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 8_000
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'msedge',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node tools/serve.cjs',
    port: 4173,
    reuseExistingServer: true
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'msedge',
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: 'mobile-landscape',
      use: {
        channel: 'msedge',
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true
      }
    }
  ]
});
