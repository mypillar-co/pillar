import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { sitesTable } from "@workspace/db";
import { sitePagesTable } from "@workspace/db";
import { siteBlocksTable } from "@workspace/db";
import { siteNavItemsTable } from "@workspace/db";
import { siteThemesTable } from "@workspace/db";
import { siteBlockBindingsTable } from "@workspace/db";
import { siteRenderCacheTable } from "@workspace/db";
import { organizationsTable } from "@workspace/db";
import { getSiteData } from "./siteDataIntegrationService.js";
import { renderBlock } from "./blockRenderer.js";
import { logInfo, logError } from "./siteLogService.js";
import { computeDataHash } from "../utils/dataHash.js";
import type { CompileMode } from "../types/block-types.js";
import type { SiteBlock } from "@workspace/db";
import type { SiteTheme } from "@workspace/db";

const SERVICE = "siteCompiler";

const CSP = `default-src 'self'; img-src https: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src https:; connect-src 'none';`;

function renderNav(navItems: Array<{ label: string; pageId?: string | null; externalUrl?: string | null; navLocation?: string | null }>, org: { slug?: string | null; name?: string | null }): string {
  const headerItems = navItems.filter(n => n.navLocation === "header" || n.navLocation === "both");

  const links = headerItems.map(item => {
    const href = item.externalUrl ?? (item.pageId ? `#${item.pageId}` : "#");
    return `<a href="${href}" style="color:rgba(255,255,255,0.85);text-decoration:none;font-weight:500;font-size:0.9rem;">${item.label}</a>`;
  }).join("\n");

  const orgName = org.name ?? "Organization";

  return `<nav id="site-nav" style="position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(10,10,20,0.92);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,0.08);">
  <div style="max-width:1200px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:64px;">
    <div style="font-weight:700;color:#fff;font-size:1rem;">${orgName}</div>
    <div style="display:flex;gap:28px;align-items:center;">${links}</div>
  </div>
</nav>`;
}

function renderFooter(navItems: Array<{ label: string; pageId?: string | null; externalUrl?: string | null; navLocation?: string | null }>, org: { name?: string | null; contactEmail?: string | null; contactPhone?: string | null; contactAddress?: string | null }): string {
  const headerItems = navItems.filter(n => n.navLocation === "header" || n.navLocation === "both");
  const year = new Date().getFullYear();

  const quickLinks = headerItems.slice(0, 5).map(item => {
    const href = item.externalUrl ?? (item.pageId ? `#${item.pageId}` : "#");
    return `<a href="${href}" style="color:rgba(255,255,255,0.65);text-decoration:none;font-size:0.875rem;line-height:1.9;transition:color 0.15s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.65)'">${item.label}</a>`;
  }).join("");

  return `<footer style="background:#060912;border-top:1px solid rgba(255,255,255,0.08);padding:60px 0 0;">
  <div style="max-width:1200px;margin:0 auto;padding:0 24px;">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:40px;margin-bottom:48px;">
      <!-- Org info -->
      <div>
        <h3 style="color:#fff;font-size:1.05rem;font-weight:700;margin-bottom:14px;">${org.name ?? ""}</h3>
        ${org.contactAddress ? `<p style="color:rgba(255,255,255,0.6);font-size:0.85rem;line-height:1.7;margin-bottom:8px;">${org.contactAddress}</p>` : ""}
        ${org.contactPhone ? `<p style="margin-bottom:6px;"><a href="tel:${org.contactPhone}" style="color:rgba(255,255,255,0.6);text-decoration:none;font-size:0.85rem;">${org.contactPhone}</a></p>` : ""}
        ${org.contactEmail ? `<p><a href="mailto:${org.contactEmail}" style="color:rgba(255,255,255,0.6);text-decoration:none;font-size:0.85rem;">${org.contactEmail}</a></p>` : ""}
      </div>
      <!-- Quick links -->
      <div>
        <h3 style="color:#fff;font-size:1.05rem;font-weight:700;margin-bottom:14px;">Quick Links</h3>
        <nav style="display:flex;flex-direction:column;">${quickLinks || '<span style="color:rgba(255,255,255,0.4);font-size:0.85rem;">—</span>'}</nav>
      </div>
      <!-- Powered by -->
      <div>
        <h3 style="color:#fff;font-size:1.05rem;font-weight:700;margin-bottom:14px;">Platform</h3>
        <p style="color:rgba(255,255,255,0.6);font-size:0.85rem;line-height:1.7;">Powered by <a href="https://mypillar.co" style="color:rgba(255,255,255,0.85);text-decoration:underline;">Pillar</a> — the civic organization platform that runs on autopilot.</p>
      </div>
    </div>
    <div style="border-top:1px solid rgba(255,255,255,0.1);padding:20px 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <span style="color:rgba(255,255,255,0.35);font-size:0.78rem;">&copy; ${year} ${org.name ?? ""}. All rights reserved.</span>
      <a href="https://mypillar.co" style="color:rgba(255,255,255,0.35);font-size:0.78rem;text-decoration:none;">Powered by Pillar</a>
    </div>
  </div>
</footer>`;
}

function wrapHtml(
  inner: string,
  nav: string,
  footer: string,
  theme: SiteTheme,
  org: { name?: string | null; slug?: string | null },
): string {
  const presetKey = theme.themePresetKey ?? "pillar-default";
  const fontHeading = theme.fontHeadingKey ?? "DM Serif Display";
  const fontBody = theme.fontBodyKey ?? "DM Sans";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <title>${org.name ?? "Pillar Site"}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      font-family: '${fontBody}', system-ui, sans-serif;
      color: ${theme.colorText ?? "#111827"};
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
      line-height: 1.6;
    }
    img { max-width: 100%; display: block; }
    a { color: inherit; text-decoration: none; }
    :root {
      --color-primary: ${theme.colorPrimary ?? "#1e3a5f"};
      --color-secondary: ${theme.colorSecondary ?? "#2d5080"};
      --color-accent: ${theme.colorAccent ?? "#f59e0b"};
      --color-surface: ${theme.colorSurface ?? "#f8fafc"};
      --color-text: ${theme.colorText ?? "#111827"};
      --font-heading: '${fontHeading}', serif;
      --font-body: '${fontBody}', sans-serif;
      --radius: ${theme.radiusScale ?? "14px"};
    }
  </style>
</head>
<body>
${nav}
<main style="padding-top: 64px;">
${inner}
</main>
${footer}
<script>
  window.addEventListener('scroll', function() {
    const nav = document.getElementById('site-nav');
    if (nav) nav.style.boxShadow = window.scrollY > 20 ? '0 2px 20px rgba(0,0,0,0.3)' : 'none';
  });
</script>
</body>
</html>`;
}

export async function compileSite(
  orgId: string,
  siteId: string,
  mode: CompileMode,
): Promise<string> {
  await logInfo(SERVICE, "compileSite", `Starting ${mode} for site ${siteId}`, { siteId, mode }, orgId, siteId);

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

    if (!site) throw new Error(`Site not found or access denied: ${siteId}`);
    if (site.orgId !== orgId) throw new Error(`Org isolation violation: site ${siteId} does not belong to org ${orgId}`);

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

    const pages = await db
      .select()
      .from(sitePagesTable)
      .where(and(
        eq(sitePagesTable.siteId, siteId),
        eq(sitePagesTable.orgId, orgId),
        isNull(sitePagesTable.deletedAt),
        eq(sitePagesTable.isPublished, true),
      ))
      .orderBy(sitePagesTable.sortOrder);

    const allBlocks = await db
      .select()
      .from(siteBlocksTable)
      .where(and(
        eq(siteBlocksTable.siteId, siteId),
        eq(siteBlocksTable.orgId, orgId),
        isNull(siteBlocksTable.deletedAt),
        eq(siteBlocksTable.isVisible, true),
      ))
      .orderBy(siteBlocksTable.sortOrder);

    const navItems = await db
      .select()
      .from(siteNavItemsTable)
      .where(and(
        eq(siteNavItemsTable.siteId, siteId),
        eq(siteNavItemsTable.orgId, orgId),
        isNull(siteNavItemsTable.deletedAt),
        eq(siteNavItemsTable.isVisible, true),
      ))
      .orderBy(siteNavItemsTable.sortOrder);

    const bindings = await db
      .select()
      .from(siteBlockBindingsTable)
      .where(and(
        eq(siteBlockBindingsTable.siteId, siteId),
        eq(siteBlockBindingsTable.orgId, orgId),
      ));

    const siteDataMap = await getSiteData(orgId, siteId, bindings);

    const renderCache = new Map<string, string>();

    if (mode !== "full_compile") {
      const cacheRows = await db
        .select()
        .from(siteRenderCacheTable)
        .where(and(
          eq(siteRenderCacheTable.siteId, siteId),
          eq(siteRenderCacheTable.orgId, orgId),
        ));

      for (const row of cacheRows) {
        renderCache.set(`${row.blockId}:${row.dataHash}`, row.renderedHtml);
      }
    }

    // Look up org contact info for the footer
    const [orgRow] = await db
      .select({
        senderEmail: organizationsTable.senderEmail,
        slug: organizationsTable.slug,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);

    // Pull contact info from the contact block's contentJson if present
    const contactBlock = allBlocks.find(b => b.blockType === "contact");
    const contactContent = (contactBlock?.contentJson ?? {}) as Record<string, unknown>;

    const org: { name?: string | null; contactEmail?: string | null; contactPhone?: string | null; contactAddress?: string | null; slug?: string | null } = {
      name: site.name,
      contactEmail: (contactContent.email as string) || orgRow?.senderEmail || "",
      contactPhone: (contactContent.phone as string) || "",
      contactAddress: (contactContent.address as string) || "",
      slug: site.slug ?? orgRow?.slug,
    };

    const nav = renderNav(navItems, org);

    let pagesSections = "";

    for (const page of pages) {
      const pageBlocks = allBlocks.filter(b => b.pageId === page.id);

      let pageHtml = "";
      if (!page.isHomepage || pages.length > 1) {
        pageHtml += `<section id="${page.slug}" style="scroll-margin-top:64px;">`;
      }

      for (const block of pageBlocks) {
        const liveData = siteDataMap[block.id];

        let blockHtml: string;

        if (mode !== "full_compile") {
          const dataHash = computeDataHash([block.contentJson, block.variantKey, block.settingsJson, liveData ?? null]);
          const cacheKey = `${block.id}:${dataHash}`;
          const cached = renderCache.get(cacheKey);

          if (cached) {
            blockHtml = cached;
          } else {
            blockHtml = renderBlock(block as SiteBlock, effectiveTheme, liveData);
            await upsertRenderCache(orgId, siteId, block.id, blockHtml, dataHash);
          }
        } else {
          blockHtml = renderBlock(block as SiteBlock, effectiveTheme, liveData);
          const dataHash = computeDataHash([block.contentJson, block.variantKey, block.settingsJson, liveData ?? null]);
          await upsertRenderCache(orgId, siteId, block.id, blockHtml, dataHash);
        }

        pageHtml += blockHtml;
      }

      if (!page.isHomepage || pages.length > 1) {
        pageHtml += `</section>`;
      }

      pagesSections += pageHtml;
    }

    const footer = renderFooter(navItems, org);
    const compiledHtml = wrapHtml(pagesSections, nav, footer, effectiveTheme, org);

    await db
      .update(sitesTable)
      .set({ generatedHtml: compiledHtml, compiledAt: new Date(), version: sql`${sitesTable.version} + 1` })
      .where(and(
        eq(sitesTable.id, siteId),
        eq(sitesTable.orgId, orgId),
      ));

    await logInfo(SERVICE, "compileSite", `Compile ${mode} completed for site ${siteId}`, { siteId, mode, pageCount: pages.length, blockCount: allBlocks.length }, orgId, siteId);

    return compiledHtml;
  } catch (err) {
    await logError(SERVICE, "compileSite", `Compile failed for site ${siteId}`, { siteId, mode }, err, orgId, siteId);
    throw err;
  }
}

async function upsertRenderCache(orgId: string, siteId: string, blockId: string, html: string, dataHash: string): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(siteRenderCacheTable)
      .where(and(
        eq(siteRenderCacheTable.blockId, blockId),
        eq(siteRenderCacheTable.orgId, orgId),
        eq(siteRenderCacheTable.siteId, siteId),
      ))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(siteRenderCacheTable)
        .set({ renderedHtml: html, dataHash, renderedAt: new Date() })
        .where(and(
          eq(siteRenderCacheTable.blockId, blockId),
          eq(siteRenderCacheTable.orgId, orgId),
          eq(siteRenderCacheTable.siteId, siteId),
        ));
    } else {
      await db.insert(siteRenderCacheTable).values({
        siteId,
        orgId,
        blockId,
        renderedHtml: html,
        dataHash,
        renderedAt: new Date(),
      });
    }
  } catch {
    // Cache write failures are non-fatal
  }
}
