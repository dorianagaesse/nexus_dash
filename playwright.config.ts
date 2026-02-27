import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const localBaseURL = `http://127.0.0.1:${PORT}`;
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL?.trim();
const baseURL = externalBaseURL || localBaseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: externalBaseURL
    ? undefined
    : {
        // `npm run start` runs migrations again; run Next directly here to avoid
        // flaky startup failures in CI after migrations have already been applied.
        command: `npm run db:migrate && npm run build && npx next start --hostname 127.0.0.1 --port ${PORT}`,
        url: `${localBaseURL}/projects`,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
