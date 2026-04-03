import { Router, type Request, type Response } from "express";
import { db, sitesTable, siteThemesTable, sitePagesTable, siteBlocksTable, siteNavItemsTable, siteDataSourcesTable, siteBlockBindingsTable, siteChangeLogTable, jobQueueTable, siteImportRunsTable, siteVersionsTable, siteRenderCacheTable } from "@workspace/db";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { resolveOrgScope } from "../lib/resolveOrgScope.js";
import { compileSite } from "@workspace/site/services";
import { buildSiteProfile } from "@workspace/site/services";
import { determineLayoutStrategy, buildPagePlan } from "@workspace/site/services";
import { generateBlockContent } from "@workspace/site/services";
import { run as runImport, getImportFindings } from "@workspace/site/services";
import { createVersion, listVersions, rollbackToVersion } from "@workspace/site/services";
import { runAutoUpdate } from "@workspace/site/services";
import { initializeModulesForSite } from "@workspace/site/services";
import { deriveTheme } from "@workspace/site/utils";
import { enqueueJob } from "@workspace/site/services";
import { logInfo, logError } from "@workspace/site/services";
import { recordActivity } from "@workspace/site/services";
import { getPublicEventCount, countEventsWithImages } from "@workspace/site/services";
import { getActiveSponsorCount } from "@workspace/site/services";

const router = Router();

const SERVICE = "siteEngine";

/**
 * Semantic mission strength scoring.
 * Replaces simple length check with audience specificity, purpose language, and community vocabulary.
 */
function computeMissionStrength(
  mission: string,
  importHasStrongMission: boolean,
): "none" | "weak" | "strong" {
  if (!mission || mission.length < 15) {
    return importHasStrongMission ? "weak" : "none";
  }

  const lower = mission.toLowerCase();
  let score = 0;

  // Specific audience language (+2)
  const AUDIENCE_WORDS = ["youth", "seniors", "veteran", "families", "children", "adults", "women", "men", "immigrant", "low-income", "underserved", "homeless", "students", "neighbor"];
  if (AUDIENCE_WORDS.some(w => lower.includes(w))) score += 2;

  // Purpose / action verbs (+2)
  const PURPOSE_PHRASES = ["to serve", "to provide", "to support", "to build", "to connect", "to empower", "to create", "to develop", "to foster", "to advance", "to promote", "to deliver"];
  if (PURPOSE_PHRASES.some(p => lower.includes(p))) score += 2;

  // Action verbs (present participle form) (+1)
  const ACTION_VERBS = ["empowering", "building", "connecting", "supporting", "serving", "creating", "developing", "fostering", "advancing", "delivering", "strengthening", "providing"];
  if (ACTION_VERBS.some(v => lower.includes(v))) score += 1;

  // Community language (+1)
  const COMMUNITY_WORDS = ["community", "neighborhood", "local", "together", "collective", "mutual", "shared", "region", "city", "village"];
  if (COMMUNITY_WORDS.some(w => lower.includes(w))) score += 1;

  // Length bonus (+1 for 60+ chars, +1 more for 120+)
  if (mission.length >= 60) score += 1;
  if (mission.length >= 120) score += 1;

  // Import signal: if the import explicitly found a mission statement, treat as at least weak
  if (importHasStrongMission && score < 2) score = 2;

  if (score >= 4) return "strong";
  if (score >= 2) return "weak";
  return "none";
}

async function getOrCreateSite(orgId: string, orgName?: string): Promise<typeof sitesTable.$inferSelect> {
  const [existing] = await db
    .select()
    .from(sitesTable)
    .where(and(eq(sitesTable.orgId, orgId), isNull(sitesTable.deletedAt)))
    .limit(1);

  if (existing) return existing;

  const slug = (orgName ?? "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const [site] = await db.insert(sitesTable).values({
    orgId,
    name: orgName ?? "My Site",
    slug,
    status: "draft",
  }).returning();

  return site;
}

router.post("/generate", resolveOrgScope, async (req: Request, res: Response) => {
  const orgId = req.orgId!;

  try {
    const {
      history = [],
      interviewBody,
      importRunId,
      contentStrategy,
    } = req.body as {
      history?: { role: string; content: string }[];
      interviewBody?: string;
      importRunId?: string;
      contentStrategy?: { tone?: string };
    };

    const orgResult = await db.execute(sql`SELECT * FROM organizations WHERE id = ${orgId} LIMIT 1`)
      .catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
    const orgData: Record<string, unknown> = (orgResult as { rows: Array<Record<string, unknown>> }).rows?.[0] ?? {};

    const effectiveInterview = interviewBody ??
      (history.length > 0 ? history.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n") : "");

    let importFindings: Array<Record<string, unknown>> = [];
    if (importRunId) {
      try {
        importFindings = await getImportFindings(orgId, importRunId);
      } catch {
        importFindings = [];
      }
    }

    const profile = buildSiteProfile(orgId, {
      org: { ...orgData, id: orgId },
      interviewBody: effectiveInterview,
      importRunId,
      importFindings,
      contentStrategy,
    });

    // ── Real signal counts from adapters ──────────────────────────────────
    const [eventCount, sponsorCount, eventsWithImages] = await Promise.all([
      getPublicEventCount(orgId),
      getActiveSponsorCount(orgId),
      countEventsWithImages(orgId),
    ]);

    // ── Import findings influence on signals ──────────────────────────────
    const findingTypes = new Set(importFindings.map(f => (f as Record<string, unknown>).findingType as string));
    const importHasHeroImage = findingTypes.has("hero_image");
    const importHasStrongMission = findingTypes.has("mission");
    const importEventHeavy = findingTypes.has("event_listing") || findingTypes.has("event_calendar");
    const importMembershipSignal = findingTypes.has("membership") || findingTypes.has("join_cta");
    const importDonateCta = findingTypes.has("donate") || findingTypes.has("donate_cta");
    const importTicketLink = findingTypes.has("ticket") || findingTypes.has("event_listing");
    const importImageRich = findingTypes.has("hero_image") || findingTypes.has("gallery");

    // Import event count from findings if available and higher than DB count
    const findingEventCount = importFindings
      .filter(f => (f as Record<string, unknown>).findingType === "event_count")
      .reduce((max, f) => Math.max(max, Number((f as Record<string, unknown>).value ?? 0)), 0);
    const effectiveEventCount = Math.max(eventCount, findingEventCount);

    // ── Mission strength — semantic scoring ──────────────────────────────
    const missionStrength = computeMissionStrength(profile.mission, importHasStrongMission);

    // ── CTA type — import findings take priority over org default ─────────
    // Order: explicit join signals > donate signals > ticket signals > org default
    const orgCtaBase = profile.primaryCtaType;
    const ctaType = importMembershipSignal ? "join"
      : importDonateCta ? "donate"
      : importTicketLink ? "register"
      : orgCtaBase;

    // ── Image richness — multiple real signals ─────────────────────────────
    // Consider: import found images, org has a logo, events have images
    const imageRichness: "high" | "none" =
      (importImageRich || eventsWithImages >= 2 || !!profile.logoUrl) ? "high" : "none";

    // ── Program count — profile may include keyword-inferred placeholders ──
    const realPrograms = profile.programs.filter(p => !p.startsWith("__kw_"));
    const inferredCount = profile.programs.filter(p => p.startsWith("__kw_")).length;
    const programCount = realPrograms.length > 0 ? realPrograms.length : inferredCount;

    const signals = {
      eventCount: effectiveEventCount,
      sponsorCount,
      programCount,
      imageRichness,
      missionStrength,
      membershipPresence: importMembershipSignal || (orgData.type as string | null)?.toLowerCase().includes("member") === true,
      ctaType,
      importHasHeroImage,
      importHasStrongMission,
      importEventHeavy,
      aiSignals: {
        eventHeavy: effectiveEventCount >= 3,
        strongMission: missionStrength === "strong",
        membershipDriven: importMembershipSignal,
        imageRich: imageRichness === "high",
        minimalContent: effectiveEventCount === 0 && sponsorCount === 0 && programCount === 0,
      },
    };

    const strategy = determineLayoutStrategy(profile, signals);
    const site = await getOrCreateSite(orgId, profile.orgName);

    const plan = buildPagePlan(orgId, site.id, profile, strategy, signals);

    // Extract structured import data to seed block content generation
    const importHeroFinding = importFindings.find(f => (f as Record<string, unknown>).findingType === "hero_image");
    const importContactFinding = importFindings.find(f => (f as Record<string, unknown>).findingType === "contact");
    const importMissionFinding = importFindings.find(f => (f as Record<string, unknown>).findingType === "mission");

    const importData = (importFindings.length > 0) ? {
      heroImageUrl: (importHeroFinding?.contentJson as Record<string, unknown> | undefined)?.url as string | undefined,
      contactEmail: (importContactFinding?.contentJson as Record<string, unknown> | undefined)?.email as string | undefined,
      contactPhone: (importContactFinding?.contentJson as Record<string, unknown> | undefined)?.phone as string | undefined,
      contactAddress: (importContactFinding?.contentJson as Record<string, unknown> | undefined)?.address as string | undefined,
      missionText: (importMissionFinding?.contentJson as Record<string, unknown> | undefined)?.text as string | undefined,
    } : undefined;

    const contentResult = await generateBlockContent(orgId, plan, profile, importData, { strategy, ctaType });

    const theme = deriveTheme(profile, signals, profile.importedColors ?? []);

    const existingTheme = await db
      .select()
      .from(siteThemesTable)
      .where(eq(siteThemesTable.siteId, site.id))
      .limit(1);

    if (existingTheme.length > 0) {
      await db.update(siteThemesTable).set({
        themePresetKey: theme.presetKey,
        colorPrimary: theme.colorPrimary,
        colorSecondary: theme.colorSecondary,
        colorAccent: theme.colorAccent,
        colorSurface: theme.colorSurface,
        colorText: theme.colorText,
        fontHeadingKey: theme.fontHeadingKey,
        fontBodyKey: theme.fontBodyKey,
        radiusScale: theme.radiusScale,
        shadowStyle: theme.shadowStyle,
        heroStyleDefault: theme.heroStyleDefault,
        buttonStyle: theme.buttonStyle,
      }).where(eq(siteThemesTable.siteId, site.id));
    } else {
      await db.insert(siteThemesTable).values({
        siteId: site.id,
        themePresetKey: theme.presetKey,
        colorPrimary: theme.colorPrimary,
        colorSecondary: theme.colorSecondary,
        colorAccent: theme.colorAccent,
        colorSurface: theme.colorSurface,
        colorText: theme.colorText,
        fontHeadingKey: theme.fontHeadingKey,
        fontBodyKey: theme.fontBodyKey,
        radiusScale: theme.radiusScale,
        shadowStyle: theme.shadowStyle,
        heroStyleDefault: theme.heroStyleDefault,
        buttonStyle: theme.buttonStyle,
      });
    }

    for (const page of plan.pages) {
      const existingPage = await db.select().from(sitePagesTable)
        .where(and(eq(sitePagesTable.siteId, site.id), eq(sitePagesTable.orgId, orgId), eq(sitePagesTable.slug, page.slug), isNull(sitePagesTable.deletedAt)))
        .limit(1);

      let pageId: string;

      if (existingPage.length > 0) {
        pageId = existingPage[0].id;
        await db.update(sitePagesTable).set({
          title: page.title,
          pageType: page.pageType,
          isHomepage: page.isHomepage,
          sortOrder: page.sortOrder,
          isPublished: true,
        }).where(and(eq(sitePagesTable.id, pageId), eq(sitePagesTable.orgId, orgId)));
      } else {
        const [newPage] = await db.insert(sitePagesTable).values({
          siteId: site.id,
          orgId,
          title: page.title,
          slug: page.slug,
          pageType: page.pageType,
          isHomepage: page.isHomepage,
          sortOrder: page.sortOrder,
          isPublished: true,
        }).returning({ id: sitePagesTable.id });
        pageId = newPage.id;
      }

      await db.update(siteBlocksTable)
        .set({ deletedAt: new Date() })
        .where(and(eq(siteBlocksTable.pageId, pageId), eq(siteBlocksTable.orgId, orgId), isNull(siteBlocksTable.deletedAt)));

      for (const block of page.blocks) {
        const blockContent = contentResult.contentMap[block.id] ?? block.contentJson ?? {};

        const [newBlock] = await db.insert(siteBlocksTable).values({
          siteId: site.id,
          orgId,
          pageId,
          blockType: block.blockType,
          variantKey: block.variantKey,
          contentJson: blockContent as Record<string, unknown>,
          settingsJson: block.settingsJson ?? {},
          sortOrder: block.sortOrder,
          lockLevel: block.lockLevel,
          sourceMode: block.sourceMode,
          isVisible: true,
        }).returning({ id: siteBlocksTable.id });

        if (block.bindingSpec) {
          const [dataSource] = await db.insert(siteDataSourcesTable).values({
            siteId: site.id,
            orgId,
            sourceType: block.bindingSpec.sourceType,
            refreshStrategy: "realtime",
            syncStatus: "idle",
          }).returning({ id: siteDataSourcesTable.id }).catch(async () => {
            const existing = await db.select().from(siteDataSourcesTable)
              .where(and(eq(siteDataSourcesTable.siteId, site.id), eq(siteDataSourcesTable.orgId, orgId), eq(siteDataSourcesTable.sourceType, block.bindingSpec!.sourceType)))
              .limit(1);
            return existing;
          });

          if (dataSource?.id) {
            await db.insert(siteBlockBindingsTable).values({
              blockId: newBlock.id,
              orgId,
              siteId: site.id,
              dataSourceId: dataSource.id,
              bindingType: block.bindingSpec.bindingType,
              queryConfigJson: block.bindingSpec.queryConfigJson,
              displayConfigJson: block.bindingSpec.displayConfigJson ?? {},
              updatePolicy: block.bindingSpec.updatePolicy,
            }).catch(() => {});
          }
        }
      }
    }

    for (const nav of plan.navItems) {
      const existingNav = await db.select().from(siteNavItemsTable)
        .where(and(eq(siteNavItemsTable.siteId, site.id), eq(siteNavItemsTable.orgId, orgId), eq(siteNavItemsTable.label, nav.label)))
        .limit(1);

      if (existingNav.length === 0) {
        const targetPage = await db.select().from(sitePagesTable)
          .where(and(eq(sitePagesTable.siteId, site.id), eq(sitePagesTable.slug, nav.slug)))
          .limit(1);

        await db.insert(siteNavItemsTable).values({
          siteId: site.id,
          orgId,
          label: nav.label,
          pageId: targetPage[0]?.id ?? null,
          navLocation: nav.navLocation,
          sortOrder: nav.sortOrder,
          isVisible: true,
        });
      }
    }

    await initializeModulesForSite(orgId, site.id);

    const compiledHtml = await compileSite(orgId, site.id, "full_compile");

    await db.update(sitesTable)
      .set({ status: "draft", name: profile.orgName, version: sql`${sitesTable.version} + 1` })
      .where(and(eq(sitesTable.id, site.id), eq(sitesTable.orgId, orgId)));

    await logInfo(SERVICE, "generate", `Site generated for org ${orgId}`, { siteId: site.id, strategy, pageCount: plan.pages.length }, orgId, site.id);
    await recordActivity(orgId, "site_generated", site.id).catch(() => {});

    res.json({
      success: true,
      siteId: site.id,
      strategy,
      pageCount: plan.pages.length,
      blockCount: plan.pages.reduce((s: number, p: { blocks: unknown[] }) => s + p.blocks.length, 0),
      hasCompiledHtml: !!compiledHtml,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logError(SERVICE, "generate", `Generate failed for org ${orgId}`, { orgId }, err, orgId);
    res.status(500).json({ error: "Site generation failed", details: msg });
  }
});

router.post("/import-url-v2", resolveOrgScope, async (req: Request, res: Response) => {
  const orgId = req.orgId!;

  const { url } = req.body as { url?: string };
  if (!url?.trim()) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  try {
    const result = await runImport(orgId, url);

    res.json({
      importRunId: result.importRunId,
      status: result.status,
      detectedSiteType: result.detectedSiteType,
      findingCount: result.findings.length,
      heroImageUrl: result.rankedImages.find((i: { role: string }) => i.role === "hero")?.url ?? null,
      logoUrl: result.rankedImages.find((i: { role: string }) => i.role === "logo")?.url ?? null,
      hasMission: result.findings.some((f: { findingType: string }) => f.findingType === "mission"),
      hasContactInfo: result.findings.some((f: { findingType: string }) => f.findingType === "contact"),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(422).json({ error: "Import failed", details: msg });
  }
});

router.get("/import-runs/:importRunId/findings", resolveOrgScope, async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const { importRunId } = req.params;

  try {
    const findings = await getImportFindings(orgId, importRunId);
    res.json({ findings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) {
      res.status(404).json({ error: "Import run not found" });
    } else {
      res.status(500).json({ error: "Failed to fetch findings" });
    }
  }
});

router.post("/compile", resolveOrgScope, async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const { mode = "full_compile" } = req.body as { mode?: "full_compile" | "block_compile" | "page_compile" };

  try {
    const [site] = await db
      .select()
      .from(sitesTable)
      .where(and(eq(sitesTable.orgId, orgId), isNull(sitesTable.deletedAt)))
      .limit(1);

    if (!site) {
      res.status(404).json({ error: "No site found" });
      return;
    }

    const html = await compileSite(orgId, site.id, mode);
    res.json({ success: true, compiled: !!html, siteId: site.id });
  } catch (err) {
    res.status(500).json({ error: "Compile failed" });
  }
});

router.put("/publish-v2", resolveOrgScope, async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const { publish = true } = req.body as { publish?: boolean };

  try {
    const [site] = await db
      .select()
      .from(sitesTable)
      .where(and(eq(sitesTable.orgId, orgId), isNull(sitesTable.deletedAt)))
      .limit(1);

    if (!site) {
      res.status(404).json({ error: "No site found" });
      return;
    }

    if (!site.generatedHtml) {
      res.status(400).json({ error: "Site has no compiled content" });
      return;
    }

    if (publish) {
      const version = await createVersion(orgId, site.id, site.generatedHtml, req.user?.id);

      await db.update(sitesTable)
        .set({ status: "published", publishedAt: new Date(), publishedVersion: version.versionNumber })
        .where(and(eq(sitesTable.id, site.id), eq(sitesTable.orgId, orgId)));

      await db.insert(siteChangeLogTable).values({
        siteId: site.id,
        orgId,
        changeType: "publish",
        entityType: "site",
        entityId: site.id,
        diffJson: { versionNumber: version.versionNumber, publishedBy: req.user?.id ?? "system" },
        triggeredBy: req.user?.id ? "user" : "system",
      }).catch(() => {});

      await recordActivity(orgId, "site_published", site.id).catch(() => {});
      res.json({ success: true, published: true, versionNumber: version.versionNumber });
    } else {
      await db.update(sitesTable)
        .set({ status: "draft", publishedAt: null })
        .where(and(eq(sitesTable.id, site.id), eq(sitesTable.orgId, orgId)));

      await recordActivity(orgId, "site_unpublished", site.id).catch(() => {});
      res.json({ success: true, published: false });
    }
  } catch (err) {
    res.status(500).json({ error: "Publish failed" });
  }
});

router.get("/versions", resolveOrgScope, async (req: Request, res: Response) => {
  const orgId = req.orgId!;

  try {
    const [site] = await db
      .select()
      .from(sitesTable)
      .where(and(eq(sitesTable.orgId, orgId), isNull(sitesTable.deletedAt)))
      .limit(1);

    if (!site) {
      res.status(404).json({ error: "No site found" });
      return;
    }

    const versions = await listVersions(orgId, site.id);
    res.json({ versions: versions.map((v: { id: string; versionNumber: number; createdAt: Date }) => ({ id: v.id, versionNumber: v.versionNumber, createdAt: v.createdAt })) });
  } catch (err) {
    res.status(500).json({ error: "Failed to list versions" });
  }
});

router.post("/versions/:versionNumber/rollback", resolveOrgScope, async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const versionNumber = parseInt(String(req.params.versionNumber), 10);

  if (isNaN(versionNumber) || versionNumber < 1) {
    res.status(400).json({ error: "Invalid version number" });
    return;
  }

  try {
    const [site] = await db
      .select()
      .from(sitesTable)
      .where(and(eq(sitesTable.orgId, orgId), isNull(sitesTable.deletedAt)))
      .limit(1);

    if (!site) {
      res.status(404).json({ error: "No site found" });
      return;
    }

    await rollbackToVersion(orgId, site.id, versionNumber);
    res.json({ success: true, rolledBackTo: versionNumber });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) {
      res.status(404).json({ error: `Version ${versionNumber} not found` });
    } else {
      res.status(500).json({ error: "Rollback failed" });
    }
  }
});

router.post("/auto-update", resolveOrgScope, async (req: Request, res: Response) => {
  const orgId = req.orgId!;

  try {
    const [site] = await db
      .select()
      .from(sitesTable)
      .where(and(eq(sitesTable.orgId, orgId), isNull(sitesTable.deletedAt)))
      .limit(1);

    if (!site) {
      res.status(404).json({ error: "No site found" });
      return;
    }

    const result = await runAutoUpdate(orgId, site.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: "Auto-update failed" });
  }
});

router.get("/health", async (req: Request, res: Response) => {
  const probeTable = async (label: string, fn: () => Promise<unknown>): Promise<{ ok: boolean; error?: string }> => {
    try { await fn(); return { ok: true }; }
    catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  };

  try {
    await db.select({ id: sitesTable.id }).from(sitesTable).limit(1);

    const [
      sitesProbe,
      eventsAdapterProbe,
      importAdapterProbe,
      versionsAdapterProbe,
      changeLogProbe,
      renderCacheProbe,
    ] = await Promise.all([
      probeTable("sites", () => db.select({ id: sitesTable.id }).from(sitesTable).limit(1)),
      probeTable("events_adapter", () => db.execute(sql`SELECT 1 FROM events LIMIT 1`)),
      probeTable("import_adapter", () => db.select({ id: siteImportRunsTable.id }).from(siteImportRunsTable).limit(1)),
      probeTable("versions_adapter", () => db.select({ id: siteVersionsTable.id }).from(siteVersionsTable).limit(1)),
      probeTable("change_log", () => db.select({ id: siteChangeLogTable.id }).from(siteChangeLogTable).limit(1)),
      probeTable("render_cache", () => db.select({ id: siteRenderCacheTable.id }).from(siteRenderCacheTable).limit(1)),
    ]);

    const [pendingJobs] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobQueueTable)
      .where(eq(jobQueueTable.status, "pending"))
      .catch(() => [{ count: 0 }]);

    const [failedJobs] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobQueueTable)
      .where(eq(jobQueueTable.failedPermanently, true))
      .catch(() => [{ count: 0 }]);

    const [lastCompile] = await db
      .select({ compiledAt: sitesTable.compiledAt })
      .from(sitesTable)
      .where(isNull(sitesTable.deletedAt))
      .orderBy(desc(sitesTable.compiledAt))
      .limit(1)
      .catch(() => [{ compiledAt: null }]);

    const adapters = {
      sites: sitesProbe,
      events: eventsAdapterProbe,
      import: importAdapterProbe,
      versions: versionsAdapterProbe,
      changeLog: changeLogProbe,
      renderCache: renderCacheProbe,
    };

    const allAdaptersOk = Object.values(adapters).every(a => a.ok);

    res.json({
      status: allAdaptersOk ? "ok" : "degraded",
      db: "connected",
      engine: "v2",
      adapters,
      queue: {
        pending: pendingJobs?.count ?? 0,
        failedPermanently: failedJobs?.count ?? 0,
      },
      lastCompileAt: lastCompile?.compiledAt ?? null,
      tables: {
        active: [
          "sites", "site_pages", "site_blocks", "site_themes",
          "site_block_bindings", "site_render_cache", "site_versions",
          "site_import_runs", "site_import_findings", "site_change_log",
          "site_media_assets", "site_system_logs", "job_queue",
        ],
        deferred: [
          "site_compiled_snapshots",
        ],
      },
    });
  } catch (err) {
    res.status(503).json({ status: "error", db: "disconnected", error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
