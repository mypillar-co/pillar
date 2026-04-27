import { expect, type Page } from "@playwright/test";
import { loginToSteward, dbQuery } from "./helpers";

type TempOrgInput = {
  name: string;
  slug: string;
  type: string;
  category?: string | null;
  tier?: string | null;
};

type GeneratePayload = {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  orgName: string;
  orgType: string;
};

export async function createTempOrg(input: TempOrgInput): Promise<{ id: string; slug: string }> {
  const syntheticUserId = `e2e-site-owner-${input.slug}`;
  const rows = await dbQuery(
    `
      INSERT INTO organizations (id, user_id, name, slug, type, category, tier)
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)
      RETURNING id, slug
    `,
    [
      syntheticUserId,
      input.name,
      input.slug,
      input.type,
      input.category ?? null,
      input.tier ?? "tier1",
    ],
  );
  return { id: rows[0].id as string, slug: rows[0].slug as string };
}

export async function insertEvent(
  orgId: string,
  event: {
    name: string;
    slug: string;
    description?: string;
    location?: string;
    startDate?: string;
    startTime?: string;
    hasRegistration?: boolean;
    featuredOnSite?: boolean;
  },
): Promise<void> {
  await dbQuery(
    `
      INSERT INTO events (
        id, org_id, name, slug, description, location, start_date, start_time,
        has_registration, featured_on_site, status, show_on_public_site, is_active
      )
      VALUES (
        gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7,
        $8, $9, 'active', true, true
      )
    `,
    [
      orgId,
      event.name,
      event.slug,
      event.description ?? null,
      event.location ?? null,
      event.startDate ?? null,
      event.startTime ?? null,
      event.hasRegistration ?? false,
      event.featuredOnSite ?? false,
    ],
  );
}

export async function cleanupTempOrg(orgId: string): Promise<void> {
  await dbQuery("DELETE FROM site_update_schedules WHERE org_id = $1", [orgId]);
  await dbQuery("DELETE FROM website_specs WHERE org_id = $1", [orgId]);
  await dbQuery("DELETE FROM sites WHERE org_id = $1", [orgId]);
  await dbQuery("DELETE FROM events WHERE org_id = $1", [orgId]);
  await dbQuery("DELETE FROM organizations WHERE id = $1", [orgId]);
}

export async function loginAndGenerateSite(
  page: Page,
  orgSlug: string,
  payload: GeneratePayload,
): Promise<{ site: { generatedHtml: string | null }; orgSlug: string }> {
  await loginToSteward(page, { orgSlug, targetPath: "/dashboard/website" });

  const response = await page.evaluate(async (requestPayload) => {
    const tokenMatch = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
    const csrf = tokenMatch ? decodeURIComponent(tokenMatch[1]) : "";
    const res = await fetch("/api/sites/generate", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "x-csrf-token": csrf } : {}),
      },
      body: JSON.stringify(requestPayload),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  }, payload);

  expect(response.ok, `Site generation failed: ${response.status} ${response.text}`).toBe(true);
  const parsed = JSON.parse(response.text) as {
    site: { generatedHtml: string | null };
    orgSlug: string;
  };
  expect(parsed.site.generatedHtml).toBeTruthy();
  return parsed;
}
