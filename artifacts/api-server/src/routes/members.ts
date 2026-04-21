import { Router, type Request, type Response } from "express";
import { db, membersTable } from "@workspace/db";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";
import crypto from "crypto";
import { resolveFullOrg } from "../lib/resolveOrg";
import { sendEmail } from "../mailer";
import { logger } from "../lib/logger";
import { syncOrgConfigPatchToPillar } from "../lib/pillarOrgSync";
import { ensureMembersPortalProvisioned } from "../lib/membersPortalProvision";

const router = Router();

export const VALID_TYPES = new Set(["general", "board", "honorary", "staff", "volunteer"]);
export const VALID_STATUSES = new Set(["active", "inactive", "pending"]);
export const TOKEN_TTL_DAYS = 14;

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function inviteUrl(orgSlug: string, token: string): string {
  // Production subdomain. The Cloudflare worker rewrites {slug}.mypillar.co/* to the CP origin.
  return `https://${orgSlug}.mypillar.co/members/register?token=${token}`;
}

export async function sendInviteEmail(opts: {
  to: string;
  firstName: string;
  orgName: string;
  url: string;
}): Promise<{ sent: boolean; simulated?: boolean }> {
  const { to, firstName, orgName, url } = opts;
  const subject = `You're invited to join ${orgName}`;
  const text = `Hi ${firstName},

You've been added as a member of ${orgName}. Set your password to access the members portal:

${url}

This link expires in ${TOKEN_TTL_DAYS} days. If it expires, ask your administrator to send a new invite.

— ${orgName}`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;padding:40px 16px;margin:0;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <div style="background:#0a0f1e;color:#fff;padding:24px 32px;">
      <div style="font-size:20px;font-weight:600;letter-spacing:-0.01em;">${orgName}</div>
    </div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 12px;font-size:22px;color:#0a0f1e;">Welcome, ${firstName}.</h1>
      <p style="color:#475569;line-height:1.55;margin:0 0 24px;">You've been invited to the <strong>${orgName}</strong> members portal. Set your password to log in:</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${url}" style="display:inline-block;background:#c25038;color:#fff;text-decoration:none;font-weight:600;padding:13px 28px;border-radius:9px;font-size:15px;">Set my password</a>
      </div>
      <p style="color:#94a3b8;font-size:13px;line-height:1.55;margin:28px 0 0;">Or copy this link into your browser:<br><a href="${url}" style="color:#c25038;word-break:break-all;">${url}</a></p>
      <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;">This invite expires in ${TOKEN_TTL_DAYS} days.</p>
    </div>
  </div>
</body></html>`;
  const result = await sendEmail({ to, subject, html, text });
  if (!result.sent && !result.simulated) {
    logger.warn({ to, error: result.error }, "[members] invite email failed");
  }
  if (result.simulated) {
    logger.info({ to, url }, "[members] invite SIMULATED — copy the URL to test");
  }
  return result;
}

export interface FeatureEnableResult {
  ok: boolean;
  error?: string;
  /** True when the function short-circuited because the flag was already on. */
  alreadyEnabled?: boolean;
}

export async function ensureMembersFeatureEnabled(orgId: string): Promise<FeatureEnableResult> {
  // Flip features.members = true on cs_org_configs so the Members nav link appears.
  // Best-effort by default (we still log + swallow), but we now return a structured
  // result so route handlers can surface failures explicitly. Defense-in-depth:
  // every WHERE clause filters by the orgId argument, never by client input.
  try {
    const row = await db.execute(sql`
      SELECT features FROM cs_org_configs WHERE org_id = ${orgId} LIMIT 1
    `);
    const current = (row.rows[0]?.features ?? {}) as Record<string, unknown>;
    if (current.members === true) return { ok: true, alreadyEnabled: true };

    await syncOrgConfigPatchToPillar({
      orgId,
      // syncOrgConfigPatchToPillar's typed payload doesn't include features by name,
      // but the underlying CP /api/internal/org-config patch handler does a Partial spread.
      ...(({ features: { ...current, members: true } } as unknown) as Record<string, never>),
    });
    logger.info({ orgId }, "[members] enabled members feature on community site");
    return { ok: true };
  } catch (err) {
    logger.warn({ err, orgId }, "[members] could not enable members feature on CP — site may not be provisioned yet");
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

router.get("/", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const { status, type, search } = req.query as { status?: string; type?: string; search?: string };
  const conditions = [eq(membersTable.orgId, org.id)];
  if (status && VALID_STATUSES.has(status)) conditions.push(eq(membersTable.status, status));
  if (type && VALID_TYPES.has(type)) conditions.push(eq(membersTable.memberType, type));
  if (search) {
    conditions.push(
      or(
        ilike(membersTable.firstName, `%${search}%`),
        ilike(membersTable.lastName, `%${search}%`),
        ilike(membersTable.email, `%${search}%`),
      )!,
    );
  }
  const rows = await db.execute(sql`
    SELECT id, org_id, first_name, last_name, email, phone, member_type, status,
           join_date, renewal_date, notes, registered_at, show_in_directory,
           title, bio, photo_url, address, created_at, updated_at,
           CASE WHEN registration_token IS NOT NULL AND registered_at IS NULL THEN true ELSE false END AS has_pending_invite
    FROM members
    WHERE ${and(...conditions)}
    ORDER BY created_at DESC
  `);
  res.json(rows.rows);
});

router.post("/", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const { firstName, lastName, email, phone, memberType, status, joinDate, renewalDate, notes, title } = req.body ?? {};
  if (!firstName) {
    res.status(400).json({ error: "firstName is required" });
    return;
  }
  if (memberType && !VALID_TYPES.has(memberType)) {
    res.status(400).json({ error: `memberType must be one of: ${[...VALID_TYPES].join(", ")}` });
    return;
  }
  if (status && !VALID_STATUSES.has(status)) {
    res.status(400).json({ error: `status must be one of: ${[...VALID_STATUSES].join(", ")}` });
    return;
  }

  const trimmedEmail = (email ?? "").trim() || null;
  const token = trimmedEmail ? generateToken() : null;
  const tokenExpires = token ? new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000) : null;

  const memberId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO members (
      id, org_id, first_name, last_name, email, phone, member_type, status,
      join_date, renewal_date, notes, title, registration_token, token_expires_at
    ) VALUES (
      ${memberId}, ${org.id}, ${firstName}, ${lastName ?? null}, ${trimmedEmail},
      ${phone ?? null}, ${memberType ?? "general"}, ${status ?? "active"},
      ${joinDate ?? null}, ${renewalDate ?? null}, ${notes ?? null},
      ${title ?? null}, ${token}, ${tokenExpires}
    )
  `);

  const orgSlug = (org as { slug?: string }).slug ?? org.id;
  let invite: { sent: boolean; simulated?: boolean; url?: string } = { sent: false };
  if (trimmedEmail && token) {
    const url = inviteUrl(orgSlug, token);
    const result = await sendInviteEmail({
      to: trimmedEmail,
      firstName,
      orgName: org.name ?? orgSlug,
      url,
    });
    invite = { sent: result.sent, simulated: result.simulated, url };
  }

  // Synchronously turn on the members feature + provision the members portal.
  // Awaited so timing is deterministic; the helpers swallow exceptions internally
  // and return structured results so we can surface failures at error level here
  // (previously fire-and-forget, which hid CP-sync failures from operators).
  // Member creation is NOT rolled back if provisioning fails — the member row
  // is the source of truth and the new POST /api/members/repair-portal endpoint
  // can be used to retry provisioning out-of-band.
  const featureResult = await ensureMembersFeatureEnabled(org.id);
  if (!featureResult.ok) {
    logger.error(
      { orgId: org.id, error: featureResult.error },
      "[members] feature-flag enable failed for org " + org.id,
    );
  }
  const portalResult = await ensureMembersPortalProvisioned(org.id);
  if (!portalResult.ok) {
    logger.error(
      { orgId: org.id, error: portalResult.error, cpMirrorError: portalResult.cpMirrorError },
      "[members] portal provisioning failed for org " + org.id,
    );
  } else if (portalResult.cpMirrorError) {
    logger.error(
      { orgId: org.id, cpMirrorError: portalResult.cpMirrorError },
      "[members] portal provisioned but CP mirror failed for org " + org.id,
    );
  }

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.id, memberId));
  res.status(201).json({ ...member, invite });
});

router.put("/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const [existing] = await db
    .select()
    .from(membersTable)
    .where(and(eq(membersTable.id, req.params.id), eq(membersTable.orgId, org.id)));
  if (!existing) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  const {
    firstName, lastName, email, phone, memberType, status, joinDate, renewalDate, notes,
    title, bio, photoUrl, address, showInDirectory,
  } = req.body ?? {};
  if (memberType && !VALID_TYPES.has(memberType)) {
    res.status(400).json({ error: `memberType must be one of: ${[...VALID_TYPES].join(", ")}` });
    return;
  }
  if (status && !VALID_STATUSES.has(status)) {
    res.status(400).json({ error: `status must be one of: ${[...VALID_STATUSES].join(", ")}` });
    return;
  }
  await db.execute(sql`
    UPDATE members SET
      first_name = COALESCE(${firstName}, first_name),
      last_name = ${lastName !== undefined ? lastName : existing.lastName},
      email = ${email !== undefined ? email : existing.email},
      phone = ${phone !== undefined ? phone : existing.phone},
      member_type = COALESCE(${memberType}, member_type),
      status = COALESCE(${status}, status),
      join_date = ${joinDate !== undefined ? joinDate : existing.joinDate},
      renewal_date = ${renewalDate !== undefined ? renewalDate : existing.renewalDate},
      notes = ${notes !== undefined ? notes : existing.notes},
      title = ${title !== undefined ? title : null},
      bio = ${bio !== undefined ? bio : null},
      photo_url = ${photoUrl !== undefined ? photoUrl : null},
      address = ${address !== undefined ? address : null},
      show_in_directory = COALESCE(${showInDirectory ?? null}, show_in_directory),
      updated_at = now()
    WHERE id = ${req.params.id}
  `);
  const [updated] = await db.select().from(membersTable).where(eq(membersTable.id, req.params.id));
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const [existing] = await db
    .select()
    .from(membersTable)
    .where(and(eq(membersTable.id, req.params.id), eq(membersTable.orgId, org.id)));
  if (!existing) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  await db.delete(membersTable).where(eq(membersTable.id, req.params.id));
  res.status(204).send();
});

router.post("/:id/resend-invite", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const [existing] = await db
    .select()
    .from(membersTable)
    .where(and(eq(membersTable.id, req.params.id), eq(membersTable.orgId, org.id)));
  if (!existing) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  if (!existing.email) {
    res.status(400).json({ error: "This member has no email on file." });
    return;
  }
  if (existing.registeredAt) {
    res.status(400).json({ error: "This member has already registered." });
    return;
  }
  const token = generateToken();
  const tokenExpires = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.execute(sql`
    UPDATE members SET registration_token = ${token}, token_expires_at = ${tokenExpires}, updated_at = now()
    WHERE id = ${req.params.id}
  `);
  const orgSlug = (org as { slug?: string }).slug ?? org.id;
  const url = inviteUrl(orgSlug, token);
  const result = await sendInviteEmail({
    to: existing.email,
    firstName: existing.firstName,
    orgName: org.name ?? orgSlug,
    url,
  });
  res.json({ ok: true, sent: result.sent, simulated: result.simulated, url });
});

router.get("/export/csv", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const members = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.orgId, org.id))
    .orderBy(membersTable.lastName, membersTable.firstName);
  const rows: string[][] = [
    ["First Name", "Last Name", "Email", "Phone", "Type", "Status", "Join Date", "Renewal Date", "Notes"],
    ...members.map((m) => [
      m.firstName,
      m.lastName ?? "",
      m.email ?? "",
      m.phone ?? "",
      m.memberType,
      m.status,
      m.joinDate ?? "",
      m.renewalDate ?? "",
      m.notes ?? "",
    ]),
  ];
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="members-${Date.now()}.csv"`);
  res.send(csv);
});

router.get("/stats", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const rows = await db.execute(sql`
    SELECT status, member_type, registered_at IS NOT NULL AS is_registered
    FROM members WHERE org_id = ${org.id}
  `);
  const list = rows.rows as Array<{ status: string; member_type: string; is_registered: boolean }>;
  // Surface portal provisioning health so the dashboard can warn when members
  // exist but the public-site portal isn't wired up. Defense-in-depth: the
  // WHERE clause filters by the resolved org id, never trusts client input.
  const portalRows = await db.execute(sql`
    SELECT (site_config ? 'membersPortal') AS provisioned
    FROM organizations WHERE id = ${org.id} LIMIT 1
  `);
  const portalProvisioned = Boolean(
    (portalRows.rows[0] as { provisioned?: boolean } | undefined)?.provisioned,
  );
  res.json({
    total: list.length,
    active: list.filter((m) => m.status === "active").length,
    board: list.filter((m) => m.member_type === "board").length,
    pending: list.filter((m) => m.status === "pending").length,
    registered: list.filter((m) => m.is_registered).length,
    portalProvisioned,
  });
});

// POST /api/members/repair-portal — manually re-runs ensureMembersPortalProvisioned
// for the resolved org. Lets an admin (or the AI agent) repair a broken
// provisioning state without having to add a new member. Same auth surface as
// the rest of /api/members (resolveFullOrg enforces dashboard auth + org scope).
router.post("/repair-portal", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  // Run both repair steps and collect their structured results. The helpers
  // never throw, so we rely on the returned { ok, error } shape to detect
  // failure deterministically (a previous version of this handler used a
  // try/catch, which was dead code — exceptions were swallowed inside the
  // helpers and never reached the route).
  const featureResult = await ensureMembersFeatureEnabled(org.id);
  const portalResult = await ensureMembersPortalProvisioned(org.id);

  // Re-check the api-server-side provisioning state so the caller can verify
  // the repair actually landed (defense-in-depth: even if the helpers report
  // ok, we re-read from organizations.site_config to confirm).
  const portalRows = await db.execute(sql`
    SELECT (site_config ? 'membersPortal') AS provisioned
    FROM organizations WHERE id = ${org.id} LIMIT 1
  `);
  const portalProvisioned = Boolean(
    (portalRows.rows[0] as { provisioned?: boolean } | undefined)?.provisioned,
  );

  const overallOk = featureResult.ok && portalResult.ok && portalProvisioned;
  const status = overallOk ? 200 : 500;
  if (!overallOk) {
    logger.error(
      {
        orgId: org.id,
        featureResult,
        portalResult,
        portalProvisioned,
      },
      "[members] repair-portal returned failure for org " + org.id,
    );
  } else if (portalResult.cpMirrorError) {
    // API-side write succeeded and the org now shows membersPortal in
    // organizations.site_config, but mirroring to cs_org_configs failed.
    // The site nav may not show the Members link until the next CP sync;
    // surface this at error level so operators can intervene.
    logger.error(
      { orgId: org.id, cpMirrorError: portalResult.cpMirrorError },
      "[members] repair-portal: api-server write OK but CP mirror failed for org " + org.id,
    );
  }
  res.status(status).json({
    ok: overallOk,
    orgId: org.id,
    portalProvisioned,
    featureFlag: featureResult,
    portal: portalResult,
  });
});

export default router;
