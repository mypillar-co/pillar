import { eq, and } from "drizzle-orm";
import dns from "node:dns";
import net from "node:net";
import { db } from "@workspace/db";
import { siteImportRunsTable } from "@workspace/db";
import { siteImportFindingsTable } from "@workspace/db";
import { logInfo, logError } from "./siteLogService.js";
import { filterImportNoise } from "../utils/filterImportNoise.js";
import { extractStructuredSignals } from "../utils/extractStructuredSignals.js";
import { classifyPage } from "../utils/classifyPage.js";
import { rankImages } from "../utils/rankImages.js";
import type { ImportFinding, ImportRunSummary } from "../types/import-types.js";

const SERVICE = "siteImportService";

const BRAND_DENYLIST = new Set([
  "facebook.com", "twitter.com", "instagram.com", "tiktok.com",
  "linkedin.com", "youtube.com", "google.com", "apple.com",
  "amazonaws.com", "cloudflare.com",
]);

function isPrivateIp(ip: string): boolean {
  if (!net.isIP(ip)) return false;

  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 0) return true;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
  }

  return false;
}

function isBrandDenied(hostname: string): boolean {
  const bare = hostname.replace(/^www\./, "");
  return BRAND_DENYLIST.has(bare);
}

async function assertHostAllowed(hostname: string): Promise<void> {
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    net.isIP(hostname)
  ) {
    if (hostname === "localhost" || hostname === "0.0.0.0" || isPrivateIp(hostname)) {
      throw new Error(`URL not permitted for import: ${hostname} is a private address`);
    }
  }

  if (isBrandDenied(hostname)) {
    throw new Error(`URL not permitted for import: ${hostname} is on the denylist`);
  }

  const resolved = await dns.promises.lookup(hostname, { family: 4 }).catch(() =>
    dns.promises.lookup(hostname, { family: 6 }).catch(() => null),
  );

  if (resolved && isPrivateIp(resolved.address)) {
    throw new Error(`URL not permitted for import: ${hostname} resolves to private address ${resolved.address}`);
  }
}

async function fetchPageText(url: string): Promise<{ text: string; finalUrl: string; status: number }> {
  const parsed = new URL(url);
  await assertHostAllowed(parsed.hostname);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Pillar Site Scout/1.0 (platform; for site import)",
        "Accept": "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timeoutId);

    const finalParsed = new URL(response.url);
    await assertHostAllowed(finalParsed.hostname);

    const text = await response.text();
    return { text, finalUrl: response.url, status: response.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Fetch failed for ${url}: ${message}`);
  }
}

function extractTextFromHtml(html: string): string {
  const scriptStyleRemoved = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "");

  const textOnly = scriptStyleRemoved
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return textOnly;
}

function extractImageUrls(html: string, baseUrl: string): string[] {
  const imageUrls: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(html)) !== null) {
    try {
      const src = match[1];
      const absoluteUrl = new URL(src, baseUrl).href;
      if (absoluteUrl.startsWith("http")) {
        imageUrls.push(absoluteUrl);
      }
    } catch {
      // skip invalid URLs
    }
  }

  return imageUrls;
}

function extractMetaTags(html: string): {
  title?: string;
  description?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
} {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);

  return {
    title: ogTitleMatch?.[1] ?? titleMatch?.[1],
    description: ogDescMatch?.[1] ?? descMatch?.[1],
    ogImage: ogImageMatch?.[1],
    ogTitle: ogTitleMatch?.[1] ?? titleMatch?.[1],
    ogDescription: ogDescMatch?.[1] ?? descMatch?.[1],
  };
}

/**
 * Extract the most relevant mission/about paragraph from page text.
 * Strategy: find paragraphs near mission-indicating keywords, prefer 1-4 sentence blocks.
 */
function extractMissionParagraph(text: string): string {
  const MISSION_KEYWORDS = ["our mission", "mission is", "dedicated to", "committed to", "our purpose", "we exist to", "founded to", "we believe", "we work to", "we are dedicated", "we are committed"];

  // Split into candidate paragraphs (chunks separated by 2+ spaces or sentence-like breaks)
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];

  // Find the index of the first sentence containing a mission keyword
  let bestStart = -1;
  for (let i = 0; i < sentences.length; i++) {
    const sl = sentences[i].toLowerCase();
    if (MISSION_KEYWORDS.some(k => sl.includes(k))) {
      bestStart = i;
      break;
    }
  }

  // If found, take up to 3 sentences starting there
  if (bestStart >= 0) {
    const chunk = sentences.slice(bestStart, bestStart + 3).join(" ").trim();
    if (chunk.length >= 40 && chunk.length <= 600) return chunk;
    if (chunk.length > 600) return chunk.slice(0, 600);
  }

  // Fallback: find the longest sentence containing any keyword
  let bestSentence = "";
  for (const s of sentences) {
    const sl = s.toLowerCase();
    if (MISSION_KEYWORDS.some(k => sl.includes(k)) && s.length > bestSentence.length) {
      bestSentence = s.trim();
    }
  }
  if (bestSentence.length >= 40) return bestSentence.slice(0, 600);

  // Last resort: first 400 chars of text (skipping anything that looks like nav/header)
  const cleanFirst = text.replace(/^[\s\S]{0,200}?(About|Mission|Welcome|Home)\s+/i, "").trim();
  return cleanFirst.slice(0, 400);
}

export async function run(
  orgId: string,
  url: string,
  siteId?: string,
): Promise<ImportRunSummary> {
  await logInfo(SERVICE, "run", `Import started for ${url}`, { orgId, url, siteId }, orgId, siteId);

  await assertHostAllowed(new URL(url).hostname);

  const [importRun] = await db.insert(siteImportRunsTable).values({
    orgId,
    siteId,
    sourceUrl: url,
    status: "running",
  }).returning({ id: siteImportRunsTable.id });

  const importRunId = importRun.id;

  try {
    const { text: html, finalUrl, status } = await fetchPageText(url);

    if (status >= 400) {
      throw new Error(`HTTP ${status} for ${url}`);
    }

    const meta = extractMetaTags(html);
    const rawText = extractTextFromHtml(html);
    const cleanedText = filterImportNoise(rawText);
    const imageUrls = extractImageUrls(html, finalUrl);

    const pageSlug = new URL(finalUrl).pathname;
    const pageClass = classifyPage(pageSlug, meta.title ?? "");
    const signals = extractStructuredSignals(cleanedText, pageClass);

    const rankedImages = rankImages(imageUrls, meta.ogImage);

    const heroImage = rankedImages.find(img => img.role === "hero");

    const findings: ImportFinding[] = [];

    if (signals.hasMission && cleanedText.length > 100) {
      const missionText = extractMissionParagraph(cleanedText);
      findings.push({
        findingType: "mission",
        sourceUrl: finalUrl,
        pageClassification: pageClass,
        title: meta.title ?? "Mission Statement",
        contentJson: {
          text: missionText,
          email: signals.extractedEmail,
          phone: signals.extractedPhone,
          address: signals.extractedAddress,
        },
        qualityScore: signals.hasMission ? 85 : 50,
        preserveVerbatim: true,
        isSelected: true,
      });
    }

    if (signals.hasContactInfo) {
      findings.push({
        findingType: "contact",
        sourceUrl: finalUrl,
        pageClassification: pageClass,
        title: "Contact Information",
        contentJson: {
          email: signals.extractedEmail,
          phone: signals.extractedPhone,
          address: signals.extractedAddress,
        },
        qualityScore: 90,
        preserveVerbatim: true,
        isSelected: true,
      });
    }

    if (heroImage) {
      findings.push({
        findingType: "hero_image",
        sourceUrl: finalUrl,
        pageClassification: pageClass,
        title: "Hero Image",
        contentJson: { url: heroImage.url, role: heroImage.role },
        qualityScore: 80,
        preserveVerbatim: true,
        isSelected: true,
      });
    }

    for (const program of signals.programNames) {
      findings.push({
        findingType: "program",
        sourceUrl: finalUrl,
        pageClassification: pageClass,
        title: program,
        contentJson: { name: program },
        qualityScore: 70,
        preserveVerbatim: false,
        isSelected: true,
      });
    }

    if (findings.length > 0) {
      await db.insert(siteImportFindingsTable).values(
        findings.map(f => ({
          importRunId,
          findingType: f.findingType,
          sourceUrl: f.sourceUrl,
          pageClassification: f.pageClassification,
          title: f.title,
          contentJson: f.contentJson,
          qualityScore: f.qualityScore,
          preserveVerbatim: f.preserveVerbatim,
          isSelected: f.isSelected,
        }))
      );
    }

    await db.update(siteImportRunsTable).set({
      status: "done",
      completedAt: new Date(),
      detectedSiteType: pageClass,
    }).where(eq(siteImportRunsTable.id, importRunId));

    await logInfo(SERVICE, "run", `Import completed for ${url}`, { importRunId, findingCount: findings.length }, orgId, siteId);

    return {
      importRunId,
      status: "done",
      sourceUrl: url,
      detectedSiteType: pageClass,
      findings,
      rankedImages,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    await db.update(siteImportRunsTable).set({
      status: "error",
      completedAt: new Date(),
    }).where(eq(siteImportRunsTable.id, importRunId));

    await logError(SERVICE, "run", `Import failed for ${url}`, { importRunId, url }, err, orgId, siteId);

    throw err;
  }
}

export async function getImportFindings(orgId: string, importRunId: string): Promise<ImportFinding[]> {
  const run = await db.select().from(siteImportRunsTable).where(and(eq(siteImportRunsTable.id, importRunId), eq(siteImportRunsTable.orgId, orgId))).limit(1);
  if (!run[0]) throw new Error(`Import run not found or access denied: ${importRunId}`);

  const rows = await db
    .select()
    .from(siteImportFindingsTable)
    .where(eq(siteImportFindingsTable.importRunId, importRunId));

  return rows.map(r => ({
    findingType: r.findingType,
    sourceUrl: r.sourceUrl ?? undefined,
    pageClassification: r.pageClassification ?? undefined,
    title: r.title ?? undefined,
    contentJson: r.contentJson as Record<string, unknown>,
    qualityScore: r.qualityScore ?? 0,
    preserveVerbatim: r.preserveVerbatim ?? false,
    isSelected: r.isSelected ?? false,
  }));
}
