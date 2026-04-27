import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

test.describe("Branded hero banner", () => {
  test("creates a branded hero banner and keeps the preview healthy", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/site" });

    const panel = page.getByTestId("hero-image-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });

    const brandButton = page.getByRole("button", { name: "Create branded banner" });
    await expect(brandButton).toBeVisible({ timeout: 15000 });

    const brandResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/organizations/hero-image/brand") &&
        r.request().method() === "POST",
      { timeout: 30000 },
    );

    await brandButton.click();

    const res = await brandResponse;
    const bodyText = await res.text().catch(() => "");
    expect(res.ok(), `Brand banner request failed: ${res.status()} ${bodyText}`).toBe(true);

    await expect(panel.getByRole("img", { name: "Hero banner" })).toBeVisible({ timeout: 15000 });
    await expect(panel.getByText("Branded banner created!")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("body")).not.toContainText(/UMA/);
    await expect(page.locator("body")).not.toContainText(
      /failed|internal server|cannot get/i,
    );
  });
});
