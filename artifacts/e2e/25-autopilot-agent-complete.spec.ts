import { test, expect, Page } from "@playwright/test";
import { loginToSteward } from "./helpers";

async function openAutopilot(page: Page) {
  await loginToSteward(page, {
    targetPath: "/dashboard/autopilot",
  });

  const input = page.locator('input[placeholder^="Try:"]').first();
  await expect(input).toBeVisible({ timeout: 10000 });
  return input;
}

async function askAutopilot(page: Page, message: string) {
  const input = await openAutopilot(page);

  const before = (await page.textContent("body")) ?? "";

  const responsePromise = page
    .waitForResponse(
      (r) =>
        r.url().includes("/api/") &&
        r.request().method() === "POST",
      { timeout: 15000 },
    )
    .catch(() => null);

  await input.fill(message);
  await input.press("Enter");

  const response = await responsePromise;

  if (!response) {
    throw new Error("Autopilot did not send any POST /api request after Enter");
  }

  const responseText = await response.text().catch(() => "");
  console.log("[AUTOPILOT_RESPONSE]", response.status(), response.url(), responseText);

  expect(response.ok(), `Autopilot request failed: ${response.status()} ${responseText}`).toBe(true);

  await expect
    .poll(
      async () => {
        const after = (await page.textContent("body")) ?? "";
        return after.length > before.length && after !== before;
      },
      { timeout: 30000 },
    )
    .toBeTruthy();

  return (await page.textContent("body")) ?? "";
}

test.describe("Autopilot Agent Complete Flow", () => {
  test("Agent responds to how many members question", async ({ page }) => {
    const body = await askAutopilot(page, "How many members do we have?");

    expect(
      body.includes("member") || body.includes("Member") || /\d/.test(body),
    ).toBe(true);
  });
});