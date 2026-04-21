import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: "http://localhost:8080",
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    extraHTTPHeaders: {
      "x-org-id": "norwin-rotary-uic5",
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  reporter: [["list"], ["html", { outputFolder: "e2e-report", open: "never" }]],
});
