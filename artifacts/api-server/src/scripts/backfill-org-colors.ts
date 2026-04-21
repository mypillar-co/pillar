/**
 * One-time backfill: organizations.site_config theme colors.
 *
 * Finds every org where site_config IS NOT NULL but
 * site_config -> 'theme' ->> 'primaryColor' or 'accentColor' is missing,
 * picks the right defaults from ORG_TYPE_COLORS_MAP based on org type
 * (with "Other" fallback), and writes them into site_config.theme
 * via a JSONB merge so every other field on site_config is preserved.
 *
 * Idempotent — safe to re-run.
 *
 * Run:  pnpm --filter @workspace/api-server exec tsx src/scripts/backfill-org-colors.ts
 */

import { pool } from "@workspace/db";

// Mirror of ORG_TYPE_COLORS_MAP from routes/communitySite.ts. Kept inline
// here so the script can run as a standalone (no deep imports of route code).
const ORG_TYPE_COLORS_MAP: Record<string, { primaryColor: string; accentColor: string }> = {
  "Main Street / Downtown Association": { primaryColor: "#c25038", accentColor: "#2b7ab5" },
  "Chamber of Commerce":               { primaryColor: "#1a4a8a", accentColor: "#d4a017" },
  "Rotary Club":                        { primaryColor: "#003DA5", accentColor: "#d4a017" },
  "Lions Club":                         { primaryColor: "#d4a017", accentColor: "#1a4a8a" },
  "VFW / American Legion":              { primaryColor: "#8b1a1a", accentColor: "#2b5797" },
  "Fraternal Organization":             { primaryColor: "#1a3a5c", accentColor: "#c5a030" },
  "PTA / PTO":                          { primaryColor: "#339966", accentColor: "#7a3d9e" },
  "Community Foundation":               { primaryColor: "#2d8a57", accentColor: "#2b7ab5" },
  "Neighborhood Association":           { primaryColor: "#c26a17", accentColor: "#338899" },
  "Arts Council":                       { primaryColor: "#7a3d9e", accentColor: "#cc3366" },
  "Other":                              { primaryColor: "#2b7ab5", accentColor: "#338899" },
};
const FALLBACK = ORG_TYPE_COLORS_MAP["Other"];

async function main() {
  console.log("─".repeat(60));
  console.log(" Backfill org theme colors");
  console.log("─".repeat(60));

  const r = await pool.query<{
    id: string;
    slug: string | null;
    type: string | null;
    primary_color: string | null;
    accent_color: string | null;
  }>(`
    SELECT id, slug, type,
           site_config -> 'theme' ->> 'primaryColor' AS primary_color,
           site_config -> 'theme' ->> 'accentColor'  AS accent_color
    FROM organizations
    WHERE site_config IS NOT NULL
      AND (
        (site_config -> 'theme' ->> 'primaryColor') IS NULL
        OR (site_config -> 'theme' ->> 'accentColor') IS NULL
      )
    ORDER BY slug
  `);

  if (r.rows.length === 0) {
    console.log("[backfill] no orgs need backfill — all good");
    return;
  }

  console.log(`[backfill] found ${r.rows.length} org(s) needing backfill`);
  let updated = 0;

  for (const row of r.rows) {
    const colors = ORG_TYPE_COLORS_MAP[row.type ?? "Other"] ?? FALLBACK;
    const matched = ORG_TYPE_COLORS_MAP[row.type ?? ""] ? row.type : "Other (fallback)";

    // jsonb_set to add 'theme' object if missing, then merge primaryColor/accentColor
    // without touching any other site_config fields.
    await pool.query(
      `
      UPDATE organizations
      SET site_config = jsonb_set(
        COALESCE(site_config, '{}'::jsonb),
        '{theme}',
        COALESCE(site_config -> 'theme', '{}'::jsonb) || jsonb_build_object(
          'primaryColor', COALESCE(site_config -> 'theme' ->> 'primaryColor', $2),
          'accentColor',  COALESCE(site_config -> 'theme' ->> 'accentColor',  $3)
        ),
        true
      )
      WHERE id = $1
      `,
      [row.id, colors.primaryColor, colors.accentColor],
    );
    updated++;
    console.log(
      `  ✓ ${row.slug ?? row.id}  type=${row.type ?? "<null>"}  ` +
      `primary ${row.primary_color ?? "(was null)"} → ${colors.primaryColor}  ` +
      `accent ${row.accent_color ?? "(was null)"} → ${colors.accentColor}  ` +
      `[map=${matched}]`,
    );
  }

  // Verify
  const verify = await pool.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count
    FROM organizations
    WHERE site_config IS NOT NULL
      AND (
        (site_config -> 'theme' ->> 'primaryColor') IS NULL
        OR (site_config -> 'theme' ->> 'accentColor') IS NULL
      )
  `);
  console.log(`\n[backfill] updated ${updated} row(s); orgs still missing colors: ${verify.rows[0]!.count}`);
}

main()
  .then(() => pool.end().then(() => process.exit(0)))
  .catch(async (err) => {
    console.error("[backfill] FAILED:", err);
    await pool.end();
    process.exit(1);
  });
