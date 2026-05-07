import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { resolveFullOrg } from "../lib/resolveOrg";
import { requireOperationsTier } from "../lib/operationsTier";
import { buildBoardMonthlyReport } from "../lib/boardReport";
import {
  buildOperationalEmailDraft,
  sendOperationalEmailDraft,
  VALID_EMAIL_DRAFT_INTENTS,
  type EmailDraftIntent,
} from "../lib/operationEmailDrafts";
import {
  applyDeterministicSiteEdit,
  detectDeterministicSiteEditIntent,
} from "../lib/siteEditIntents";
import {
  applyDeterministicEventMutation,
  hasDeterministicEventMutationIntent,
} from "../lib/eventMutationIntents";

const router = Router();

type OperationStatus =
  | "completed"
  | "draft_prepared"
  | "clarification_required"
  | "confirmation_required"
  | "unsupported"
  | "error";

type PendingAction = {
  id: string;
  intent: string;
  orgId: string;
  createdAt: string;
  expiresAt: string;
  summary: string;
  payload: Record<string, unknown>;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function operationResponse(
  res: Response,
  status: OperationStatus,
  intent: string,
  message: string,
  data?: Record<string, unknown>,
  pendingActionId?: string,
) {
  res.json({
    status,
    intent,
    message,
    ...(data ? { data } : {}),
    ...(pendingActionId ? { pendingActionId } : {}),
  });
}

async function createPendingAction(
  orgId: string,
  intent: string,
  summary: string,
  payload: Record<string, unknown>,
) {
  const id = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  const action: PendingAction = {
    id,
    intent,
    orgId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    summary,
    payload,
  };
  await db.execute(sql`
    INSERT INTO pending_actions (id, org_id, intent, summary, payload, status, created_at, expires_at)
    VALUES (${id}, ${orgId}, ${intent}, ${summary}, ${JSON.stringify(payload)}::jsonb, 'pending', ${now}, ${expiresAt})
  `);
  return action;
}

async function getPendingAction(id: string, orgId: string): Promise<PendingAction | null> {
  const rows = await db.execute(sql`
    SELECT id, org_id, intent, summary, payload, created_at, expires_at
    FROM pending_actions
    WHERE id = ${id}
      AND org_id = ${orgId}
      AND status = 'pending'
    LIMIT 1
  `);
  const row = rows.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const expiresAt = new Date(String(row.expires_at));
  if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
    await db.execute(sql`UPDATE pending_actions SET status = 'expired' WHERE id = ${id}`);
    return null;
  }
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    intent: String(row.intent),
    summary: String(row.summary),
    payload: (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>,
    createdAt: new Date(String(row.created_at)).toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

async function completePendingAction(id: string) {
  await db.execute(sql`
    UPDATE pending_actions
    SET status = 'completed', completed_at = now()
    WHERE id = ${id}
  `);
}

function emailIntentFromMessage(message: string): EmailDraftIntent | null {
  const lower = message.toLowerCase();
  if (lower.includes("vendor") && (lower.includes("reminder") || lower.includes("unpaid"))) {
    return "unpaid_vendor_reminder";
  }
  if (lower.includes("sponsor") && (lower.includes("thank") || lower.includes("thanks"))) {
    return "sponsor_thank_you";
  }
  if (lower.includes("volunteer") && lower.includes("reminder")) {
    return "volunteer_reminder";
  }
  if (lower.includes("renewal") && (lower.includes("member") || lower.includes("membership"))) {
    return "member_renewal";
  }
  if (lower.includes("event") && (lower.includes("announce") || lower.includes("announcement"))) {
    return "event_announcement";
  }
  return null;
}

function detectIntent(message: string): string {
  const lower = message.toLowerCase();
  const siteEditIntent = detectDeterministicSiteEditIntent(message);
  if (siteEditIntent) return siteEditIntent;
  if (hasDeterministicEventMutationIntent(message)) return "event_mutation";

  if (lower.includes("board") && lower.includes("report")) {
    return "generate_board_report";
  }
  if (lower.includes("draft") && lower.includes("vendor") && (lower.includes("reminder") || lower.includes("unpaid"))) {
    return "draft_vendor_reminder";
  }
  if ((lower.includes("show") || lower.includes("list")) && lower.includes("unpaid") && lower.includes("vendor")) {
    return "show_unpaid_vendors";
  }
  if (lower.includes("draft") && lower.includes("sponsor") && (lower.includes("thank") || lower.includes("thanks"))) {
    return "draft_sponsor_thank_you";
  }
  if (lower.includes("pending") && lower.includes("sponsor")) {
    return "show_pending_sponsors";
  }
  if (lower.includes("upcoming") && lower.includes("event")) {
    return "show_upcoming_events";
  }
  if (/\b(delete|remove|destroy)\b/.test(lower)) {
    return "delete_record";
  }
  if (/\bpublish\b/.test(lower) && lower.includes("event")) {
    return "publish_event";
  }
  if (/\b(send|blast|email)\b/.test(lower) && !lower.includes("draft")) {
    return "send_email";
  }
  if (lower.includes("approve") && lower.includes("sponsor")) {
    return "approve_sponsor";
  }
  if (lower.includes("publish") && lower.includes("social")) {
    return "publish_social_post";
  }
  if (lower.includes("invite") && lower.includes("member")) {
    return "invite_member";
  }
  if (/\b(charge|payment|refund|collect)\b/.test(lower)) {
    return "payment_action";
  }

  return "unsupported";
}

function operationsTierIntent(intent: string): boolean {
  return [
    "draft_vendor_reminder",
    "draft_sponsor_thank_you",
    "generate_board_report",
    "show_unpaid_vendors",
    "show_pending_sponsors",
    "show_upcoming_events",
  ].includes(intent);
}

function confirmationRequiredIntent(intent: string): boolean {
  return [
    "send_email",
    "publish_event",
    "delete_record",
    "approve_sponsor",
    "publish_social_post",
    "invite_member",
    "payment_action",
  ].includes(intent);
}

async function listPendingSponsors(orgId: string) {
  const rows = await db.execute(sql`
    SELECT id, name, email, status, stripe_payment_status
    FROM registrations
    WHERE org_id = ${orgId}
      AND type = 'sponsor'
      AND (status IN ('pending_payment', 'pending_approval') OR stripe_payment_status = 'unpaid')
    ORDER BY created_at DESC
    LIMIT 10
  `);
  return rows.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      name: String(r.name ?? "Sponsor"),
      email: text(r.email) || null,
      status: String(r.status ?? "pending"),
      paymentStatus: String(r.stripe_payment_status ?? "unknown"),
    };
  });
}

async function listUnpaidVendors(orgId: string) {
  const rows = await db.execute(sql`
    SELECT id, name, email, status, stripe_payment_status
    FROM registrations
    WHERE org_id = ${orgId}
      AND type = 'vendor'
      AND (status = 'pending_payment' OR stripe_payment_status = 'unpaid')
    ORDER BY created_at DESC
    LIMIT 10
  `);
  return rows.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      name: String(r.name ?? "Vendor"),
      email: text(r.email) || null,
      status: String(r.status ?? "pending"),
      paymentStatus: String(r.stripe_payment_status ?? "unknown"),
    };
  });
}

async function listUpcomingEvents(orgId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.execute(sql`
    SELECT id, name, start_date, start_time, location
    FROM events
    WHERE org_id = ${orgId}
      AND is_active = true
      AND start_date >= ${today}
    ORDER BY start_date ASC
    LIMIT 10
  `);
  return rows.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      name: String(r.name ?? "Event"),
      date: text(r.start_date) || null,
      time: text(r.start_time) || null,
      location: text(r.location) || null,
    };
  });
}

router.post("/operations", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const message = text(body.message);
  if (!message) {
    operationResponse(res, "unsupported", "unsupported", "Tell Pillar what you want to do. Try: change contact email to test@example.com, show unpaid vendors, draft reminder to unpaid vendors, or generate board report.");
    return;
  }

  const intent = detectIntent(message);
  if (operationsTierIntent(intent) && !requireOperationsTier(org, res)) return;

  try {
    const siteEditResult = await applyDeterministicSiteEdit(org.id, message);
    if (siteEditResult) {
      operationResponse(res, siteEditResult.status, siteEditResult.intent, siteEditResult.message, {
        ...(siteEditResult.data ?? {}),
        ...(siteEditResult.publicOrgId ? { publicOrgId: siteEditResult.publicOrgId } : {}),
      });
      return;
    }

    const eventMutation = await applyDeterministicEventMutation(org.id, message);
    if (eventMutation) {
      operationResponse(res, eventMutation.status, eventMutation.intent, eventMutation.message, eventMutation.data);
      return;
    }

    if (intent === "draft_vendor_reminder") {
      const draft = await buildOperationalEmailDraft(org, { intent: "unpaid_vendor_reminder" });
      operationResponse(res, "draft_prepared", intent, "Vendor reminder draft prepared. Nothing has been sent.", {
        kind: "email_draft",
        draft,
      });
      return;
    }

    if (intent === "draft_sponsor_thank_you") {
      const draft = await buildOperationalEmailDraft(org, { intent: "sponsor_thank_you" });
      operationResponse(res, "draft_prepared", intent, "Sponsor thank-you draft prepared. Nothing has been sent.", {
        kind: "email_draft",
        draft,
      });
      return;
    }

    if (intent === "generate_board_report") {
      const report = await buildBoardMonthlyReport(org);
      operationResponse(res, "draft_prepared", intent, "Board report prepared for review.", {
        kind: "board_report",
        report,
      });
      return;
    }

    if (intent === "show_pending_sponsors") {
      const sponsors = await listPendingSponsors(org.id);
      operationResponse(res, "completed", intent, sponsors.length
        ? `Found ${sponsors.length} pending sponsor item${sponsors.length === 1 ? "" : "s"}.`
        : "There are no pending sponsor items right now.", {
        kind: "list",
        href: "/dashboard/sponsors",
        items: sponsors,
      });
      return;
    }

    if (intent === "show_unpaid_vendors") {
      const vendors = await listUnpaidVendors(org.id);
      operationResponse(res, "completed", intent, vendors.length
        ? `Found ${vendors.length} unpaid vendor item${vendors.length === 1 ? "" : "s"}.`
        : "There are no unpaid vendor items right now.", {
        kind: "list",
        href: "/dashboard/registrations",
        items: vendors,
      });
      return;
    }

    if (intent === "show_upcoming_events") {
      const events = await listUpcomingEvents(org.id);
      operationResponse(res, "completed", intent, events.length
        ? `Found ${events.length} upcoming event${events.length === 1 ? "" : "s"}.`
        : "There are no upcoming events on the calendar right now.", {
        kind: "list",
        href: "/dashboard/events",
        items: events,
      });
      return;
    }

    if (intent === "send_email") {
      if (!requireOperationsTier(org, res)) return;
      const emailIntent = emailIntentFromMessage(message);
      if (!emailIntent || !VALID_EMAIL_DRAFT_INTENTS.has(emailIntent)) {
        const action = await createPendingAction(org.id, intent, message, {
          originalMessage: message,
        });
        operationResponse(
          res,
          "confirmation_required",
          intent,
          "This send request needs more detail before Pillar can prepare recipients. No email was sent.",
          {
            summary: action.summary,
            expiresAt: action.expiresAt,
          },
          action.id,
        );
        return;
      }
      const draft = await buildOperationalEmailDraft(org, { intent: emailIntent });
      const action = await createPendingAction(org.id, "send_operational_email_draft", message, {
        emailIntent,
        subject: draft.subject,
        body: draft.body,
      });
      operationResponse(
        res,
        "confirmation_required",
        "send_operational_email_draft",
        `${draft.recipientsPreview}. Review and confirm before sending.`,
        {
          kind: "email_draft",
          draft,
          summary: action.summary,
          expiresAt: action.expiresAt,
        },
        action.id,
      );
      return;
    }

    if (confirmationRequiredIntent(intent)) {
      const action = await createPendingAction(org.id, intent, message, {
        dryRun: true,
        originalMessage: message,
      });
      operationResponse(
        res,
        "confirmation_required",
        intent,
        "This action needs explicit confirmation before Pillar can do anything. No changes were made.",
        {
          summary: action.summary,
          expiresAt: action.expiresAt,
          dryRun: true,
        },
        action.id,
      );
      return;
    }

    operationResponse(res, "unsupported", "unsupported", "Ask Pillar actions are limited for now. Try: change contact email to test@example.com, show unpaid vendors, draft reminder to unpaid vendors, show pending sponsors, show upcoming events, or generate board report.");
  } catch (err) {
    operationResponse(res, "error", intent, err instanceof Error ? err.message : "Pillar could not complete that operation.");
  }
});

router.post("/operations/confirm", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const pendingActionId = text(body.pendingActionId);
  const action = pendingActionId ? await getPendingAction(pendingActionId, org.id) : null;
  if (!action) {
    operationResponse(res, "error", "confirm_action", "Pending action was not found or has expired.");
    return;
  }

  if (body.confirm !== true && text(body.confirmationText).toUpperCase() !== "SEND") {
    operationResponse(res, "confirmation_required", action.intent, "Confirm this action before Pillar executes it.", {
      pendingActionId: action.id,
      summary: action.summary,
    }, action.id);
    return;
  }

  if (action.intent === "send_operational_email_draft") {
    if (!requireOperationsTier(org, res)) return;
    const emailIntent = text(action.payload.emailIntent) as EmailDraftIntent;
    const subject = text(action.payload.subject);
    const draftBody = text(action.payload.body);
    if (!VALID_EMAIL_DRAFT_INTENTS.has(emailIntent) || !subject || !draftBody) {
      operationResponse(res, "error", action.intent, "Pending email draft is incomplete. Prepare the draft again.");
      return;
    }
    const result = await sendOperationalEmailDraft(org, {
      intent: emailIntent,
      subject,
      body: draftBody,
      dryRun: body.dryRun === true,
    });
    if (!result.ok) {
      operationResponse(res, "error", action.intent, result.error ?? "One or more emails could not be sent.", {
        kind: "email_send_result",
        result,
      });
      return;
    }
    await completePendingAction(action.id);
    operationResponse(res, "completed", action.intent, result.dryRun
      ? `Dry run complete for ${result.recipientCount} recipient${result.recipientCount === 1 ? "" : "s"}.`
      : `Email sent to ${result.sentCount + result.simulatedCount} recipient${result.sentCount + result.simulatedCount === 1 ? "" : "s"}.`, {
      kind: "email_send_result",
      result,
    });
    return;
  }

  operationResponse(res, "confirmation_required", action.intent, "This risky action is gated, but execution is not enabled from Command Center yet. No changes were made.", {
    pendingActionId: action.id,
    summary: action.summary,
    dryRun: true,
  }, action.id);
});

export default router;
