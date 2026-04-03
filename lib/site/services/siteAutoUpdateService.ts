import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { sitesTable } from "@workspace/db";
import { siteBlocksTable } from "@workspace/db";
import { siteBlockBindingsTable } from "@workspace/db";
import { siteChangeLogTable } from "@workspace/db";
import { siteRenderCacheTable } from "@workspace/db";
import { compileSite } from "./siteCompiler.js";
import { renderBlock } from "./blockRenderer.js";
import { getSiteData } from "./siteDataIntegrationService.js";
import { logInfo, logError } from "./siteLogService.js";
import { computeDataHash } from "../utils/dataHash.js";
import type { SiteBlock, SiteTheme } from "@workspace/db";
import type { AutoUpdateResult, SiteBlockBinding } from "../types/site-bindings.js";
import { siteThemesTable } from "@workspace/db";

/**
 * Identity block types that carry curated org content and must NEVER be
 * overwritten by the auto-update pipeline, regardless of binding policy.
 */
const IDENTITY_PROTECTED_BLOCK_TYPES = new Set([
  "about", "mission", "board", "programs", "history", "team",
  "vision", "values", "leadership", "staff",
]);

const SERVICE = "siteAutoUpdateService";

export async function runAutoUpdate(orgId: string, siteId: string): Promise<AutoUpdateResult> {
  await logInfo(SERVICE, "runAutoUpdate", `Auto-update triggered for site ${siteId}`, { siteId }, orgId, siteId);

  try {
    const [site] = await db
      .select()
      .from(sitesTable)
      .where(and(
        eq(sitesTable.id, siteId),
        eq(sitesTable.orgId, orgId),
        isNull(sitesTable.deletedAt),
      ))
      .limit(1);

    if (!site) throw new Error(`Site not found: ${siteId}`);

    if (!site.autoUpdateEnabled) {
      await logInfo(SERVICE, "runAutoUpdate", `Auto-update skipped: autoUpdateEnabled=false for site ${siteId}`, { siteId }, orgId, siteId);
      return { updatedBlocks: [], suggestedBlocks: [], skippedBlocks: [], compiledHtml: null };
    }

    const [theme] = await db
      .select()
      .from(siteThemesTable)
      .where(eq(siteThemesTable.siteId, siteId))
      .limit(1);

    const effectiveTheme: SiteTheme = theme ?? {
      id: "",
      siteId,
      themePresetKey: "pillar-default",
      colorPrimary: "#1e3a5f",
      colorSecondary: "#2d5080",
      colorAccent: "#f59e0b",
      colorSurface: "#f8fafc",
      colorText: "#111827",
      fontHeadingKey: "DM Serif Display",
      fontBodyKey: "DM Sans",
      radiusScale: "14px",
      shadowStyle: "soft",
      heroStyleDefault: "gradient-dark",
      buttonStyle: "rounded",
      logoMode: "image",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const blocks = await db
      .select()
      .from(siteBlocksTable)
      .where(and(
        eq(siteBlocksTable.siteId, siteId),
        eq(siteBlocksTable.orgId, orgId),
        isNull(siteBlocksTable.deletedAt),
        eq(siteBlocksTable.isVisible, true),
      ));

    const bindings = await db
      .select()
      .from(siteBlockBindingsTable)
      .where(and(
        eq(siteBlockBindingsTable.siteId, siteId),
        eq(siteBlockBindingsTable.orgId, orgId),
      ));

    const bindingsByBlockId = new Map<string, typeof bindings[0]>(bindings.map(b => [b.blockId, b]));

    // ── Fetch fresh live data for all bound blocks ─────────────────────────
    const freshDataMap = await getSiteData(orgId, siteId, bindings as SiteBlockBinding[]);

    const updatedBlocks: string[] = [];
    const suggestedBlocks: string[] = [];
    const skippedBlocks: string[] = [];
    const changeLogEntries: Array<{ blockId: string; blockType: string; oldHash: string; newHash: string }> = [];

    for (const block of blocks as SiteBlock[]) {
      // Identity-content blocks are unconditionally protected from auto-update
      if (IDENTITY_PROTECTED_BLOCK_TYPES.has(block.blockType)) {
        skippedBlocks.push(block.id);
        continue;
      }

      const binding = bindingsByBlockId.get(block.id);

      if (!binding) {
        if (block.lockLevel === "locked") { skippedBlocks.push(block.id); continue; }
        if (block.lockLevel === "review_required") { suggestedBlocks.push(block.id); continue; }
        skippedBlocks.push(block.id);
        continue;
      }

      if (block.lockLevel !== "editable") {
        skippedBlocks.push(block.id);
        continue;
      }

      const updatePolicy = binding.updatePolicy ?? "manual_only";

      if (updatePolicy === "suggest_review") {
        suggestedBlocks.push(block.id);
        continue;
      }

      if (updatePolicy === "manual_only") {
        skippedBlocks.push(block.id);
        continue;
      }

      // auto_apply: refresh live data, re-render, update cache
      const liveData = freshDataMap[block.id];
      const newHash = computeDataHash([block.contentJson, block.variantKey, block.settingsJson, liveData ?? null]);

      // Check if data has actually changed vs. current cache
      const [existingCache] = await db
        .select()
        .from(siteRenderCacheTable)
        .where(and(
          eq(siteRenderCacheTable.blockId, block.id),
          eq(siteRenderCacheTable.orgId, orgId),
          eq(siteRenderCacheTable.siteId, siteId),
        ))
        .limit(1);

      const oldHash = existingCache?.dataHash ?? "";
      if (oldHash === newHash) {
        skippedBlocks.push(block.id);
        continue;
      }

      // Data changed — re-render and update cache
      const renderedHtml = renderBlock(block, effectiveTheme, liveData);

      if (existingCache) {
        await db
          .update(siteRenderCacheTable)
          .set({ renderedHtml, dataHash: newHash, renderedAt: new Date() })
          .where(and(
            eq(siteRenderCacheTable.blockId, block.id),
            eq(siteRenderCacheTable.orgId, orgId),
            eq(siteRenderCacheTable.siteId, siteId),
          ));
      } else {
        await db.insert(siteRenderCacheTable).values({
          siteId,
          orgId,
          blockId: block.id,
          renderedHtml,
          dataHash: newHash,
          renderedAt: new Date(),
        }).catch(() => {});
      }

      // Optimistic lock: only update if version hasn't changed since we read the block
      await db.update(siteBlocksTable)
        .set({ updatedAt: new Date(), version: sql`${siteBlocksTable.version} + 1` })
        .where(and(
          eq(siteBlocksTable.id, block.id),
          eq(siteBlocksTable.orgId, orgId),
          eq(siteBlocksTable.version, block.version),
        ));

      updatedBlocks.push(block.id);
      changeLogEntries.push({ blockId: block.id, blockType: block.blockType, oldHash, newHash });
    }

    // ── Recompile full site HTML from updated cache ─────────────────────
    const compiledHtml = await compileSite(orgId, siteId, "block_compile");

    // ── Write change log — one entry per changed block, plus summary ─────
    if (changeLogEntries.length > 0) {
      for (const entry of changeLogEntries) {
        await db.insert(siteChangeLogTable).values({
          siteId,
          orgId,
          changeType: "auto_update",
          entityType: "block",
          entityId: entry.blockId,
          diffJson: {
            blockType: entry.blockType,
            oldDataHash: entry.oldHash,
            newDataHash: entry.newHash,
          },
          triggeredBy: "system",
        }).catch(() => {});
      }

      await db.insert(siteChangeLogTable).values({
        siteId,
        orgId,
        changeType: "auto_update",
        entityType: "site",
        entityId: siteId,
        diffJson: {
          updatedBlocks: updatedBlocks.length,
          suggestedBlocks: suggestedBlocks.length,
          skippedBlocks: skippedBlocks.length,
        },
        triggeredBy: "system",
      }).catch(() => {});
    }

    await logInfo(
      SERVICE,
      "runAutoUpdate",
      `Auto-update completed for site ${siteId}`,
      { siteId, updatedBlocks: updatedBlocks.length, suggested: suggestedBlocks.length, skipped: skippedBlocks.length },
      orgId,
      siteId,
    );

    return { updatedBlocks, suggestedBlocks, skippedBlocks, compiledHtml };
  } catch (err) {
    await logError(SERVICE, "runAutoUpdate", `Auto-update failed for site ${siteId}`, { siteId }, err, orgId, siteId);
    throw err;
  }
}

export async function updateBlock(orgId: string, blockId: string): Promise<void> {
  const [block] = await db
    .select()
    .from(siteBlocksTable)
    .where(and(
      eq(siteBlocksTable.id, blockId),
      eq(siteBlocksTable.orgId, orgId),
      isNull(siteBlocksTable.deletedAt),
    ))
    .limit(1);

  if (!block) throw new Error(`Block not found: ${blockId}`);

  // Identity-content blocks must not be overwritten programmatically
  if (IDENTITY_PROTECTED_BLOCK_TYPES.has(block.blockType)) {
    throw new Error(`Block ${blockId} (type: ${block.blockType}) is identity-protected and cannot be auto-updated`);
  }

  // Optimistic lock: scoped to orgId + version check to prevent concurrent overwrites
  await db.update(siteBlocksTable)
    .set({ updatedAt: new Date(), version: sql`${siteBlocksTable.version} + 1` })
    .where(and(
      eq(siteBlocksTable.id, blockId),
      eq(siteBlocksTable.orgId, orgId),
      eq(siteBlocksTable.version, block.version),
    ));

  await compileSite(orgId, block.siteId!, "block_compile");
}
