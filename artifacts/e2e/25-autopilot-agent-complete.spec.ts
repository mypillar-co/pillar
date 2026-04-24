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

  const responsePromise = page.waitForResponse(
    (r) =>
      r.url().includes("/api/management/chat") &&
      r.request().method() === "POST",
    { timeout: 45000 },
  );

  await input.fill(message);
  await input.press("Enter");

  const response = await responsePromise;
  const responseText = await response.text();

  console.log("[AUTOPILOT_RESPONSE]", response.status(), response.url(), responseText);

  expect(
    response.ok(),
    `Autopilot request failed: ${response.status()} ${responseText}`,
  ).toBe(true);

  const json = JSON.parse(responseText);
  expect(json.reply, "Autopilot response should include reply").toBeTruthy();

  return String(json.reply);
}

test.describe("Autopilot Agent Complete Flow", () => {
  test("Agent responds to how many members question", async ({ page }) => {
    const body = await askAutopilot(page, "How many members do we have?");

    expect(
      body.includes("member") ||
        body.includes("Member") ||
        /\d/.test(body),
    ).toBe(true);
  });

  test("Agent responds to list events question", async ({ page }) => {
    const body = await askAutopilot(page, "List our upcoming events");

    expect(
      body.includes("event") ||
        body.includes("Event") ||
        body.length > 100,
    ).toBe(true);
  });

  test("Agent responds to site settings question", async ({ page }) => {
    const body = await askAutopilot(page, "What are our current site settings?");

    expect(
      body.includes("color") ||
        body.includes("Color") ||
        body.includes("contact") ||
        body.includes("Contact") ||
        body.includes("tagline") ||
        body.includes("Tagline"),
    ).toBe(true);
  });

  test("Agent responds gracefully to unknown request", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    const body = await askAutopilot(
      page,
      "xyzzy frobulate the quantum donut",
    );

    expect(body.length).toBeGreaterThan(50);

    const syntaxErrors = errors.filter((e) => e.includes("SyntaxError"));
    expect(syntaxErrors).toHaveLength(0);
  });

  test("Agent handles self test request", async ({ page }) => {
    const body = await askAutopilot(page, "Run a self test");

    expect(
      body.includes("PASS") ||
        body.includes("pass") ||
        body.includes("✓") ||
        body.includes("working") ||
        body.includes("healthy") ||
        body.includes("OK") ||
        body.includes("restricted") ||
        body.includes("permission") ||
        body.includes("admin"),
    ).toBe(true);
  });
});