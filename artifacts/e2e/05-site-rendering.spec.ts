import { test, expect } from "@playwright/test";
import { CP } from "./helpers";

async function assertRouteResponds(page: any, path: string) {
  const errors: string[] = [];

  page.on("pageerror", (err: Error) => {
    errors.push(err.message);
  });

  const res = await page.goto(`${CP}${path}`, {
    waitUntil: "domcontentloaded",
  });

  expect(res?.status() ?? 0).toBeLessThan(500);

  const body = (await page.textContent("body")) ?? "";

  expect(body).not.toContain("Internal Server Error");
  expect(body).not.toContain("Cannot GET");
  expect(body).not.toContain("ECONNREFUSED");

  const syntaxErrors = errors.filter((e) => e.includes("SyntaxError"));
  expect(syntaxErrors).toHaveLength(0);
}

test.describe("Site Visual Rendering", () => {
  test("Homepage route is healthy above the fold", async ({ page }) => {
    await assertRouteResponds(page, "");
  });

  test("Homepage route renders on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await assertRouteResponds(page, "");
  });

  test("Members page route renders on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await assertRouteResponds(page, "/members");
  });

  test("Register page route renders on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await assertRouteResponds(page, "/members/register");
  });

  test("No mixed content warnings on any page", async ({ page }) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto(`${CP}/`, { waitUntil: "domcontentloaded" });

    const mixedContentErrors = errors.filter((e) =>
      e.toLowerCase().includes("mixed content"),
    );

    expect(mixedContentErrors).toHaveLength(0);
  });
});