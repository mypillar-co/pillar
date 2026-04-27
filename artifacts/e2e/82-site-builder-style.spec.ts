import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

test.describe("Site builder style controls", () => {
  test("keeps suggested photos secondary and refreshes preview after style change", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/site" });

    const panel = page.getByTestId("hero-image-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Create branded banner" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Browse suggested photos" })).toBeVisible();

    const styleSelector = page.getByTestId("site-style-selector");
    await expect(styleSelector).toBeVisible({ timeout: 15000 });
    await expect(styleSelector.getByRole("button", { name: "Heritage" })).toBeVisible();

    const previewShell = page.getByTestId("site-preview-shell");
    await expect(previewShell).toBeVisible({ timeout: 15000 });
    const before = Number(await previewShell.getAttribute("data-preview-refresh-count"));

    const styleResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/community-site/style") &&
        r.request().method() === "POST",
      { timeout: 30000 },
    );

    await styleSelector.getByRole("button", { name: "Heritage" }).click();

    const res = await styleResponse;
    const bodyText = await res.text().catch(() => "");
    expect(res.ok(), `Style update failed: ${res.status()} ${bodyText}`).toBe(true);

    await expect
      .poll(async () => Number(await previewShell.getAttribute("data-preview-refresh-count")), {
        timeout: 15000,
      })
      .toBeGreaterThan(before);

    await expect(page.locator('iframe[title="Site preview"]')).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/UMA/);
  });
});
