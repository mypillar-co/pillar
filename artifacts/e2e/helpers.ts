import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";

export const API = process.env.API_URL ?? "http://localhost:8080";
export const CP = process.env.CP_URL ?? "http://localhost:5001";
export const STEWARD = process.env.STEWARD_URL ?? "http://localhost:18402";
export const TEST_ORG_SLUG = process.env.TEST_ORG_SLUG ?? "norwin-rotary-uic5";
export const TEST_ORG_URL = `${API}/sites/${TEST_ORG_SLUG}`;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function dbQuery(sql: string, params?: any[]): Promise<any[]> {
  const res = await pool.query(sql, params);
  return res.rows;
}

export async function getTestOrgId(): Promise<string> {
  const rows = await dbQuery(
    "SELECT id FROM organizations WHERE slug = $1 LIMIT 1",
    [TEST_ORG_SLUG],
  );
  return rows[0]?.id;
}

type SessionTokenResponse = {
  sid: string;
  cookie: string;
  cookieName: string;
  expiresAt?: string | number;
};

function parseSetCookieLikeString(cookieString: string) {
  const firstPart = cookieString.split(";")[0];
  const eq = firstPart.indexOf("=");
  if (eq === -1) throw new Error(`Invalid cookie string: ${cookieString}`);
  return {
    name: firstPart.slice(0, eq),
    value: firstPart.slice(eq + 1),
  };
}

function resolveServiceKey(): string {
  return (
    process.env.SERVICE_API_KEY ||
    process.env.PILLAR_SERVICE_KEY ||
    "pillar-local-e2e-service-key"
  );
}

export async function loginToSteward(
  page: Page,
  opts?: { orgSlug?: string; targetPath?: string },
): Promise<void> {
  const orgSlug = opts?.orgSlug ?? TEST_ORG_SLUG;
  const targetPath = opts?.targetPath ?? "/dashboard";
  const serviceKey = resolveServiceKey();

  const resp = await page.request.get(
    `${API}/api/service/session-token?orgSlug=${encodeURIComponent(orgSlug)}&ttlSec=600`,
    { headers: { "x-service-key": serviceKey } },
  );

  if (!resp.ok()) {
    const body = await resp.text();
    throw new Error(`session-token failed: ${resp.status()} ${body}`);
  }

  const data = (await resp.json()) as SessionTokenResponse;
  const parsed = parseSetCookieLikeString(data.cookie);

  await page.context().addCookies([
    {
      name: parsed.name,
      value: parsed.value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  // Mark the first-run GuidedTour as completed before any page script runs,
  // so the overlay never mounts and can't intercept clicks. Key matches
  // TOUR_STORAGE_KEY in artifacts/steward/src/components/GuidedTour.tsx.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("steward-tour-completed", "true");
    } catch {
      /* ignore */
    }
  });

  await page.goto(`${STEWARD}${targetPath}`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(page).not.toHaveURL(new RegExp(`^${STEWARD}/?$`));

  // Belt-and-suspenders: if the tour somehow still appeared, dismiss it.
  await dismissGuidedTourIfPresent(page);
  await assertAuthenticated(page);
}

/**
 * Standard AI-edit confirmation flow on /dashboard/site:
 *   Apply changes (POST /api/community-site/ai-edit, returns proposal payload)
 *     → Launch Community Site (POST /api/community-site/provision, persists site_config)
 *
 * Caller is responsible for filling the AI textarea before calling this and
 * for asserting the persisted change afterwards (typically via expect.poll
 * against organizations.site_config).
 */
/** Read the current `site_config` JSON from organizations for a slug. */
export async function getSiteConfig(slug: string): Promise<Record<string, unknown> | null> {
  const rows = await dbQuery(
    "SELECT site_config FROM organizations WHERE slug = $1 LIMIT 1",
    [slug],
  );
  return (rows[0]?.site_config as Record<string, unknown> | null) ?? null;
}

/** Poll organizations.site_config until `predicate` returns truthy or timeout. */
export async function waitForSiteConfigChange(
  slug: string,
  predicate: (cfg: Record<string, unknown> | null) => boolean,
  timeout = 60000,
): Promise<void> {
  await expect
    .poll(async () => predicate(await getSiteConfig(slug)), { timeout })
    .toBeTruthy();
}

export async function applyAndLaunch(page: Page): Promise<void> {
  const apply = page.getByRole("button", { name: "Apply changes" });
  await expect(apply).toBeVisible();
  await expect(apply).toBeEnabled();
  await apply.click();

  const launch = page.getByRole("button", { name: /Launch Community Site/i });
  await expect(launch).toBeVisible({ timeout: 20000 });
  await expect(launch).toBeEnabled();
  await launch.click();
}

export async function dismissGuidedTourIfPresent(page: Page): Promise<void> {
  const overlay = page.locator('[data-replit-metadata*="GuidedTour.tsx"]');
  if (await overlay.first().isVisible().catch(() => false)) {
    const skipButton = page.getByRole("button", {
      name: /skip|dismiss|close|got it|done/i,
    });
    if (await skipButton.first().isVisible().catch(() => false)) {
      await skipButton.first().click();
      await overlay
        .first()
        .waitFor({ state: "hidden", timeout: 5000 })
        .catch(() => {});
      return;
    }
    await page.keyboard.press("Escape");
    await overlay
      .first()
      .waitFor({ state: "hidden", timeout: 5000 })
      .catch(() => {});
  }
}

export async function assertAuthenticated(page: Page): Promise<void> {
  const url = page.url();
  if (url === `${STEWARD}/` || /\/login$/.test(url)) {
    throw new Error(
      `Expected authenticated dashboard route, got redirected to: ${url}`,
    );
  }
}

export async function screenshotStep(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `e2e-report/steps/${name}.png`,
    fullPage: true,
  });
}

export async function waitAndClick(page: Page, selector: string): Promise<void> {
  await page
    .locator(selector)
    .first()
    .waitFor({ state: "visible", timeout: 10000 });
  await page.locator(selector).first().click();
}
