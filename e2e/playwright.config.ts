import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo root, resolved from this config's location (e2e/ -> ..). The webServer
// command and serve-e2e.mjs both rely on cwd === repo root.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// E2E config for the z-flow dashboard. Fully independent of Storybook: the
// webServer builds ONLY the dashboard custom-element bundle, then serves it
// alongside the standalone harness page (e2e/fixtures/index.html). One
// `npm run e2e` command spins the whole thing up — CI-ready.
const PORT = 4321;

export default defineConfig({
  testDir: './specs',
  testMatch: /.*\.e2e\.ts$/,
  workers: 1,
  retries: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Fixed viewport <1440 — above that the z-flow XL width-swap mutates card
    // widths and the stepped-resize assertions no longer hold.
    viewport: { width: 1280, height: 900 },
    actionTimeout: 10000,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
  webServer: {
    // Build the dashboard bundle, then serve it + the harness page. Both steps
    // must run from the repo root; Playwright otherwise defaults cwd to this
    // config's directory (e2e/), which breaks `node scripts/serve-e2e.mjs`.
    command: 'npm run build:wc-dashboard && node scripts/serve-e2e.mjs',
    cwd: repoRoot,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    // ng build for the dashboard app is the slow part — allow a generous cold
    // start.
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
