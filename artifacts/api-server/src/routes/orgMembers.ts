import { Router, type Request, type Response } from "express";
import { db, orgMembersTable, organizationsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { resolveFullOrg } from "../lib/resolveOrg";
import { sendEmail } from "../mailer";

const router = Router();

function generateInviteToken(): string {
  return randomBytes(24).toString("hex");
}

// GET /api/org-members — list all members (owner + accepted/pending invites)
router.get("/", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const members = await db
    .select()
    .from(orgMembersTable)
    .where(eq(orgMembersTable.orgId, org.id));

  // Also include the owner
  const [ownerUser] = await db
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, org.userId));

  const ownerRecord = ownerUser
    ? { id: "owner", email: ownerUser.email ?? null, name: ownerUser.name ?? null, role: "owner", status: "active", userId: ownerUser.id }
    : null;

  const memberRecords = members.map(m => ({
    id: m.id,
    email: m.email,
    role: m.role,
    status: m.acceptedAt ? "active" : "pending",
    userId: m.userId ?? null,
    invitedAt: m.invitedAt,
    acceptedAt: m.acceptedAt ?? null,
  }));

  res.json({
    owner: ownerRecord,
    members: memberRecords,
  });
});

// POST /api/org-members/invite — invite a new admin by email
router.post("/invite", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { email } = req.body as { email?: string };
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Don't invite the owner
  if (normalizedEmail === (org.userEmail ?? "").toLowerCase()) {
    res.status(400).json({ error: "This person is already the account owner." });
    return;
  }

  // Check for existing invite
  const [existing] = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, org.id), eq(orgMembersTable.email, normalizedEmail)));

  if (existing?.acceptedAt) {
    res.status(400).json({ error: "This person is already a member of your organization." });
    return;
  }

  const token = generateInviteToken();
  const origin = `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"] ?? req.headers["host"]}`;
  const inviteUrl = `${origin}/accept-invite/${token}`;

  if (existing) {
    // Re-send invite with new token
    await db
      .update(orgMembersTable)
      .set({ inviteToken: token, invitedAt: new Date() })
      .where(eq(orgMembersTable.id, existing.id));
  } else {
    await db.insert(orgMembersTable).values({
      orgId: org.id,
      email: normalizedEmail,
      role: "admin",
      inviteToken: token,
      invitedBy: req.user.id,
    });
  }

  // Send invite email if Resend is configured
  const orgName = org.name ?? "your organization";
  try {
    await sendEmail({
      to: normalizedEmail,
      subject: `You've been invited to manage ${orgName} on Pillar`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#1e2d4a;">You're invited!</h2>
          <p>You've been invited to help manage <strong>${orgName}</strong> on Pillar — the operations platform for civic organizations.</p>
          <p style="margin:24px 0;">
            <a href="${inviteUrl}" style="background:#c9a227;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">
              Accept Invitation
            </a>
          </p>
          <p style="color:#666;font-size:14px;">This link expires in 7 days. If you didn't expect this email, you can safely ignore it.</p>
        </div>
      `,
    });
  } catch {
    // Email sending is best-effort — return the invite URL so admin can share manually
  }

  res.json({ ok: true, inviteUrl, email: normalizedEmail });
});

// DELETE /api/org-members/:id — remove a member
router.delete("/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const [member] = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.id, req.params.id), eq(orgMembersTable.orgId, org.id)));

  if (!member) {
    res.status(404).json({ error: "Member not found." });
    return;
  }

  await db
    .delete(orgMembersTable)
    .where(eq(orgMembersTable.id, req.params.id));

  res.json({ ok: true });
});

// GET /api/org-members/accept/:token — get invite info (public)
router.get("/accept/:token", async (req: Request, res: Response) => {
  const [invite] = await db
    .select()
    .from(orgMembersTable)
    .where(eq(orgMembersTable.inviteToken, req.params.token));

  if (!invite) {
    res.status(404).json({ error: "Invite not found or already used." });
    return;
  }

  if (invite.acceptedAt) {
    res.status(400).json({ error: "This invite has already been accepted." });
    return;
  }

  const [org] = await db
    .select({ name: organizationsTable.name, type: organizationsTable.type })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, invite.orgId));

  res.json({
    email: invite.email,
    orgName: org?.name ?? "an organization",
    orgType: org?.type ?? null,
    role: invite.role,
  });
});

// POST /api/org-members/accept/:token — accept an invite (requires auth)
router.post("/accept/:token", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "You must be signed in to accept an invitation." });
    return;
  }

  const [invite] = await db
    .select()
    .from(orgMembersTable)
    .where(eq(orgMembersTable.inviteToken, req.params.token));

  if (!invite) {
    res.status(404).json({ error: "Invite not found or already used." });
    return;
  }

  if (invite.acceptedAt) {
    res.status(400).json({ error: "This invite has already been accepted." });
    return;
  }

  const userEmail = req.user.email?.toLowerCase() ?? "";
  if (userEmail && invite.email.toLowerCase() !== userEmail) {
    res.status(403).json({
      error: `This invite was sent to ${invite.email}. Please sign in with that email address to accept.`,
    });
    return;
  }

  await db
    .update(orgMembersTable)
    .set({
      userId: req.user.id,
      acceptedAt: new Date(),
      inviteToken: null,
    })
    .where(eq(orgMembersTable.id, invite.id));

  res.json({ ok: true, orgId: invite.orgId });
});

export default router;
