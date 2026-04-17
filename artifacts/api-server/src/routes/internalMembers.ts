import { Router, type Request, type Response, type NextFunction } from "express";
import { sendEmail } from "../mailer";
import { logger } from "../lib/logger";

const router = Router();

function requirePillarServiceKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.PILLAR_SERVICE_KEY;
  const provided = req.headers["x-pillar-service-key"] as string | undefined;
  if (!expected) {
    return res.status(500).json({ ok: false, error: "PILLAR_SERVICE_KEY not configured" });
  }
  if (provided !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

router.post("/member-reset-email", requirePillarServiceKey, async (req: Request, res: Response) => {
  const { to, firstName, orgName, url } = (req.body ?? {}) as {
    to?: string;
    firstName?: string;
    orgName?: string;
    url?: string;
  };
  if (!to || !url || !orgName) {
    return res.status(400).json({ ok: false, error: "to, url, orgName required" });
  }
  const name = firstName || "there";
  const subject = `Reset your ${orgName} password`;
  const text = `Hi ${name},

We received a request to reset your password for the ${orgName} members portal.

Click below to set a new password (link expires in 1 hour):

${url}

If you did not request this, you can ignore this email.

— ${orgName}`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;padding:40px 16px;margin:0;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <div style="background:#0a0f1e;color:#fff;padding:24px 32px;">
      <div style="font-size:20px;font-weight:600;letter-spacing:-0.01em;">${orgName}</div>
    </div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 12px;font-size:22px;color:#0a0f1e;">Reset your password</h1>
      <p style="color:#475569;line-height:1.55;margin:0 0 24px;">Hi ${name}, click the button below to choose a new password for your ${orgName} members account. This link expires in 1 hour.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${url}" style="display:inline-block;background:#c25038;color:#fff;text-decoration:none;font-weight:600;padding:13px 28px;border-radius:9px;font-size:15px;">Reset my password</a>
      </div>
      <p style="color:#94a3b8;font-size:13px;line-height:1.55;margin:28px 0 0;">Or copy this link into your browser:<br><a href="${url}" style="color:#c25038;word-break:break-all;">${url}</a></p>
      <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;">If you did not request this, you can safely ignore this email.</p>
    </div>
  </div>
</body></html>`;
  const result = await sendEmail({ to, subject, html, text });
  if (!result.sent && !result.simulated) {
    logger.warn({ to, error: result.error }, "[internal] member reset email failed");
  }
  if (result.simulated) {
    logger.info({ to, url }, "[internal] member reset SIMULATED — copy URL to test");
  }
  res.json({ ok: true, sent: result.sent, simulated: result.simulated });
});

export default router;
