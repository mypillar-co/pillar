import { createHash } from "crypto";

export function computeDataHash(inputs: unknown[]): string {
  const serialized = JSON.stringify(inputs, Object.keys(inputs as Record<string, unknown>).sort());
  return createHash("sha256").update(serialized).digest("hex");
}
