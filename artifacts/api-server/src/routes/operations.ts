import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { resolveFullOrg } from "../lib/resolveOrg";
import { requireOperationsTier } from "../lib/operationsTier";

const router = Router();

type EmailDraftIntent =
  | "unpaid_vendor_reminder"
  | "sponsor_thank_you"
  | "volunteer_reminder"
  | "member_renewal"
  | "event_announcement";

const VALID_INTENTS = new Set<EmailDraftIntent>([
  "unpaid_vendor_reminder",
  "sponsor_thank_you",
  "volunteer_reminder",
  "member_renewal",
  "event_announcement",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstNameFromOrg(orgName: string): string {
  return orgName.trim() || "your organization";
}

async function getEventSummary(orgId: string, eventId?: string | null) {
  if (!eventId) return null;
  const result = await db.execute(sql`
    SELECT id, name, start_date, start_time, location
    FROM events
    WHERE id = ${eventId} AND org_id = ${orgId}
    LIMIT 1
  `);
  return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
}

router.post("/email-draft", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!requireOperationsTier(org, res)) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const intent = text(body.intent) as EmailDraftIntent;
  if (!VALID_INTENTS.has(intent)) {
    res.status(400).json({
      error: "Unknown email draft intent",
      validIntents: [...VALID_INTENTS],
    });
    return;
  }

  const event = await getEventSummary(org.id, text(body.eventId) || null);
  const orgName = firstNameFromOrg(org.name ?? "your organization");
  let subject = "";
  let draftBody = "";
  let recipientsPreview = "No matching recipients found yet.";
  let recipientCount = 0;

  if (intent === "unpaid_vendor_reminder") {
    const rows = await db.execute(sql`
      SELECT name, email
      FROM registrations
      WHERE org_id = ${org.id}
        AND type = 'vendor'
        AND (status = 'pending_payment' OR stripe_payment_status = 'unpaid')
      ORDER BY created_at DESC
      LIMIT 25
    `);
    recipientCount = rows.rows.length;
    recipientsPreview = recipientCount
      ? `${recipientCount} vendor${recipientCount === 1 ? "" : "s"} with unpaid or pending items`
      : recipientsPreview;
    subject = `Reminder: complete your ${orgName} vendor registration`;
    draftBody = `Hi {{contact_name}},\n\nThanks for registering as a vendor with ${orgName}. Our records show your registration still has a payment or approval step outstanding.\n\nPlease complete the remaining step so we can finalize your spot${event ? ` for ${event.name}` : ""}.\n\nThank you,\n${orgName}`;
  }

  if (intent === "sponsor_thank_you") {
    const rows = await db.execute(sql`
      SELECT name, email
      FROM sponsors
      WHERE org_id = ${org.id}
        AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 25
    `);
    recipientCount = rows.rows.length;
    recipientsPreview = recipientCount
      ? `${recipientCount} active sponsor${recipientCount === 1 ? "" : "s"}`
      : recipientsPreview;
    subject = `Thank you for supporting ${orgName}`;
    draftBody = `Hi {{sponsor_name}},\n\nOn behalf of ${orgName}, thank you for your support${event ? ` of ${event.name}` : ""}. Your sponsorship helps us serve the community and make our events stronger.\n\nWe appreciate your partnership and will continue sharing sponsor recognition details as the event approaches.\n\nWith gratitude,\n${orgName}`;
  }

  if (intent === "volunteer_reminder") {
    const rows = await db.execute(sql`
      SELECT first_name, last_name, email
      FROM members
      WHERE org_id = ${org.id}
        AND status = 'active'
        AND (member_type = 'volunteer' OR member_type = 'general')
        AND email IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 50
    `);
    recipientCount = rows.rows.length;
    recipientsPreview = recipientCount
      ? `${recipientCount} active volunteer/general member${recipientCount === 1 ? "" : "s"}`
      : recipientsPreview;
    subject = event ? `Volunteer reminder: ${event.name}` : `${orgName} volunteer reminder`;
    draftBody = `Hi {{first_name}},\n\nA quick reminder from ${orgName}${event ? ` about ${event.name}` : ""}. We appreciate everyone who helps make our work possible.\n\nPlease reply if your availability has changed or if you need details about your role.\n\nThank you,\n${orgName}`;
  }

  if (intent === "member_renewal") {
    const soon = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rows = await db.execute(sql`
      SELECT first_name, last_name, email, renewal_date
      FROM members
      WHERE org_id = ${org.id}
        AND status = 'active'
        AND email IS NOT NULL
        AND renewal_date IS NOT NULL
        AND renewal_date <= ${soon}
      ORDER BY renewal_date ASC
      LIMIT 50
    `);
    recipientCount = rows.rows.length;
    recipientsPreview = recipientCount
      ? `${recipientCount} member${recipientCount === 1 ? "" : "s"} due for renewal soon`
      : recipientsPreview;
    subject = `${orgName} membership renewal reminder`;
    draftBody = `Hi {{first_name}},\n\nThis is a friendly reminder that your ${orgName} membership renewal is coming up.\n\nThank you for being part of our organization. Please contact us if you have questions about dues or renewal details.\n\nSincerely,\n${orgName}`;
  }

  if (intent === "event_announcement") {
    const subscriberRows = await db.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM newsletter_subscribers
      WHERE org_id = ${org.id}
    `);
    recipientCount = Number((subscriberRows.rows[0] as { n?: number } | undefined)?.n ?? 0);
    recipientsPreview = recipientCount
      ? `${recipientCount} newsletter subscriber${recipientCount === 1 ? "" : "s"}`
      : recipientsPreview;
    subject = event ? `${event.name} is coming up` : `Upcoming events from ${orgName}`;
    draftBody = event
      ? `Hi there,\n\n${orgName} is getting ready for ${event.name}${event.start_date ? ` on ${event.start_date}` : ""}${event.location ? ` at ${event.location}` : ""}.\n\nWe would love to see you there. Watch for more details and registration information soon.\n\n${orgName}`
      : `Hi there,\n\n${orgName} has new events coming up. Visit our site for dates, details, and registration information.\n\n${orgName}`;
  }

  res.json({
    subject,
    body: draftBody,
    recipientsPreview,
    recipientCount,
    status: "draft",
    intent,
  });
});

export default router;
