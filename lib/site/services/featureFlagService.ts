import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { orgFeatureFlagsTable } from "@workspace/db";
import { orgPlanTable } from "@workspace/db";

const cache = new Map<string, { value: boolean; expiresAt: number }>();
const TTL_MS = 60_000;

function getCacheKey(orgId: string, featureKey: string): string {
  return `${orgId}:${featureKey}`;
}

export async function isFeatureEnabled(orgId: string, featureKey: string): Promise<boolean> {
  const cacheKey = getCacheKey(orgId, featureKey);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const [plan] = await db
      .select()
      .from(orgPlanTable)
      .where(eq(orgPlanTable.orgId, orgId))
      .limit(1);

    if (plan?.featureOverridesJson && featureKey in (plan.featureOverridesJson as Record<string, boolean>)) {
      const value = (plan.featureOverridesJson as Record<string, boolean>)[featureKey];
      cache.set(cacheKey, { value, expiresAt: Date.now() + TTL_MS });
      return value;
    }

    const [flag] = await db
      .select()
      .from(orgFeatureFlagsTable)
      .where(and(
        eq(orgFeatureFlagsTable.orgId, orgId),
        eq(orgFeatureFlagsTable.featureKey, featureKey),
      ))
      .limit(1);

    const value = flag?.enabled ?? false;
    cache.set(cacheKey, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  } catch {
    return false;
  }
}

export async function requireFeature(orgId: string, featureKey: string): Promise<void> {
  const enabled = await isFeatureEnabled(orgId, featureKey);
  if (!enabled) {
    const err = new Error(`Feature '${featureKey}' is not enabled for this organization.`) as Error & { status: number };
    err.status = 403;
    throw err;
  }
}

export function invalidateFlagCache(orgId: string, featureKey?: string): void {
  if (featureKey) {
    cache.delete(getCacheKey(orgId, featureKey));
  } else {
    for (const key of cache.keys()) {
      if (key.startsWith(`${orgId}:`)) cache.delete(key);
    }
  }
}
