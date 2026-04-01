import { Router, type Request, type Response } from "express";
import { db, organizationsTable, domainsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { addEmailForward, listEmailForwards, deleteEmailForward } from "../porkbun";
import { logger } from "../lib/logger";
import { resolveFullOrg } from "../lib/resolveOrg";

const router = Router();

function getResendKey(): string | null {
  return process.env.RESEND_API_KEY ?? null;
}

// ─── GET /email-settings ──────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const [domain] = await db
    .select()
    .from(domainsTable)
    .where(eq(domainsTable.orgId, org.id));

  const isPillarDomain = !!domain && domain.registrar === "porkbun" && !domain.isExternal;

  let forwards: { alias: string; destination: string }[] = [];
  if (isPillarDomain && domain) {
    forwards = await listEmailForwards(domain.domain);
  }

  res.json({
    senderEmail: org.senderEmail ?? null,
    senderName: org.senderName ?? null,
    senderDomainVerified: org.senderDomainVerified ?? false,
    resendDomainId: org.resendDomainId ?? null,
    emailForwardAlias: org.emailForwardAlias ?? null,
    emailForwardDestination: org.emailForwardDestination ?? null,
    emailForwardActive: org.emailForwardActive ?? false,
    domain: domain ? {
      id: domain.id,
      domain: domain.domain,
      status: domain.status,
      isPillarDomain,
    } : null,
    forwards,
  });
});

// ─── POST /email-settings/forward ─────────────────────────────────────────────
// Set up email forwarding for a Pillar-managed domain

router.post("/forward", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { alias, destination } = req.body as { alias?: string; destination?: string };

  if (!alias || !destination) {
    res.status(400).json({ error: "alias and destination are required" });
    return;
  }

  if (!/^[a-zA-Z0-9._%+\-]+$/.test(alias)) {
    res.status(400).json({ error: "Invalid alias — use only letters, numbers, dots, hyphens, or underscores" });
    return;
  }

  if (!destination.includes("@")) {
    res.status(400).json({ error: "destination must be a valid email address" });
    return;
  }

  const [domain] = await db
    .select()
    .from(domainsTable)
    .where(eq(domainsTable.orgId, org.id));

  if (!domain) {
    res.status(400).json({ error: "You need a domain registered through Pillar to use email forwarding." });
    return;
  }

  const isPillarDomain = domain.registrar === "porkbun" && !domain.isExternal;

  if (!isPillarDomain) {
    res.status(400).json({
      error: "Email forwarding is only available for domains registered through Pillar. For externally-managed domains, set up forwarding through your registrar.",
    });
    return;
  }

  const result = await addEmailForward(domain.domain, alias.toLowerCase(), destination.toLowerCase());

  if (!result.success) {
    logger.warn({ domain: domain.domain, alias, error: result.error }, "Email forward failed");
    res.status(500).json({ error: result.error ?? "Failed to set up email forwarding. Please try again." });
    return;
  }

  await db.update(organizationsTable).set({
    emailForwardAlias: alias.toLowerCase(),
    emailForwardDestination: destination.toLowerCase(),
    emailForwardActive: true,
  }).where(eq(organizationsTable.id, org.id));

  res.json({
    ok: true,
    message: `${alias.toLowerCase()}@${domain.domain} will now forward to ${destination.toLowerCase()}. It may take a few minutes to activate.`,
    forward: { alias: alias.toLowerCase(), destination: destination.toLowerCase(), domain: domain.domain },
  });
});

// ─── DELETE /email-settings/forward ───────────────────────────────────────────

router.delete("/forward", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  if (!org.emailForwardAlias || !org.emailForwardDestination) {
    res.status(400).json({ error: "No active email forward to remove." });
    return;
  }

  const [domain] = await db
    .select()
    .from(domainsTable)
    .where(eq(domainsTable.orgId, org.id));

  if (domain) {
    await deleteEmailForward(domain.domain, org.emailForwardAlias, org.emailForwardDestination);
  }

  await db.update(organizationsTable).set({
    emailForwardAlias: null,
    emailForwardDestination: null,
    emailForwardActive: false,
  }).where(eq(organizationsTable.id, org.id));

  res.json({ ok: true });
});

// ─── POST /email-settings/sender ──────────────────────────────────────────────
// Register org domain with Resend for branded outgoing email

router.post("/sender", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { senderEmail, senderName } = req.body as { senderEmail?: string; senderName?: string };

  if (!senderEmail || !senderEmail.includes("@")) {
    res.status(400).json({ error: "A valid sender email address is required." });
    return;
  }

  const resendKey = getResendKey();
  if (!resendKey) {
    res.status(503).json({ error: "Email service not configured. Please add your RESEND_API_KEY." });
    return;
  }

  const senderDomain = senderEmail.split("@")[1];

  try {
    const existingRes = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${resendKey}` },
    });
    const existingData = await existingRes.json() as { data?: Array<{ id: string; name: string }> };
    const alreadyExists = existingData.data?.find(d => d.name === senderDomain);

    let domainId = alreadyExists?.id ?? null;

    if (!domainId) {
      const createRes = await fetch("https://api.resend.com/domains", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: senderDomain }),
      });
      const created = await createRes.json() as { id?: string; records?: unknown[] };
      domainId = created.id ?? null;
    }

    await db.update(organizationsTable).set({
      senderEmail: senderEmail.toLowerCase(),
      senderName: senderName ?? org.name,
      resendDomainId: domainId,
      senderDomainVerified: false,
    }).where(eq(organizationsTable.id, org.id));

    // Fetch DNS records for this domain
    let dnsRecords: unknown[] = [];
    if (domainId) {
      const domainRes = await fetch(`https://api.resend.com/domains/${domainId}`, {
        headers: { Authorization: `Bearer ${resendKey}` },
      });
      const domainData = await domainRes.json() as { records?: unknown[] };
      dnsRecords = domainData.records ?? [];
    }

    res.json({
      ok: true,
      domainId,
      senderEmail: senderEmail.toLowerCase(),
      dnsRecords,
      message: `Sender domain ${senderDomain} registered. Add the DNS records below to your registrar to start sending from ${senderEmail}.`,
    });
  } catch (err) {
    logger.error({ err }, "Failed to register sender domain with Resend");
    res.status(500).json({ error: "Failed to register sender domain. Please try again." });
  }
});

// ─── POST /email-settings/sender/verify ───────────────────────────────────────

router.post("/sender/verify", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  if (!org.resendDomainId) {
    res.status(400).json({ error: "No sender domain registered yet." });
    return;
  }

  const resendKey = getResendKey();
  if (!resendKey) {
    res.status(503).json({ error: "Email service not configured." });
    return;
  }

  try {
    const verifyRes = await fetch(`https://api.resend.com/domains/${org.resendDomainId}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}` },
    });
    const data = await verifyRes.json() as { status?: string };

    const verified = data.status === "verified";
    await db.update(organizationsTable).set({ senderDomainVerified: verified }).where(eq(organizationsTable.id, org.id));

    res.json({
      verified,
      status: data.status,
      message: verified
        ? `✓ Domain verified! Emails will now send from ${org.senderEmail}.`
        : "DNS records haven't propagated yet. This can take up to 48 hours. Try again later.",
    });
  } catch (err) {
    logger.error({ err }, "Failed to verify sender domain");
    res.status(500).json({ error: "Verification check failed. Please try again." });
  }
});

// ─── GET /email-settings/sender/records ───────────────────────────────────────

router.get("/sender/records", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  if (!org.resendDomainId) {
    res.status(400).json({ error: "No sender domain registered." });
    return;
  }

  const resendKey = getResendKey();
  if (!resendKey) {
    res.status(503).json({ error: "Email service not configured." });
    return;
  }

  try {
    const domainRes = await fetch(`https://api.resend.com/domains/${org.resendDomainId}`, {
      headers: { Authorization: `Bearer ${resendKey}` },
    });
    const data = await domainRes.json() as { records?: unknown[]; status?: string };

    res.json({
      records: data.records ?? [],
      status: data.status ?? "unknown",
      senderEmail: org.senderEmail,
      verified: org.senderDomainVerified,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch DNS records." });
  }
});

// ─── DELETE /email-settings/sender ────────────────────────────────────────────

router.delete("/sender", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  await db.update(organizationsTable).set({
    senderEmail: null,
    senderName: null,
    resendDomainId: null,
    senderDomainVerified: false,
  }).where(eq(organizationsTable.id, org.id));

  res.json({ ok: true });
});

export default router;
