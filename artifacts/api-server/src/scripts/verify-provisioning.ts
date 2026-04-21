/**
 * Step 1 + Step 2 verification.
 *
 * Step 1: Create a fresh test org and exercise the same await-then-log path
 * the POST /api/members handler uses, capturing every log line.
 *
 * Step 2: Emulate the GET /api/members/stats query for an existing org and
 * print the JSON response shape including portalProvisioned.
 *
 * Run: pnpm --filter @workspace/api-server exec tsx src/scripts/verify-provisioning.ts
 */

import { pool } from "@workspace/db";
import { ensureMembersPortalProvisioned } from "../lib/membersPortalProvision.js";
import { ensureMembersFeatureEnabled } from "../routes/members.js";

function header(label: string) {
  console.log(`\n──────────────────────────────────────────────────────────────`);
  console.log(`  ${label}`);
  console.log(`──────────────────────────────────────────────────────────────`);
}

async function step1() {
  header("STEP 1 — Synchronous provisioning on a fresh test org");
  const ts = Date.now();
  const orgId = `e2e-provision-test-${ts}`;
  const slug = `e2e-prov-${ts}`;

  // Create a minimal fresh org (the same shape the POST /api/organizations route writes)
  await pool.query(`
    INSERT INTO organizations (id, name, slug, user_id, type)
    VALUES ($1, 'E2E Provision Test Org', $2, 'e2e-test-user', 'rotary')
  `, [orgId, slug]);
  console.log(`[setup] inserted fresh org id=${orgId} slug=${slug}`);
  console.log(`[setup] site_config is NULL — portal NOT yet provisioned`);

  // Now run the exact pattern POST /api/members uses (after the recent fix)
  console.log(`\n[handler] -> awaiting ensureMembersFeatureEnabled(${orgId}) ...`);
  const t0 = Date.now();
  const featResult = await ensureMembersFeatureEnabled(orgId);
  console.log(`[handler] <- ensureMembersFeatureEnabled returned in ${Date.now() - t0}ms: ${JSON.stringify(featResult)}`);

  console.log(`\n[handler] -> awaiting ensureMembersPortalProvisioned(${orgId}) ...`);
  const t1 = Date.now();
  const portalResult = await ensureMembersPortalProvisioned(orgId);
  console.log(`[handler] <- ensureMembersPortalProvisioned returned in ${Date.now() - t1}ms: ${JSON.stringify(portalResult)}`);

  // Demonstrate the route's error-level escalation logic
  if (!featResult.ok || !portalResult.ok) {
    console.error(`[handler] ERROR-level: provisioning failure: feat=${JSON.stringify(featResult)} portal=${JSON.stringify(portalResult)}`);
  } else if (portalResult.cpMirrorError) {
    console.error(`[handler] ERROR-level: api-server-side ok but CP mirror failed: ${portalResult.cpMirrorError}`);
  } else {
    console.log(`[handler] OK — both helpers ok:true, no cpMirrorError. Now would respond 201.`);
  }

  // Verify on disk
  const verify = await pool.query<{ has_config: boolean; has_portal: boolean }>(`
    SELECT site_config IS NOT NULL AS has_config,
           (site_config -> 'membersPortal') IS NOT NULL AS has_portal
    FROM organizations WHERE id = $1
  `, [orgId]);
  console.log(`\n[verify] db state: ${JSON.stringify(verify.rows[0])}`);

  // Cleanup
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
  console.log(`[cleanup] deleted org ${orgId}`);
}

async function step2() {
  header("STEP 2 — GET /api/members/stats response shape (db-emulated)");
  const orgRow = await pool.query<{ id: string; slug: string }>(`
    SELECT o.id, o.slug FROM organizations o
    WHERE o.id IN (SELECT DISTINCT org_id FROM members) LIMIT 1
  `);
  if (orgRow.rows.length === 0) {
    console.log(`[skip] no org with members in db`);
    return;
  }
  const org = orgRow.rows[0]!;
  console.log(`[org] using ${org.slug} (${org.id})`);

  const stats = await pool.query<any>(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*) FILTER (WHERE member_type = 'board')::int AS board,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
    FROM members WHERE org_id = $1
  `, [org.id]);
  const portal = await pool.query<{ has_portal: boolean }>(
    `SELECT (site_config -> 'membersPortal') IS NOT NULL AS has_portal FROM organizations WHERE id = $1`,
    [org.id],
  );
  const response = {
    ...stats.rows[0],
    portalProvisioned: portal.rows[0]?.has_portal ?? false,
  };
  console.log(`\n[response] GET /api/members/stats →`);
  console.log(JSON.stringify(response, null, 2));
}

async function main() {
  try {
    await step1();
    await step2();
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch(e => {
  console.error("[verify] FATAL", e);
  process.exit(1);
});
