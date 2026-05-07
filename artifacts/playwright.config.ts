import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

for (const envPath of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../.env")]) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
  break;
}

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
        "ENV_FILE=.env; [ -f \"$ENV_FILE\" ] || ENV_FILE=../.env; [ -f \"$ENV_FILE\" ] && set -a && . \"$ENV_FILE\" && set +a; pnpm --filter @workspace/api-server dev",
      port: 8080,
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command:
        "ENV_FILE=.env; [ -f \"$ENV_FILE\" ] || ENV_FILE=../.env; [ -f \"$ENV_FILE\" ] && set -a && . \"$ENV_FILE\" && set +a; PORT=5001 pnpm --filter @workspace/community-platform dev",
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
