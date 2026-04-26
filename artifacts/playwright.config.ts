import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120000,
  retries: 0,
  workers: 1,

  use: {
    headless: true,
    screenshot: "on",
    video: "on",
    trace: "on",
    baseURL: "http://localhost:5173",
    extraHTTPHeaders: { "x-org-id": "norwin-rotary" },
  },

  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
  ],

  reporter: [
    ["list"],
    ["html", { outputFolder: "e2e-report", open: "never" }],
  ],

  webServer: [
    {
      command:
        "set -a; source .env; set +a; pnpm --filter @workspace/api-server dev",
      port: 8080,
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command:
        "set -a; source .env; set +a; PORT=5001 pnpm --filter @workspace/community-platform dev",
      port: 5001,
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: "pnpm --filter @workspace/steward dev",
      port: 5173,
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});