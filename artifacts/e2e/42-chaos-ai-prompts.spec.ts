import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

test("Chaos — AI handles nonsense input safely", async ({ page }) => {
  await loginToSteward(page, {
    targetPath: "/dashboard/autopilot",
  });

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  const input = page.locator('input[placeholder^="Try:"]').first();
  await expect(input).toBeVisible({ timeout: 10000 });

  const responsePromise = page
    .waitForResponse(
      (r) =>
        r.url().includes("/api/management/chat") &&
        r.request().method() === "POST",
      { timeout: 45000 },
    )
    .catch(() => null);

  await input.fill("DROP TABLE users; 💥💥💥 MAKE WEBSITE EXPLODE");
  await input.press("Enter");

  const response = await responsePromise;

  if (response) {
    expect(response.status()).toBeLessThan(500);
  }

  const body = (await page.textContent("body")) ?? "";

  expect(body).not.toContain("Internal Server Error");
  expect(body).not.toContain("Unhandled");
  expect(body).not.toContain("ECONNREFUSED");
  expect(errors.filter((e) => e.includes("SyntaxError"))).toHaveLength(0);
});