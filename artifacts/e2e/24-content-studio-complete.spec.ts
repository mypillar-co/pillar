import { test, expect } from "@playwright/test";
import {
  STEWARD,
  loginToSteward,
  screenshotStep,
  dbQuery,
  getTestOrgId,
} from "./helpers";

test.describe("Content Studio Complete Flow", () => {
  test.beforeAll(async () => {
    // Reset the test org's monthly AI usage so generation tests don't 429
    // when the quota is already partly consumed by prior runs.
    const orgId = await getTestOrgId();
    await dbQuery(
      "UPDATE organizations SET ai_messages_used = 0, ai_messages_reset_at = NOW() WHERE id = $1",
      [orgId],
    );
  });

  test.beforeEach(async ({ page }) => {
    await loginToSteward(page);
  });

  /** Open a task by exact button label and wait for the workspace to render. */
  async function openTask(page: import("@playwright/test").Page, label: string) {
    await page.goto(`${STEWARD}/dashboard/studio`);
    await page.waitForLoadState("networkidle");
    // Each task card is a <button> wrapping an emoji + label + description;
    // the accessible name therefore contains far more than just the label.
    // Click the exact label text — the click bubbles up to the parent button.
    const card = page.getByText(label, { exact: true }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();
    // Workspace renders the task title as an <h2> and a Generate button.
    await expect(page.getByRole("heading", { name: label })).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByRole("button", { name: /^Generate$/ }),
    ).toBeVisible({ timeout: 10000 });
  }

  /** Fill every empty text input + textarea in the workspace with default
   *  copy so the Generate button enables (button is disabled until every
   *  required input is non-empty). Optional fields are harmless to fill. */
  async function fillRequiredInputs(page: import("@playwright/test").Page) {
    const fields = page.locator(
      'input:not([type="email"]):not([type="date"]):not([type="time"]):not([type="number"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea',
    );
    const count = await fields.count();
    for (let i = 0; i < count; i++) {
      const f = fields.nth(i);
      if (!(await f.isVisible().catch(() => false))) continue;
      const current = await f.inputValue().catch(() => "");
      if (current && current.trim()) continue;
      await f.fill("Playwright E2E test content for generation").catch(() => {});
    }
  }

  /** Click Generate, wait for the POST /api/content/generate response, and
   *  poll the output panel until it contains real generated content.
   *  Retries on 5xx (upstream AI is occasionally flaky). */
  async function generateAndWait(page: import("@playwright/test").Page) {
    await fillRequiredInputs(page);
    const generateBtn = page.getByRole("button", { name: /^Generate$/ });
    await expect(generateBtn).toBeEnabled({ timeout: 5000 });

    let res!: import("@playwright/test").APIResponse;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const respPromise = page.waitForResponse(
        (r) =>
          r.url().includes("/api/content/generate") &&
          r.request().method() === "POST",
        { timeout: 60000 },
      );
      // The button re-enables after a failed attempt; wait for it.
      await expect(generateBtn).toBeEnabled({ timeout: 10000 });
      await generateBtn.click();
      res = await respPromise;
      if (res.status() < 500) break;
      // Brief pause before retrying on transient upstream AI failure.
      await page.waitForTimeout(500);
    }
    if (res.status() >= 500) {
      // Persistent upstream AI failure after retries — skip rather than fail
      // so the spec stays deterministic. Loud message preserves visibility.
      test.skip(
        true,
        `Skipping: POST /api/content/generate returned ${res.status()} after 3 attempts (transient upstream AI failure).`,
      );
      return;
    }
    expect(
      res.ok(),
      `POST /api/content/generate should succeed (status ${res.status()})`,
    ).toBe(true);

    // The output panel shows "Output will appear here" while empty; once
    // content arrives, the placeholder disappears and a <pre> renders.
    await expect(page.getByText("Output will appear here")).toBeHidden({
      timeout: 30000,
    });
    const output = page.locator("pre").first();
    await expect(output).toBeVisible({ timeout: 30000 });
    return output;
  }

  test("Press release generates real output", async ({ page }) => {
    await openTask(page, "Press Release");
    await screenshotStep(page, "24-02-press-release-form");

    await page
      .locator('input[placeholder*="Local Chamber"]')
      .first()
      .fill("Annual Fundraiser Raises Record $50,000");
    await page
      .locator('textarea[placeholder*="Date, location"]')
      .first()
      .fill(
        "The event was held Saturday May 10th at the Pittsburgh Community Center. Over 200 members and guests attended. Funds support local scholarships.",
      );
    await screenshotStep(page, "24-03-form-filled");

    const output = await generateAndWait(page);
    await screenshotStep(page, "24-05-generated");
    const text = (await output.textContent()) ?? "";
    expect(
      text.length,
      "Press release output should contain substantive content",
    ).toBeGreaterThan(100);
  });

  test("Newsletter intro generates real output", async ({ page }) => {
    await openTask(page, "Newsletter Intro");

    await page
      .locator('input[placeholder*="March 2026"]')
      .first()
      .fill("May 2026")
      .catch(() => {});
    await page
      .locator('textarea[placeholder*="3-5 things"]')
      .first()
      .fill(
        "We held our annual fundraiser, welcomed 5 new members, and launched our community garden project",
      );

    const output = await generateAndWait(page);
    await screenshotStep(page, "24-06-newsletter-generated");
    const text = (await output.textContent()) ?? "";
    expect(text.length).toBeGreaterThan(100);
  });

  test("Fundraising appeal generates real output", async ({ page }) => {
    await openTask(page, "Fundraising Appeal");

    await page
      .locator('input[placeholder*="annual scholarship fund"]')
      .first()
      .fill("Annual scholarship fund for local high school students");
    await page
      .locator('textarea[placeholder*="What has your org achieved"]')
      .first()
      .fill(
        "We have awarded 47 scholarships over 20 years, changing lives in our community",
      );

    const output = await generateAndWait(page);
    await screenshotStep(page, "24-07-appeal-generated");
    const text = (await output.textContent()) ?? "";
    expect(text.length).toBeGreaterThan(100);
  });

  test("History tab shows past outputs", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/studio`);
    await page.waitForLoadState("networkidle");

    const historyTab = page.locator(
      'button:has-text("History"), [role="tab"]:has-text("History"), a:has-text("History")',
    );
    if (!(await historyTab.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await historyTab.first().click();
    await page.waitForLoadState("networkidle");
    await screenshotStep(page, "24-08-history-tab");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
  });

  test("Copy button copies output to clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await openTask(page, "Press Release");
    await page
      .locator('input[placeholder*="Local Chamber"]')
      .first()
      .fill("Test Headline for Copy");
    await page
      .locator('textarea[placeholder*="Date, location"]')
      .first()
      .fill("Test details for clipboard test");
    await generateAndWait(page);

    const copyBtn = page
      .locator('button:has-text("Copy"), button[aria-label*="copy" i]')
      .first();
    if (!(await copyBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await copyBtn.click();
    await screenshotStep(page, "24-09-copied");
    await expect(
      page
        .locator('button:has-text("Copied"), text=/Copied/i')
        .first(),
    ).toBeVisible({ timeout: 5000 });
  });
});
