import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { resolveFullOrg } from "../lib/resolveOrg";
import { requireOperationsTier } from "../lib/operationsTier";
import { buildBoardMonthlyReport } from "../lib/boardReport";
import {
  buildOperationalEmailDraft,
} from "../lib/operationEmailDrafts";
import {
  applyDeterministicSiteEdit,
  detectDeterministicSiteEditIntent,
} from "../lib/siteEditIntents";

const router = Router();

type OperationStatus =
  | "completed"
  | "draft_prepared"
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

const pendingActions = new Map<string, PendingAction>();

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

function createPendingAction(
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
  pendingActions.set(id, action);
  return action;
}

function detectIntent(message: string): string {
  const lower = message.toLowerCase();
  const siteEditIntent = detectDeterministicSiteEditIntent(message);
  if (siteEditIntent) return siteEditIntent;

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

    if (confirmationRequiredIntent(intent)) {
      const action = createPendingAction(org.id, intent, message, {
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
  const action = pendingActionId ? pendingActions.get(pendingActionId) : null;
  if (!action || action.orgId !== org.id) {
    operationResponse(res, "error", "confirm_action", "Pending action was not found or has expired.");
    return;
  }

  operationResponse(res, "confirmation_required", action.intent, "Confirmation gates are in place. This phase does not execute send, publish, delete, invite, approval, social, or payment actions yet.", {
    pendingActionId: action.id,
    summary: action.summary,
    dryRun: true,
  }, action.id);
});

export default router;
