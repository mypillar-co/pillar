import { Router, type Request, type Response } from "express";
import { resolveFullOrg } from "../lib/resolveOrg";
import { requireOperationsTier } from "../lib/operationsTier";
import {
  buildOperationalEmailDraft,
  sendOperationalEmailDraft,
  VALID_EMAIL_DRAFT_INTENTS,
  type EmailDraftIntent,
} from "../lib/operationEmailDrafts";

const router = Router();

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

router.post("/email-draft", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!requireOperationsTier(org, res)) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const intent = text(body.intent) as EmailDraftIntent;
  if (!VALID_EMAIL_DRAFT_INTENTS.has(intent)) {
    res.status(400).json({
      error: "Unknown email draft intent",
      validIntents: [...VALID_EMAIL_DRAFT_INTENTS],
    });
    return;
  }

  res.json(await buildOperationalEmailDraft(org, {
    intent,
    eventId: text(body.eventId) || null,
  }));
});

router.post("/email-send", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!requireOperationsTier(org, res)) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const intent = text(body.intent) as EmailDraftIntent;
  if (!VALID_EMAIL_DRAFT_INTENTS.has(intent)) {
    res.status(400).json({
      error: "Unknown email intent",
      validIntents: [...VALID_EMAIL_DRAFT_INTENTS],
    });
    return;
  }

  const subject = text(body.subject);
  const draftBody = text(body.body);
  if (!subject || !draftBody) {
    res.status(400).json({ error: "Subject and body are required before sending." });
    return;
  }
  if (body.confirm !== true && body.dryRun !== true) {
    res.status(400).json({ error: "Confirm this send before emails go out." });
    return;
  }

  const result = await sendOperationalEmailDraft(org, {
    intent,
    subject,
    body: draftBody,
    eventId: text(body.eventId) || null,
    dryRun: body.dryRun === true,
  });
  if (!result.ok) {
    res.status(result.recipientCount === 0 ? 400 : 502).json({
      error: result.error ?? "One or more emails could not be sent.",
      ...result,
    });
    return;
  }
  res.json({
    status: result.dryRun ? "dry_run" : "sent",
    ...result,
  });
});

export default router;
