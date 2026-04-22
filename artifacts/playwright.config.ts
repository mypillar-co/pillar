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
    extraHTTPHeaders: { "x-org-id": "norwin-rotary-uic5" },
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
});
