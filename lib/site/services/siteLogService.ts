import { db } from "@workspace/db";
import { siteSystemLogsTable } from "@workspace/db";

async function writeLog(
  severity: "info" | "warning" | "error",
  service: string,
  operation: string,
  message: string,
  meta?: Record<string, unknown>,
  orgId?: string,
  siteId?: string,
): Promise<void> {
  try {
    await db.insert(siteSystemLogsTable).values({
      orgId,
      siteId,
      service,
      operation,
      severity,
      message,
      metadataJson: meta,
    });
  } catch (err) {
    console.error("[siteLogService] Failed to write log:", err, { service, operation, message });
  }
}

export function logInfo(
  service: string,
  operation: string,
  message: string,
  meta?: Record<string, unknown>,
  orgId?: string,
  siteId?: string,
): Promise<void> {
  return writeLog("info", service, operation, message, meta, orgId, siteId);
}

export function logWarning(
  service: string,
  operation: string,
  message: string,
  meta?: Record<string, unknown>,
  orgId?: string,
  siteId?: string,
): Promise<void> {
  return writeLog("warning", service, operation, message, meta, orgId, siteId);
}

export function logError(
  service: string,
  operation: string,
  message: string,
  meta?: Record<string, unknown>,
  error?: unknown,
  orgId?: string,
  siteId?: string,
): Promise<void> {
  const errorMeta = {
    ...meta,
    ...(error instanceof Error
      ? { errorMessage: error.message, stack: error.stack }
      : error
        ? { error: String(error) }
        : {}),
  };
  return writeLog("error", service, operation, message, errorMeta, orgId, siteId);
}
