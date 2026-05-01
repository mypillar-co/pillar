import { Router, type Request, type Response } from "express";
import { resolveFullOrg } from "../lib/resolveOrg";
import { requireOperationsTier } from "../lib/operationsTier";
import {
  buildOperationalEmailDraft,
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

export default router;
