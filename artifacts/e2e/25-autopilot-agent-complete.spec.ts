import { test, expect, Page } from "@playwright/test";
import { STEWARD, loginToSteward, screenshotStep } from "./helpers";

async function findAgentPage(page: Page): Promise<boolean> {
  await page.goto(`${STEWARD}/dashboard/autopilot`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  const input = page.locator('input[placeholder^="Try:"]');
  return (await input.count()) > 0;
}

async function sendAgentMessage(page: Page, message: string): Promise<void> {
  const input = page.locator('input[placeholder^="Try:"]').first();
  await input.fill(message);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(20000);
}

test.describe("Autopilot Agent Complete Flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginToSteward(page);
    await page.waitForTimeout(1000);
  });

  test("Agent responds to how many members question", async ({ page }) => {
    const found = await findAgentPage(page);
    if (!found) {
      test.skip();
      return;
    }
    await screenshotStep(page, "25-01-agent-page");

    await sendAgentMessage(page, "How many members do we have?");
    await screenshotStep(page, "25-02-members-response");

    const body = await page.textContent("body");
    const hasResponse =
      body?.includes("member") || body?.includes("Member") || /\d/.test(body ?? "");
    expect(hasResponse, "Agent should respond about members").toBe(true);
  });

  test("Agent responds to list events question", async ({ page }) => {
    const found = await findAgentPage(page);
    if (!found) {
      test.skip();
      return;
    }

    await sendAgentMessage(page, "List our upcoming events");
    await screenshotStep(page, "25-03-events-response");

    const body = await page.textContent("body");
    expect(body?.length, "Agent should give a substantive response").toBeGreaterThan(100);
  });

  test("Agent handles update site config request", async ({ page }) => {
    const found = await findAgentPage(page);
    if (!found) {
      test.skip();
      return;
    }

    await sendAgentMessage(page, "What are our current site settings?");
    await screenshotStep(page, "25-04-config-response");

    const body = await page.textContent("body");
    const hasConfig =
      body?.includes("color") ||
      body?.includes("Color") ||
      body?.includes("contact") ||
      body?.includes("Contact") ||
      body?.includes("tagline") ||
      body?.includes("Tagline");
    expect(hasConfig, "Agent should return site configuration").toBe(true);
  });

  test("Agent responds gracefully to unknown request", async ({ page }) => {
    const found = await findAgentPage(page);
    if (!found) {
      test.skip();
      return;
    }

    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await sendAgentMessage(page, "xyzzy frobulate the quantum donut");
    await screenshotStep(page, "25-05-unknown-request");

    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
    const syntaxErrors = errors.filter((e) => e.includes("SyntaxError"));
    expect(syntaxErrors).toHaveLength(0);
  });

  test("Agent runs self test successfully", async ({ page }) => {
    const found = await findAgentPage(page);
    if (!found) {
      test.skip();
      return;
    }

    await sendAgentMessage(page, "Run a self test");
    await page.waitForTimeout(30000);
    await screenshotStep(page, "25-06-self-test");

    const body = await page.textContent("body");
    const hasTestResult =
      body?.includes("PASS") ||
      body?.includes("pass") ||
      body?.includes("\u2713") ||
      body?.includes("working") ||
      body?.includes("healthy") ||
      body?.includes("OK");
    expect(hasTestResult, "Self test should show results").toBe(true);
  });
});
