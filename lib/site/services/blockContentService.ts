import type { SiteProfile } from "../types/site-profile.js";
import type { PagePlan } from "../types/page-plan.js";
import type { BlockContentResult, BlockContentMap } from "../types/site-bindings.js";
import { logError } from "./siteLogService.js";

const SERVICE = "blockContentService";

export interface ImportBlockData {
  heroImageUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  missionText?: string;
}

/**
 * Exact field schemas for each block type.
 * These are included in the AI prompt so the AI produces the right keys.
 */
const BLOCK_FIELD_SCHEMAS: Record<string, string> = {
  hero: `{
    "headline": "Organization name or event-type tagline (max 8 words)",
    "subheadline": "1-sentence mission or value proposition",
    "ctaText": "Primary CTA button label (e.g. 'See Our Events', 'Join Us', 'Learn More')",
    "ctaUrl": "#events | #contact | #membership | /events",
    "imageUrl": "URL of hero background image (use importHeroImageUrl if provided, else omit)"
  }`,
  about: `{
    "heading": "About Us | Our Story | Who We Are",
    "body": "2-3 sentences describing the organization, its purpose, and who it serves. Use mission verbatim if preserveVerbatim=true.",
    "imageUrl": "Optional image URL"
  }`,
  cards: `{
    "heading": "Section heading (e.g. 'What We Do', 'Our Programs', 'Member Benefits')",
    "cards": [
      { "title": "Card title", "description": "1-2 sentences", "icon": "single emoji (🎉 📚 🤝 etc)" }
    ]
  }`,
  cta_band: `{
    "heading": "Action-oriented heading (e.g. 'Ready to Join?', 'Register for Our Next Event')",
    "subheading": "1 sentence reinforcing the value",
    "ctaText": "Button label (e.g. 'Register Now', 'Become a Member', 'Get in Touch')",
    "ctaUrl": "#contact | #membership | /events | /register"
  }`,
  contact: `{
    "heading": "Contact Us | Get In Touch | Find Us",
    "email": "contact email address (use importContactEmail if provided)",
    "phone": "phone number (use importContactPhone if provided)",
    "address": "physical address (use importContactAddress if provided)",
    "hours": "Operating hours if known"
  }`,
  membership: `{
    "heading": "Join Our Community | Become a Member",
    "description": "1-2 sentences about what membership means",
    "benefits": ["Benefit 1", "Benefit 2", "Benefit 3", "Benefit 4", "Benefit 5"],
    "ctaText": "Join Now | Become a Member | Sign Up",
    "ctaUrl": "#contact | /join"
  }`,
  stats: `{
    "stats": [
      { "value": "150+", "label": "Members" },
      { "value": "12", "label": "Annual Events" },
      { "value": "20", "label": "Years Serving" }
    ]
  }`,
};

function getOpenAIClient(): { chat: { completions: { create: (params: unknown) => Promise<{ choices: Array<{ message: { content: string } }> }> } } } {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("Replit AI integration not configured");
  }

  const { default: OpenAI } = require("openai");
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

async function checkAndIncrementAiUsage(orgId: string): Promise<void> {
  try {
    const { db } = await import("@workspace/db");
    const { orgUsageLimitsTable } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");

    const [record] = await db
      .select()
      .from(orgUsageLimitsTable)
      .where(eq(orgUsageLimitsTable.orgId, orgId))
      .limit(1);

    const now = new Date();

    if (!record) {
      await db.insert(orgUsageLimitsTable).values({
        orgId,
        aiCallsToday: 1,
        aiCallsThisMonth: 1,
        dailyLimit: 20,
        monthlyLimit: 200,
        resetAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        monthlyResetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      });
      return;
    }

    const needsDailyReset = record.resetAt < now;
    const needsMonthlyReset = record.monthlyResetAt < now;

    if (needsDailyReset || needsMonthlyReset) {
      await db.update(orgUsageLimitsTable).set({
        aiCallsToday: needsDailyReset ? 0 : record.aiCallsToday,
        aiCallsThisMonth: needsMonthlyReset ? 0 : record.aiCallsThisMonth,
        resetAt: needsDailyReset ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : record.resetAt,
        monthlyResetAt: needsMonthlyReset ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : record.monthlyResetAt,
      }).where(eq(orgUsageLimitsTable.orgId, orgId));

      const updated = { ...record };
      if (needsDailyReset) updated.aiCallsToday = 0;
      if (needsMonthlyReset) updated.aiCallsThisMonth = 0;

      if (updated.aiCallsToday >= updated.dailyLimit) throw Object.assign(new Error("Daily AI limit reached"), { status: 429 });
      if (updated.aiCallsThisMonth >= updated.monthlyLimit) throw Object.assign(new Error("Monthly AI limit reached"), { status: 429 });
    } else {
      if (record.aiCallsToday >= record.dailyLimit) throw Object.assign(new Error("Daily AI limit reached"), { status: 429 });
      if (record.aiCallsThisMonth >= record.monthlyLimit) throw Object.assign(new Error("Monthly AI limit reached"), { status: 429 });
    }

    await db.update(orgUsageLimitsTable).set({
      aiCallsToday: sql`${orgUsageLimitsTable.aiCallsToday} + 1`,
      aiCallsThisMonth: sql`${orgUsageLimitsTable.aiCallsThisMonth} + 1`,
    }).where(eq(orgUsageLimitsTable.orgId, orgId));
  } catch (err) {
    if (err instanceof Error && (err as Error & { status?: number }).status === 429) throw err;
    console.error("[blockContentService] Usage check failed:", err);
  }
}

export interface ContentContext {
  strategy?: string;
  ctaType?: string;
}

function getStrategyInstructions(strategy: string, ctaType: string): string {
  switch (strategy) {
    case "event-driven":
      return `STRATEGY: event-driven
- Hero headline: the event series name or a punchy event tagline (e.g. "Annual Harvest Festival" not just org name)
- Hero subheadline: what makes this event unmissable — dates, experience, energy
- Cards (if present): 3 cards covering event types, the experience, or why to attend
- CTA band: urgent register/buy tickets language — "Don't miss it", "Spots are limited"
- CTA button text should be: "${ctaType === "register" ? "Register Now" : ctaType === "buy_tickets" ? "Get Tickets" : "See Events"}"`;

    case "membership-driven":
      return `STRATEGY: membership-driven
- Hero headline: the org name with a community-identity tagline (e.g. "Together We Thrive")
- Hero subheadline: the mission statement — use it verbatim if provided
- Cards (if present): 3-5 SPECIFIC member benefits (not vague — be concrete about what members actually get)
  - Good: "Monthly workshops on financial literacy", "Discounts at 20+ partner businesses", "Access to our co-working space"
  - Bad: "Community Connection", "Networking", "Resources"
- CTA band: warm invitation language — "Join our growing community", "Become part of something meaningful"
- CTA button text should be: "Join Now" or "Become a Member"`;

    case "program-driven":
      return `STRATEGY: program-driven
- Hero headline: org name + what they do (e.g. "Empowering Youth Through Sport")
- Cards: 3 specific programs with their actual names and concrete descriptions
- CTA band: action-oriented — "Explore Our Programs", "Apply Today"`;

    default:
      return `STRATEGY: balanced
- Hero headline: org name or a clear value statement
- Cards: 3 pillars of what the org does or values
- CTA: friendly and accessible`;
  }
}

export async function generateBlockContent(
  orgId: string,
  plan: PagePlan,
  profile: SiteProfile,
  importData?: ImportBlockData,
  contentContext?: ContentContext,
): Promise<BlockContentResult> {
  await checkAndIncrementAiUsage(orgId);

  const allBlocks = plan.pages.flatMap(p => p.blocks);
  // Include blocks without live-data bindings — both identity and non-identity blocks
  // need AI content. Dynamic blocks with bindingSpec get live data at render time.
  const contentBlocks = allBlocks.filter(b => !b.bindingSpec);

  if (contentBlocks.length === 0) {
    return { contentMap: {}, signals: defaultSignals() };
  }

  const blockDescriptions = contentBlocks.map(b => ({
    id: b.id,
    blockType: b.blockType,
    variantKey: b.variantKey,
    lockLevel: b.lockLevel,
    schema: BLOCK_FIELD_SCHEMAS[b.blockType] ?? "{ /* generate appropriate content */ }",
  }));

  // Build import context to inform AI of pre-existing data
  const importContext = importData ? `
Pre-existing data from imported site (USE VERBATIM where marked):
- heroImageUrl: ${importData.heroImageUrl ?? "none"}
- contactEmail: ${importData.contactEmail ?? "none"}
- contactPhone: ${importData.contactPhone ?? "none"}
- contactAddress: ${importData.contactAddress ?? "none"}
- missionText (USE VERBATIM): ${importData.missionText ? `"${importData.missionText.slice(0, 500)}"` : "none"}

CRITICAL: If missionText is provided, use it verbatim in the about block body and hero subheadline.
If heroImageUrl is provided, set it as imageUrl in the hero block.
If contact data is provided, populate the contact block fields exactly.` : "";

  const strategy = contentContext?.strategy ?? "balanced";
  const ctaType = contentContext?.ctaType ?? profile.primaryCtaType;

  const systemPrompt = `You are a professional website content writer for civic and community organizations. Generate structured JSON content for website blocks.

CONTENT SAFETY RULES (non-negotiable):
- Output ONLY valid JSON
- NEVER fabricate statistics, founding years, or membership numbers unless the org explicitly provided them
- NEVER output filler phrases like "dedicated to excellence", "serving our community with pride", "making a difference", "building a better tomorrow", "committed to serving", or any other generic platitudes
- NEVER invent programs, initiatives, or benefits the org didn't mention
- Identity blocks (about, hero) use the org's actual mission and description only
- If you lack information for a field, use "" (empty string) — do NOT guess or invent
- Never generate content for blocks with hasDynamicData=true (they get live data)
- Each block follows its exact schema — do not add or remove fields

QUALITY RULES:
- Hero headline: org name OR event-type tagline. Short, punchy, specific to this org. NO generic taglines.
- Hero: populate secondaryCtaText with a secondary action (e.g. "Learn More", "Our Mission", "Join Us") and secondaryCtaUrl with "#about". Always include both CTAs.
- Hero: if the org has a type label (e.g. "Rotary Club", "Service Organization", "Veterans Post"), populate orgTypeLabel for the badge above the headline.
- About body: use the org's actual mission text verbatim if provided. If not provided, use only org name + type + location if known. Do NOT pad with filler sentences.
- Cards: only generate if you have real, specific information about programs or benefits. Use concrete details, not vague abstractions.
  - GOOD: "Monthly dinner meetings every 2nd Tuesday", "Annual $5,000 scholarship for local students", "Chili Cook-Off fundraiser every winter"
  - BAD: "Community Connection", "Serving with Pride", "Dedicated Members"
- CTA: use action verbs specific to what the org actually offers.
- Contact: populate with any provided contact data. Leave empty string if unknown.
- Stats block: ONLY include stats the org explicitly provided. If none, skip all three stat fields entirely.

RULE: When in doubt, less is more. A sparse block with accurate content is better than a padded block with invented content.

${getStrategyInstructions(strategy, ctaType)}

${importContext}

Organization Context:
- Name: ${profile.orgName}
- Type: ${profile.orgType}
- Mission: ${profile.mission || "Not provided"}
- Tagline: ${profile.tagline || ""}
- Programs: ${profile.programs.filter(p => !p.startsWith("__kw_")).join(", ") || "Not specified"}
- Contact: ${profile.contactEmail || ""}
- Site type: ${profile.siteType}
- Layout Strategy: ${strategy}
- Primary CTA Type: ${ctaType}`;

  const userPrompt = `Generate website block content for: ${profile.orgName}

BLOCKS TO GENERATE (follow each block's exact schema):
${JSON.stringify(blockDescriptions.map(b => ({
    id: b.id,
    blockType: b.blockType,
    variantKey: b.variantKey,
    schema: b.schema,
  })), null, 2)}

REQUIRED OUTPUT FORMAT (return ONLY this JSON, no markdown):
{
  "blocks": {
    "<blockId>": { /* fields matching that block's schema exactly */ }
  }
}

For each block, output ONLY the fields listed in its schema. Skip blocks with hasDynamicData=true by returning {} for them.`;

  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const rawContent = response.choices[0]?.message?.content ?? "";
    let parsed: { blocks: BlockContentMap };

    try {
      parsed = JSON.parse(rawContent);
      if (!parsed?.blocks) parsed = { blocks: {} };
    } catch {
      parsed = { blocks: {} };
    }

    // Post-process: wire import data directly into generated content
    // This ensures import data is used even if AI forgets or produces generic output
    if (importData) {
      for (const block of contentBlocks) {
        const content = (parsed.blocks[block.id] ?? {}) as Record<string, unknown>;

        if (block.blockType === "hero") {
          // Always wire in hero image if available
          if (importData.heroImageUrl && !content.imageUrl) {
            content.imageUrl = importData.heroImageUrl;
          }
          // Always enforce mission verbatim in hero subheadline when available
          // Only override if AI produced something generic or nothing
          if (importData.missionText) {
            const existing = typeof content.subheadline === "string" ? content.subheadline : "";
            const isTooGeneric = existing.length < 30 || existing === profile.orgName;
            if (isTooGeneric) {
              content.subheadline = importData.missionText.slice(0, 180);
            }
          }
          parsed.blocks[block.id] = content;
        }

        if (block.blockType === "contact") {
          if (importData.contactEmail && !content.email) content.email = importData.contactEmail;
          if (importData.contactPhone && !content.phone) content.phone = importData.contactPhone;
          if (importData.contactAddress && !content.address) content.address = importData.contactAddress;
          if (!content.heading) content.heading = "Contact Us";
          parsed.blocks[block.id] = content;
        }

        if (block.blockType === "about" && importData.missionText) {
          const existing = typeof content.body === "string" ? content.body : "";
          // Override if AI generated something clearly shorter or more generic than the real mission
          if (!existing || existing.length < 60 || existing === `${profile.orgName} is dedicated to serving our community.`) {
            content.body = importData.missionText;
            if (!content.heading) content.heading = "About Us";
            parsed.blocks[block.id] = content;
          }
        }
      }
    }

    return {
      contentMap: parsed.blocks ?? {},
      signals: defaultSignals(),
    };
  } catch (err) {
    await logError(SERVICE, "generateBlockContent", "AI content generation failed", { orgId }, err, orgId);

    // Fallback: use import data to generate minimum viable content without AI
    const fallbackMap: BlockContentMap = {};
    for (const block of contentBlocks) {
      if (block.blockType === "hero") {
        fallbackMap[block.id] = {
          headline: profile.orgName,
          subheadline: profile.mission ? profile.mission.slice(0, 120) : profile.tagline || "",
          ctaText: profile.primaryCtaType === "register" ? "Register Now" : profile.primaryCtaType === "join" ? "Join Us" : "Learn More",
          ctaUrl: "#contact",
          imageUrl: importData?.heroImageUrl,
        };
      } else if (block.blockType === "about") {
        fallbackMap[block.id] = {
          heading: "About Us",
          body: importData?.missionText ?? profile.mission ?? `${profile.orgName} is dedicated to serving our community.`,
        };
      } else if (block.blockType === "contact") {
        fallbackMap[block.id] = {
          heading: "Contact Us",
          email: importData?.contactEmail ?? profile.contactEmail ?? "",
          phone: importData?.contactPhone ?? profile.contactPhone ?? "",
          address: importData?.contactAddress ?? profile.address ?? "",
        };
      } else if (block.blockType === "cta_band") {
        const ctaFallback = contentContext?.ctaType ?? profile.primaryCtaType;
        const ctaFallbackText = ctaFallback === "register" ? "Register Now"
          : ctaFallback === "buy_tickets" ? "Get Tickets"
          : ctaFallback === "join" ? "Join Now"
          : ctaFallback === "donate" ? "Donate"
          : "Learn More";
        const ctaFallbackUrl = ctaFallback === "register" || ctaFallback === "buy_tickets" ? "/events"
          : ctaFallback === "join" ? "#membership"
          : "#contact";
        fallbackMap[block.id] = {
          heading: ctaFallback === "join" ? `Join ${profile.orgName}` : ctaFallback === "register" ? "Register for Our Next Event" : "Get Involved",
          subheading: ctaFallback === "join"
            ? `Become a member and be part of our growing community.`
            : `Connect with ${profile.orgName} and make a difference.`,
          ctaText: ctaFallbackText,
          ctaUrl: ctaFallbackUrl,
        };
      }
    }
    return { contentMap: fallbackMap, signals: defaultSignals() };
  }
}

function defaultSignals(): BlockContentResult["signals"] {
  return {
    eventHeavy: false,
    strongMission: false,
    membershipDriven: false,
    imageRich: false,
    minimalContent: true,
  };
}
