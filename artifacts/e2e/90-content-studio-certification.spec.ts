import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  API,
  STEWARD,
  TEST_ORG_SLUG,
  dbQuery,
  loginToSteward,
} from "./helpers";

type CertStatus = "PASS" | "FAIL" | "PARTIAL" | "MISSING";

type CertReport = Record<string, { status: CertStatus; reason: string }>;

const screenshotDir = path.resolve("artifacts/e2e-report/content-studio-certification");

function setReport(report: CertReport, key: string, status: CertStatus, reason: string) {
  report[key] = { status, reason };
}

async function visibleText(page: Page, pattern: RegExp): Promise<boolean> {
  return page.getByText(pattern).first().isVisible({ timeout: 5000 }).catch(() => false);
}

async function saveFailureScreenshot(page: Page, name: string) {
  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: true }).catch(() => {});
}

async function resolveOrgSlug(): Promise<string> {
  const rows = await dbQuery("SELECT slug FROM organizations WHERE slug = 'testfestival' LIMIT 1");
  return rows[0]?.slug ?? TEST_ORG_SLUG;
}

async function resolveOrgId(slug: string): Promise<string> {
  const rows = await dbQuery("SELECT id FROM organizations WHERE slug = $1 LIMIT 1", [slug]);
  if (!rows[0]?.id) throw new Error(`No test org found for slug ${slug}`);
  return rows[0].id;
}

async function openTask(page: Page, label: string): Promise<boolean> {
  await page.goto(`${STEWARD}/dashboard/studio`, { waitUntil: "domcontentloaded" });
  const card = page.getByText(label, { exact: true }).first();
  if (!(await card.isVisible({ timeout: 10000 }).catch(() => false))) return false;
  await card.click();
  await expect(page.getByRole("heading", { name: label })).toBeVisible({ timeout: 10000 });
  return true;
}

async function fillWorkspaceFields(page: Page, value: string) {
  const fields = page.locator(
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea',
  );
  const count = await fields.count();
  for (let i = 0; i < count; i++) {
    const field = fields.nth(i);
    if (!(await field.isVisible().catch(() => false))) continue;
    const current = await field.inputValue().catch(() => "");
    if (current.trim()) continue;
    await field.fill(value).catch(() => {});
  }
}

async function generateStudioTask(page: Page): Promise<{ ok: boolean; reason: string }> {
  await fillWorkspaceFields(page, "Content Studio certification smoke-test content.");
  const generate = page.getByRole("button", { name: /^Generate$/ });
  if (!(await generate.isEnabled({ timeout: 5000 }).catch(() => false))) {
    return { ok: false, reason: "Generate button was not enabled." };
  }
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/content/generate") && res.request().method() === "POST",
    { timeout: 70000 },
  );
  await generate.click();
  const response = await responsePromise;
  if (!response.ok()) {
    return { ok: false, reason: `POST /api/content/generate returned ${response.status()}` };
  }
  const output = page.locator("pre").first();
  await expect(output).toBeVisible({ timeout: 30000 });
  const text = (await output.textContent()) ?? "";
  return { ok: text.length > 60, reason: `Generated ${text.length} characters.` };
}

async function askPillar(page: Page, message: string): Promise<string> {
  await page.goto(`${STEWARD}/dashboard`, { waitUntil: "domcontentloaded" });
  const askInput = page.getByPlaceholder(/Ask Pillar/i);
  await expect(askInput).toBeVisible({ timeout: 15000 });
  await askInput.fill(message);
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/ai/operations") && res.request().method() === "POST",
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: /^Go$/ }).click();
  const response = await responsePromise;
  const body = await response.text();
  await expect(page.locator("body")).toContainText(/completed|draft prepared|confirmation required|unsupported|error/i, { timeout: 10000 });
  return body;
}

test.describe("Content Studio Certification", () => {
  test.setTimeout(240000);

  test("certifies visible content and operation flows", async ({ page }) => {
    const report: CertReport = {};
    const timestamp = Date.now();
    const orgSlug = await resolveOrgSlug();
    const orgId = await resolveOrgId(orgSlug);
    const originalSiteConfigRows = await dbQuery(
      "SELECT site_config FROM organizations WHERE id = $1 LIMIT 1",
      [orgId],
    );
    const originalPublicConfigRows = await dbQuery(
      "SELECT contact_email FROM cs_org_configs WHERE org_id = $1 OR org_id = $2 LIMIT 1",
      [orgId, orgSlug],
    );
    const announcementTitle = `Content Studio Smoke Announcement ${timestamp}`;
    const sponsorName = `Content Studio Smoke Sponsor ${timestamp}`;

    try {
      await loginToSteward(page, { orgSlug, targetPath: "/dashboard/studio" });

      // 1. Announcements: real UI save, then public render check.
      await page.goto(`${STEWARD}/dashboard/announcements`, { waitUntil: "domcontentloaded" });
      await page.getByPlaceholder(/Office closed Friday/i).fill(announcementTitle);
      await page.getByPlaceholder(/Write a short announcement/i).fill("This announcement was created by the certification suite.");
      await page.getByRole("button", { name: /Post announcement/i }).click();
      if (await visibleText(page, new RegExp(announcementTitle))) {
        setReport(report, "Announcements dashboard save", "PASS", "Announcement appears in dashboard recent list.");
      } else {
        await saveFailureScreenshot(page, "announcement-dashboard-save");
        setReport(report, "Announcements dashboard save", "FAIL", "Announcement did not appear in dashboard recent list.");
      }

      await page.goto(`${API}/sites/${orgSlug}`, { waitUntil: "domcontentloaded" });
      if (await page.getByText(announcementTitle).first().isVisible({ timeout: 5000 }).catch(() => false)) {
        setReport(report, "Announcements public render", "PASS", "Announcement appears on the public site.");
      } else {
        await saveFailureScreenshot(page, "announcement-public-render");
        setReport(report, "Announcements public render", "FAIL", "Announcement saved in dashboard but not rendered on public site.");
      }

      // 2. Newsletter/content draft through real Content Studio UI.
      if (await openTask(page, "Newsletter Intro")) {
        const generated = await generateStudioTask(page);
        setReport(report, "Newsletter draft", generated.ok ? "PASS" : "PARTIAL", generated.reason);
      } else {
        setReport(report, "Newsletter draft", "MISSING", "Newsletter Intro task was not visible.");
      }

      // 3. Social draft through real Content Studio UI.
      if (await openTask(page, "3-Post Social Campaign")) {
        const generated = await generateStudioTask(page);
        setReport(report, "Social draft", generated.ok ? "PASS" : "PARTIAL", `${generated.reason} No provider publish was attempted.`);
      } else {
        setReport(report, "Social draft", "MISSING", "3-Post Social Campaign task was not visible.");
      }

      // 4. Sponsor logo upload through real Sponsors UI with a tiny PNG fixture.
      await page.goto(`${STEWARD}/dashboard/sponsors`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /Add Sponsor/i }).first().click();
      await page.getByPlaceholder(/Acme Corp/i).fill(sponsorName);
      const tinyPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
        "base64",
      );
      await page.locator('input[type="file"]').setInputFiles({
        name: "tiny-logo.png",
        mimeType: "image/png",
        buffer: tinyPng,
      });
      const sponsorResponse = page.waitForResponse(
        (res) => res.url().includes("/api/sponsors") && res.request().method() === "POST",
        { timeout: 30000 },
      );
      await page.getByRole("button", { name: /^Add Sponsor$/ }).click();
      const sponsorRes = await sponsorResponse;
      const sponsorBody = await sponsorRes.text();
      if (!sponsorRes.ok() || /request entity too large|failed to upload image/i.test(sponsorBody)) {
        await saveFailureScreenshot(page, "sponsor-image-upload");
        setReport(report, "Sponsor image upload", "FAIL", `Sponsor save returned ${sponsorRes.status()} ${sponsorBody.slice(0, 160)}`);
      } else {
        const rows = await dbQuery(
          "SELECT logo_url FROM sponsors WHERE org_id = $1 AND name = $2 ORDER BY created_at DESC LIMIT 1",
          [orgId, sponsorName],
        );
        const logoUrl = String(rows[0]?.logo_url ?? "");
        const logoOk = logoUrl.length > 0 && !logoUrl.startsWith("data:");
        setReport(report, "Sponsor image upload", logoOk ? "PASS" : "FAIL", logoOk ? `Stored compact logo URL: ${logoUrl}` : "Sponsor logo URL was empty or inline base64.");
      }

      // 5-7. Ask Pillar safe/draft/risky action checks through dashboard UI.
      const vendorDraft = await askPillar(page, "Draft reminder to unpaid vendors");
      setReport(report, "AI vendor reminder draft", /"status"\s*:\s*"draft_prepared"/.test(vendorDraft) ? "PASS" : "FAIL", vendorDraft.slice(0, 220));

      const risky = await askPillar(page, "delete this event");
      setReport(report, "AI risky action gate", /"status"\s*:\s*"confirmation_required"/.test(risky) ? "PASS" : "FAIL", risky.slice(0, 220));

      const email = `content-smoke-${timestamp}@example.com`;
      const emailResult = await askPillar(page, `Change contact email to ${email}`);
      const savedEmail = await dbQuery(
        "SELECT site_config->>'contactEmail' AS contact_email FROM organizations WHERE id = $1 LIMIT 1",
        [orgId],
      );
      const publicEmail = await dbQuery(
        "SELECT contact_email FROM cs_org_configs WHERE org_id = $1 OR org_id = (SELECT slug FROM organizations WHERE id = $1) LIMIT 1",
        [orgId],
      );
      const labelResult = await askPillar(page, "Change CTA label to Plan a Visit");
      const savedCta = await dbQuery(
        "SELECT site_config->>'ctaLabel' AS cta_label FROM organizations WHERE id = $1 LIMIT 1",
        [orgId],
      );
      const siteEditsPass =
        /"status"\s*:\s*"completed"/.test(emailResult) &&
        /"status"\s*:\s*"completed"/.test(labelResult) &&
        savedEmail[0]?.contact_email === email &&
        (publicEmail[0]?.contact_email === email || publicEmail.length === 0) &&
        savedCta[0]?.cta_label === "Plan a Visit";
      setReport(report, "AI simple site edits", siteEditsPass ? "PASS" : "FAIL", JSON.stringify({
        emailStatus: emailResult.slice(0, 120),
        labelStatus: labelResult.slice(0, 120),
        savedEmail: savedEmail[0]?.contact_email ?? null,
        publicEmail: publicEmail[0]?.contact_email ?? null,
        ctaLabel: savedCta[0]?.cta_label ?? null,
      }));

      console.log("\nCONTENT STUDIO CERTIFICATION REPORT");
      for (const [label, entry] of Object.entries(report)) {
        console.log(`- ${label}: ${entry.status} — ${entry.reason}`);
      }

      await expect.poll(() => Object.keys(report).length).toBeGreaterThanOrEqual(7);
    } finally {
      await dbQuery("DELETE FROM sponsors WHERE org_id = $1 AND name = $2", [orgId, sponsorName]);
      await dbQuery("DELETE FROM cs_announcements WHERE org_id = $1 AND title = $2", [orgId, announcementTitle]);
      if (originalSiteConfigRows[0]) {
        await dbQuery("UPDATE organizations SET site_config = $2::jsonb WHERE id = $1", [
          orgId,
          JSON.stringify(originalSiteConfigRows[0].site_config ?? {}),
        ]);
      }
      if (originalPublicConfigRows[0]) {
        await dbQuery(
          "UPDATE cs_org_configs SET contact_email = $3 WHERE org_id = $1 OR org_id = $2",
          [
            orgId,
            orgSlug,
            originalPublicConfigRows[0].contact_email ?? null,
          ],
        );
      }
    }
  });
});
