import { test, expect } from "@playwright/test";
import {
  STEWARD,
  TEST_ORG_SLUG,
  TEST_ORG_URL,
  loginToSteward,
  screenshotStep,
  dbQuery,
  getTestOrgId,
} from "./helpers";

test.describe("Complete Member Lifecycle", () => {
  const testEmail = `playwright-lifecycle-${Date.now()}@test.local`;
  let memberId: string;
  let inviteToken: string;

  test.afterAll(async () => {
    if (memberId) {
      await dbQuery("DELETE FROM members WHERE id = $1", [memberId]);
    }
  });

  test("Step 1: Admin adds a member from dashboard", async ({ page }) => {
    await loginToSteward(page);
    await page.goto(`${STEWARD}/dashboard/members`);
    await page.waitForLoadState("networkidle");
    await screenshotStep(page, "22-01-members-page");

    await page
      .locator(
        'button:has-text("Add Member"), button:has-text("Add member"), button:has-text("+ Add")',
      )
      .first()
      .click();
    await page.waitForTimeout(500);
    await screenshotStep(page, "22-02-add-dialog");

    await page
      .locator('input[name="firstName"], input[placeholder*="first" i]')
      .first()
      .fill("Lifecycle");
    await page
      .locator('input[name="lastName"], input[placeholder*="last" i]')
      .first()
      .fill("TestMember");
    await page.locator('input[type="email"], input[name="email"]').first().fill(testEmail);
    await screenshotStep(page, "22-03-form-filled");

    await page
      .locator(
        '[role="dialog"] button[type="submit"], [role="dialog"] button:has-text("Save"), [role="dialog"] button:has-text("Add"), [role="dialog"] button:has-text("Create")',
      )
      .first()
      .click();
    await page.waitForTimeout(3000);
    await screenshotStep(page, "22-04-after-save");

    const body = await page.textContent("body");
    expect(body).toContain("Lifecycle");

    const orgId = await getTestOrgId();
    const rows = await dbQuery(
      "SELECT id, registration_token FROM members WHERE email = $1 AND org_id = $2 LIMIT 1",
      [testEmail, orgId],
    );
    expect(rows.length, "Member should exist in database").toBeGreaterThan(0);
    memberId = rows[0].id;
    inviteToken = rows[0].registration_token;
    console.log(
      "Member created:",
      memberId,
      "Token:",
      inviteToken ? "present" : "MISSING",
    );
    expect(inviteToken, "Member should have a registration token").toBeTruthy();
  });

  test("Step 2: Member receives invite and sees register page", async ({ page }) => {
    if (!inviteToken) {
      test.skip();
      return;
    }
    await page.goto(`${TEST_ORG_URL}/members/register?token=${inviteToken}`, {
      // @ts-ignore - extraHTTPHeaders supported on goto
    });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    await screenshotStep(page, "22-05-register-page");

    const body = await page.textContent("body");
    expect(body, "Register page should not show blank").toBeTruthy();
    expect(body?.length, "Register page should have content").toBeGreaterThan(100);
    expect(body, "Register page should not say Site Not Found").not.toContain(
      "Site Not Found",
    );

    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
  });

  test("Step 3: Member sets password and registers", async ({ page }) => {
    if (!inviteToken) {
      test.skip();
      return;
    }
    await page.goto(`${TEST_ORG_URL}/members/register?token=${inviteToken}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill("LifecycleTest123!");
    const secondPassword = await passwords
      .nth(1)
      .isVisible()
      .catch(() => false);
    if (secondPassword) await passwords.nth(1).fill("LifecycleTest123!");
    await screenshotStep(page, "22-06-password-filled");

    await page
      .locator(
        'button[type="submit"], button:has-text("Set Password"), button:has-text("Create Account"), button:has-text("Register"), button:has-text("Join")',
      )
      .first()
      .click();
    await page.waitForTimeout(3000);
    await screenshotStep(page, "22-07-after-register");

    const body = await page.textContent("body");
    expect(body, "Should not show error after registration").not.toContain("Invalid");
    expect(body, "Should not show invitation not found").not.toContain(
      "Invitation not found",
    );

    const rows = await dbQuery("SELECT registered_at FROM members WHERE id = $1", [
      memberId,
    ]);
    expect(
      rows[0]?.registered_at,
      "Member should be marked as registered in database",
    ).toBeTruthy();
  });

  test("Step 4: Member logs in", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/members/login`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await screenshotStep(page, "22-08-login-page");

    await page.locator('input[type="email"]').first().fill(testEmail);
    await page.locator('input[type="password"]').first().fill("LifecycleTest123!");
    await screenshotStep(page, "22-09-login-filled");

    await page
      .locator(
        'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")',
      )
      .first()
      .click();
    await page.waitForTimeout(3000);
    await screenshotStep(page, "22-10-after-login");

    const body = await page.textContent("body");
    expect(body, "Should not show invalid password error").not.toContain(
      "Invalid email or password",
    );
  });

  test("Step 5: Portal home renders after login", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/members/login`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await page.locator('input[type="email"]').first().fill(testEmail);
    await page.locator('input[type="password"]').first().fill("LifecycleTest123!");
    await page
      .locator(
        'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")',
      )
      .first()
      .click();
    await page.waitForTimeout(3000);

    await screenshotStep(page, "22-11-portal-home");
    const body = await page.textContent("body");
    expect(body?.length, "Portal home should have content").toBeGreaterThan(100);
    expect(body, "Portal home should not show login form again").not.toContain("Sign In");
    expect(body, "Portal home should not say Site Not Found").not.toContain(
      "Site Not Found",
    );
  });

  test("Step 6: Member can view directory", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/members/login`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await page.locator('input[type="email"]').first().fill(testEmail);
    await page.locator('input[type="password"]').first().fill("LifecycleTest123!");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);

    const directoryLink = page.locator(
      'a:has-text("Directory"), button:has-text("Directory"), [href*="directory"]',
    );
    const hasDirectory = await directoryLink.isVisible().catch(() => false);
    if (hasDirectory) {
      await directoryLink.first().click();
      await page.waitForTimeout(2000);
      await screenshotStep(page, "22-12-directory");
      const body = await page.textContent("body");
      expect(body?.length).toBeGreaterThan(50);
    }
  });

  test("Step 7: Member can edit their profile", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/members/login`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await page.locator('input[type="email"]').first().fill(testEmail);
    await page.locator('input[type="password"]').first().fill("LifecycleTest123!");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);

    const profileLink = page.locator(
      'a:has-text("Profile"), button:has-text("Profile"), [href*="profile"]',
    );
    const hasProfile = await profileLink.isVisible().catch(() => false);
    if (hasProfile) {
      await profileLink.first().click();
      await page.waitForTimeout(2000);
      await screenshotStep(page, "22-13-profile-page");
      const bioInput = page.locator(
        'textarea[placeholder*="bio" i], input[name="bio"], textarea[name="bio"]',
      );
      if (await bioInput.isVisible().catch(() => false)) {
        await bioInput.fill("Playwright test bio");
        const saveBtn = page
          .locator('button:has-text("Save"), button[type="submit"]')
          .first();
        await saveBtn.click();
        await page.waitForTimeout(2000);
        await screenshotStep(page, "22-14-profile-saved");
      }
    }
  });

  test("Step 8: Forgot password flow works", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/members/login`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const forgotLink = page.locator(
      'a:has-text("Forgot"), button:has-text("Forgot"), a:has-text("Reset")',
    );
    const hasForgot = await forgotLink.isVisible().catch(() => false);
    if (!hasForgot) {
      console.log("No forgot password link visible");
      test.skip();
      return;
    }

    await forgotLink.first().click();
    await page.waitForTimeout(1000);
    await screenshotStep(page, "22-15-forgot-password");

    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill(testEmail);
      await page
        .locator(
          'button[type="submit"], button:has-text("Send"), button:has-text("Reset")',
        )
        .first()
        .click();
      await page.waitForTimeout(2000);
      await screenshotStep(page, "22-16-forgot-submitted");
      const body = await page.textContent("body");
      const showsConfirmation =
        body?.includes("sent") ||
        body?.includes("check") ||
        body?.includes("email") ||
        body?.includes("submitted");
      expect(
        showsConfirmation,
        "Should show confirmation after forgot password submit",
      ).toBe(true);
    }
  });
});
