import { defineConfig } from '@playwright/test';

export default defineConfig({
  // the tests start real teacher apps that broadcast on the LAN: run them one after another
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
});
