import { Router, type Request, type Response } from "express";
import { db, organizationsTable, websiteSpecsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

const contactRateMap = new Map<string, number[]>();
const CONTACT_LIMIT = 3;
const CONTACT_WINDOW_MS = 60 * 60 * 1000;

function isIpRateLimited(ip: string): boolean {
  const now = Date.now();
  const times = (contactRateMap.get(ip) ?? []).filter(t => now - t < CONTACT_WINDOW_MS);
  if (times.length >= CONTACT_LIMIT) return true;
  times.push(now);
  contactRateMap.set(ip, times);
  return false;
}

router.post("/:orgSlug", async (req: Request, res: Response) => {
  const { orgSlug } = req.params;
  const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";

  const { name, email, message, _honey, _ts } = req.body as {
    name?: string; email?: string; message?: string; _honey?: string; _ts?: string;
  };

  // Honeypot: bots fill the hidden field — silently accept to not reveal detection
  if (_honey) {
    res.json({ success: true });
    return;
  }

  // Timestamp check: legitimate users take > 2s to fill the form
  const tsAge = _ts ? Date.now() - Number(_ts) : Infinity;
  if (tsAge < 2000) {
    res.json({ success: true });
    return;
  }

  if (isIpRateLimited(ip)) {
    res.status(429).json({ error: "Too many messages. Please try again later." });
    return;
  }

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    res.status(400).json({ error: "Please fill in all required fields." });
    return;
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }

  if (message.trim().length > 5000) {
    res.status(400).json({ error: "Message is too long." });
    return;
  }

  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, orgSlug));

  if (!org) {
    res.status(404).json({ error: "Organization not found." });
    return;
  }

  const [spec] = await db
    .select({ contactEmail: websiteSpecsTable.contactEmail })
    .from(websiteSpecsTable)
    .where(eq(websiteSpecsTable.orgId, org.id));

  const toEmail = spec?.contactEmail?.trim();
  if (!toEmail) {
    res.status(400).json({ error: "This organization has not configured a contact email. Please use the contact information listed on this page." });
    return;
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    logger.error("RESEND_API_KEY not configured — cannot send contact form email");
    res.status(500).json({ error: "Email delivery is unavailable right now. Please try again later." });
    return;
  }

  const safeName = name.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeEmail = email.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeMsg = message.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

  try {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Pillar <hello@mypillar.co>",
        to: [toEmail],
        reply_to: email.trim(),
        subject: `New message from ${name.trim()} via your ${org.name} website`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <p style="color:#888;font-size:0.85rem;margin-bottom:24px">Sent via your <strong>${org.name}</strong> website contact form</p>
            <h2 style="color:#1a2744;margin:0 0 20px">New Contact Message</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr>
                <td style="padding:10px 0;color:#888;font-size:0.85rem;width:80px;vertical-align:top">Name</td>
                <td style="padding:10px 0;font-weight:600">${safeName}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#888;font-size:0.85rem;vertical-align:top">From</td>
                <td style="padding:10px 0"><a href="mailto:${safeEmail}" style="color:#2563eb">${safeEmail}</a></td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#888;font-size:0.85rem;vertical-align:top">Message</td>
                <td style="padding:10px 0;line-height:1.6">${safeMsg}</td>
              </tr>
            </table>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
            <p style="color:#aaa;font-size:0.8rem">Reply directly to this email to respond to ${safeName}.</p>
          </div>`,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      logger.error({ status: emailRes.status, body: errBody }, "Resend API error on contact form submission");
      res.status(500).json({ error: "Failed to send your message. Please try again." });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Contact form send failed");
    res.status(500).json({ error: "Failed to send your message. Please try again." });
  }
});

export default router;
