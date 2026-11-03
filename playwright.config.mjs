import { defineConfig } from '@playwright/test';
import { pageUrl, pinnedChromiumExecutable } from './repro-config.mjs';

const headed = process.env.HEADED === '1';

const useOptions = {
  baseURL: pageUrl,
  headless: !headed,
  viewport: { width: 900, height: 700 },
  actionTimeout: 10000,
  launchOptions: {
    executablePath: pinnedChromiumExecutable,
  },
};

export default defineConfig({
  testDir: '.',
  testMatch: 'sign-in.spec.js',
  testIgnore: ['**/.playwright-versions/**'],
  retries: 0,
  workers: 1,
  timeout: 30000,
  reporter: [['line']],
  use: useOptions,
  webServer: {
    command: 'node serve.mjs',
    url: pageUrl,
    reuseExistingServer: true,
    timeout: 15000,
  },
});
