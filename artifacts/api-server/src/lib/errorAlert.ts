import { logger } from "./logger";
import { sendFounderDigest } from "../mailer";

const ALERT_EMAILS = (process.env.ADMIN_EMAILS ?? "steward.ai.app@gmail.com")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

const dedupeCache = new Map<string, number>();
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

function shouldAlert(key: string): boolean {
  const last = dedupeCache.get(key);
  const now = Date.now();
  if (last && now - last < DEDUP_WINDOW_MS) return false;
  dedupeCache.set(key, now);
  return true;
}

function errorKey(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}:${err.message.slice(0, 120)}`;
  }
  return String(err).slice(0, 120);
}

export async function sendErrorAlert(context: string, err: unknown): Promise<void> {
  const key = `${context}:${errorKey(err)}`;
  if (!shouldAlert(key)) return;

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? (err.stack ?? "") : "";
  const ts = new Date().toISOString();

  const subject = `[Pillar ERROR] ${context}`;
  const bodyHtml = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#ef4444;letter-spacing:1px;text-transform:uppercase;">Server Error</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">${context}</h1>
    <p style="margin:0 0 8px;font-size:15px;color:rgba(255,255,255,0.75);">
      <strong style="color:#ffffff;">Message:</strong> ${message}
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.5);">
      <strong style="color:rgba(255,255,255,0.7);">Timestamp:</strong> ${ts}
    </p>
    ${stack ? `
    <pre style="margin:16px 0 0;padding:16px;background:#0a0f1e;border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-size:11px;color:rgba(255,255,255,0.5);white-space:pre-wrap;word-break:break-all;line-height:1.6;">${stack.slice(0, 2000)}</pre>
    ` : ""}
  `;
  const bodyText = `[${ts}] ERROR in ${context}\n\n${message}\n\n${stack.slice(0, 2000)}`;

  try {
    await sendFounderDigest(subject, bodyHtml, bodyText);
    logger.info({ context, key }, "[errorAlert] Alert sent");
  } catch (mailErr) {
    logger.warn({ mailErr, context }, "[errorAlert] Failed to send alert email");
  }
}

export function attachProcessErrorHandlers(): void {
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "[process] Uncaught exception");
    sendErrorAlert("Uncaught Exception", err).catch(() => {});
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "[process] Unhandled promise rejection");
    sendErrorAlert("Unhandled Promise Rejection", reason).catch(() => {});
  });
}
