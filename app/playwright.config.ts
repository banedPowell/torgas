import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 4173)
const baseURL = `http://127.0.0.1:${PORT}`
const viewport = { width: 1280, height: 800 }

/**
 * Tests de bout en bout sur le build statique (`nuxt generate`, SPA) servi par `e2e/serve.mjs`.
 * `E2E_SKIP_BUILD=1` réutilise le dernier `.output/public` (itérations locales) ; `E2E_PORT`
 * change le port (plusieurs copies du dépôt testées en même temps).
 * Chaque test reçoit un contexte de navigateur neuf : OPFS et localStorage vides.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: 'fr-FR',
    viewport,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport } },
  ],
  webServer: {
    command: `${process.env.E2E_SKIP_BUILD ? '' : 'pnpm generate && '}node e2e/serve.mjs`,
    url: baseURL,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'pipe',
  },
})
