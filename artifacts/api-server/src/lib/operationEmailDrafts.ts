import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { sendEmail, type MailResult } from "../mailer";

type DraftOrg = {
  id: string;
  name: string;
};

type Recipient = {
  email: string;
  name: string;
  tokens: Record<string, string>;
};

export type EmailDraftIntent =
  | "unpaid_vendor_reminder"
  | "sponsor_thank_you"
  | "volunteer_reminder"
  | "member_renewal"
  | "event_announcement";

export const VALID_EMAIL_DRAFT_INTENTS = new Set<EmailDraftIntent>([
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

function email(value: unknown): string {
  const candidate = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function applyTokens(template: string, recipient: Recipient): string {
  let next = template;
  for (const [key, value] of Object.entries(recipient.tokens)) {
    next = next.replace(new RegExp(`{{\\s*${key}\\s*}}`, "gi"), value);
  }
  return next;
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

export async function resolveOperationalEmailRecipients(
  orgId: string,
  input: { intent: EmailDraftIntent; eventId?: string | null },
): Promise<Recipient[]> {
  if (input.intent === "unpaid_vendor_reminder") {
    const rows = await db.execute(sql`
      SELECT name, contact_name, email
      FROM registrations
      WHERE org_id = ${orgId}
        AND type = 'vendor'
        AND (status = 'pending_payment' OR stripe_payment_status = 'unpaid')
        AND email IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return rows.rows
      .map((row) => {
        const r = row as Record<string, unknown>;
        const to = email(r.email);
        const name = text(r.contact_name) || text(r.name) || "there";
        return to ? { email: to, name, tokens: { contact_name: name, first_name: name.split(/\s+/)[0] ?? name } } : null;
      })
      .filter(Boolean) as Recipient[];
  }

  if (input.intent === "sponsor_thank_you") {
    const rows = await db.execute(sql`
      SELECT name, email
      FROM sponsors
      WHERE org_id = ${orgId}
        AND status = 'active'
        AND email IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return rows.rows
      .map((row) => {
        const r = row as Record<string, unknown>;
        const to = email(r.email);
        const name = text(r.name) || "there";
        return to ? { email: to, name, tokens: { sponsor_name: name, contact_name: name, first_name: name.split(/\s+/)[0] ?? name } } : null;
      })
      .filter(Boolean) as Recipient[];
  }

  if (input.intent === "volunteer_reminder") {
    const rows = await db.execute(sql`
      SELECT first_name, last_name, email
      FROM members
      WHERE org_id = ${orgId}
        AND status = 'active'
        AND (member_type = 'volunteer' OR member_type = 'general')
        AND email IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return rows.rows
      .map((row) => {
        const r = row as Record<string, unknown>;
        const to = email(r.email);
        const firstName = text(r.first_name) || "there";
        const name = [firstName, text(r.last_name)].filter(Boolean).join(" ");
        return to ? { email: to, name, tokens: { first_name: firstName, contact_name: name } } : null;
      })
      .filter(Boolean) as Recipient[];
  }

  if (input.intent === "member_renewal") {
    const soon = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rows = await db.execute(sql`
      SELECT first_name, last_name, email, renewal_date
      FROM members
      WHERE org_id = ${orgId}
        AND status = 'active'
        AND email IS NOT NULL
        AND renewal_date IS NOT NULL
        AND renewal_date <= ${soon}
      ORDER BY renewal_date ASC
      LIMIT 100
    `);
    return rows.rows
      .map((row) => {
        const r = row as Record<string, unknown>;
        const to = email(r.email);
        const firstName = text(r.first_name) || "there";
        const name = [firstName, text(r.last_name)].filter(Boolean).join(" ");
        return to ? { email: to, name, tokens: { first_name: firstName, contact_name: name } } : null;
      })
      .filter(Boolean) as Recipient[];
  }

  const rows = await db.execute(sql`
    SELECT email, name
    FROM newsletter_subscribers
    WHERE org_id = ${orgId}
      AND email IS NOT NULL
      AND unsubscribed_at IS NULL
    ORDER BY subscribed_at DESC
    LIMIT 250
  `);
  return rows.rows
    .map((row) => {
      const r = row as Record<string, unknown>;
      const to = email(r.email);
      const subscriberName = text(r.name) || "there";
      const firstName = subscriberName.split(/\s+/)[0] ?? subscriberName;
      return to ? { email: to, name: firstName, tokens: { first_name: firstName, contact_name: firstName } } : null;
    })
    .filter(Boolean) as Recipient[];
}

export async function buildOperationalEmailDraft(
  org: DraftOrg,
  input: { intent: EmailDraftIntent; eventId?: string | null },
) {
  const event = await getEventSummary(org.id, text(input.eventId) || null);
  const eventName = text(event?.name);
  const eventDate = text(event?.start_date);
  const eventLocation = text(event?.location);
  const orgName = firstNameFromOrg(org.name ?? "your organization");
  let subject = "";
  let draftBody = "";
  let recipientsPreview = "No matching recipients found yet.";
  let recipients = await resolveOperationalEmailRecipients(org.id, input);
  let recipientCount = recipients.length;

  if (input.intent === "unpaid_vendor_reminder") {
    recipientsPreview = recipientCount
      ? `${recipientCount} vendor${recipientCount === 1 ? "" : "s"} with unpaid or pending items`
      : recipientsPreview;
    subject = `Reminder: complete your ${orgName} vendor registration`;
    draftBody = `Hi {{contact_name}},\n\nThanks for registering as a vendor with ${orgName}. Our records show your registration still has a payment or approval step outstanding.\n\nPlease complete the remaining step so we can finalize your spot${eventName ? ` for ${eventName}` : ""}.\n\nThank you,\n${orgName}`;
  }

  if (input.intent === "sponsor_thank_you") {
    recipientsPreview = recipientCount
      ? `${recipientCount} active sponsor${recipientCount === 1 ? "" : "s"}`
      : recipientsPreview;
    subject = `Thank you for supporting ${orgName}`;
    draftBody = `Hi {{sponsor_name}},\n\nOn behalf of ${orgName}, thank you for your support${eventName ? ` of ${eventName}` : ""}. Your sponsorship helps us serve the community and make our events stronger.\n\nWe appreciate your partnership and will continue sharing sponsor recognition details as the event approaches.\n\nWith gratitude,\n${orgName}`;
  }

  if (input.intent === "volunteer_reminder") {
    recipientsPreview = recipientCount
      ? `${recipientCount} active volunteer/general member${recipientCount === 1 ? "" : "s"}`
      : recipientsPreview;
    subject = eventName ? `Volunteer reminder: ${eventName}` : `${orgName} volunteer reminder`;
    draftBody = `Hi {{first_name}},\n\nA quick reminder from ${orgName}${eventName ? ` about ${eventName}` : ""}. We appreciate everyone who helps make our work possible.\n\nPlease reply if your availability has changed or if you need details about your role.\n\nThank you,\n${orgName}`;
  }

  if (input.intent === "member_renewal") {
    recipientsPreview = recipientCount
      ? `${recipientCount} member${recipientCount === 1 ? "" : "s"} due for renewal soon`
      : recipientsPreview;
    subject = `${orgName} membership renewal reminder`;
    draftBody = `Hi {{first_name}},\n\nThis is a friendly reminder that your ${orgName} membership renewal is coming up.\n\nThank you for being part of our organization. Please contact us if you have questions about dues or renewal details.\n\nSincerely,\n${orgName}`;
  }

  if (input.intent === "event_announcement") {
    recipientsPreview = recipientCount
      ? `${recipientCount} newsletter subscriber${recipientCount === 1 ? "" : "s"}`
      : recipientsPreview;
    subject = eventName ? `${eventName} is coming up` : `Upcoming events from ${orgName}`;
    draftBody = eventName
      ? `Hi there,\n\n${orgName} is getting ready for ${eventName}${eventDate ? ` on ${eventDate}` : ""}${eventLocation ? ` at ${eventLocation}` : ""}.\n\nWe would love to see you there. Watch for more details and registration information soon.\n\n${orgName}`
      : `Hi there,\n\n${orgName} has new events coming up. Visit our site for dates, details, and registration information.\n\n${orgName}`;
  }

  return {
    subject,
    body: draftBody,
    recipientsPreview,
    recipientCount,
    status: "draft" as const,
    intent: input.intent,
  };
}

export async function sendOperationalEmailDraft(
  org: DraftOrg,
  input: {
    intent: EmailDraftIntent;
    subject: string;
    body: string;
    eventId?: string | null;
    dryRun?: boolean;
  },
) {
  const recipients = await resolveOperationalEmailRecipients(org.id, input);
  if (!recipients.length) {
    return {
      ok: false,
      error: "No recipients match this operational email.",
      recipientCount: 0,
      sentCount: 0,
      simulatedCount: 0,
      failedCount: 0,
      dryRun: input.dryRun === true,
      results: [] as Array<{ email: string; sent: boolean; simulated?: boolean; error?: string }>,
    };
  }

  const results: Array<{ email: string; sent: boolean; simulated?: boolean; error?: string }> = [];
  for (const recipient of recipients) {
    const personalizedBody = applyTokens(input.body, recipient);
    if (input.dryRun === true) {
      results.push({ email: recipient.email, sent: false, simulated: true });
      continue;
    }
    const result: MailResult = await sendEmail({
      to: recipient.email,
      subject: input.subject,
      html: bodyToHtml(personalizedBody),
      text: personalizedBody,
    });
    results.push({
      email: recipient.email,
      sent: result.sent,
      simulated: result.simulated,
      error: result.error,
    });
  }

  const sentCount = results.filter((result) => result.sent).length;
  const simulatedCount = results.filter((result) => result.simulated).length;
  const failedCount = results.filter((result) => !result.sent && !result.simulated).length;
  return {
    ok: failedCount === 0,
    recipientCount: recipients.length,
    sentCount,
    simulatedCount,
    failedCount,
    dryRun: input.dryRun === true,
    results,
  };
}
