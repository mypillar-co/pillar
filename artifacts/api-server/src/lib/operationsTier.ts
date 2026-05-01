import type { Response } from "express";

export const OPERATIONS_TIERS = new Set(["tier2", "tier3"]);

export function tierAllowsOperations(tier: string | null | undefined): boolean {
  return OPERATIONS_TIERS.has(String(tier ?? ""));
}

export function requireOperationsTier(
  org: { tier?: string | null },
  res: Response,
): boolean {
  if (tierAllowsOperations(org.tier)) return true;
  res.status(403).json({
    error: "Operational tools are available on Events and Total Operations plans.",
  });
  return false;
}
