import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Public Site — Rendering", () => {
  test("Public site loads and renders real content", async ({ page }) => {
    // ensure org context exists
    await loginToSteward(page, {
      targetPath: "/dashboard",
    });

    // hit public site (root or slug-based depending on setup)
    await page.goto(STEWARD.replace("18402", "3000"), {
      waitUntil: "domcontentloaded",
    });

    const body = page.locator("body");

    await expect(body).toBeVisible();

    await expect(body).not.toContainText(/404|not found|something went wrong/i);

    const text = (await body.textContent()) ?? "";
    expect(text.length).toBeGreaterThan(100);

    // sanity checks for real site content
    const hasContent =
      text.includes("Rotary") ||
      text.includes("Club") ||
      text.includes("Event") ||
      text.includes("Contact") ||
      text.includes("Mission");

    expect(hasContent).toBe(true);
  });

  test("Public site renders hero + navigation elements", async ({ page }) => {
    await page.goto(STEWARD.replace("18402", "3000"), {
      waitUntil: "domcontentloaded",
    });

    const heroImage = page.locator("img").first();
    await expect(heroImage).toBeVisible({ timeout: 15000 });

    const nav = page.locator("nav");
    await expect(nav).toBeVisible();

    const links = nav.locator("a");
    const count = await links.count();

    expect(count).toBeGreaterThan(0);
  });
});