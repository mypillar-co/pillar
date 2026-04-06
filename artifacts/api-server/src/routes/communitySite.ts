import { Router, type Request, type Response } from "express";
import { db, organizationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { resolveFullOrg } from "../lib/resolveOrg";
import OpenAI from "openai";

const router = Router();

const CONTEXT_TURNS = 12;
const MAX_INTERVIEW_TOKENS = 750;
const MAX_PAYLOAD_TOKENS = 2200;

function getOpenAIClient() {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("AI integration not configured.");
  }
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

async function callAI(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokens: number,
): Promise<string> {
  const client = getOpenAIClient();
  const response = await (client.chat.completions.create as (p: Record<string, unknown>) => Promise<OpenAI.ChatCompletion>)({
    model: "gpt-5-mini",
    max_completion_tokens: maxTokens,
    messages,
  });
  return response.choices[0]?.message?.content ?? "";
}

// ── Color palette by org type ────────────────────────────────────────────────
const COLOR_PALETTE = `
COLOR PALETTE — use exact hex values, no substitutions:
Main Street / Downtown Association → primaryColor: #c25038  accentColor: #2b7ab5
Chamber of Commerce               → primaryColor: #1a4a8a  accentColor: #d4a017
Rotary Club                       → primaryColor: #003DA5  accentColor: #d4a017
Lions Club                        → primaryColor: #d4a017  accentColor: #1a4a8a
VFW / American Legion             → primaryColor: #8b1a1a  accentColor: #2b5797
PTA / PTO                         → primaryColor: #339966  accentColor: #7a3d9e
Community Foundation              → primaryColor: #2d8a57  accentColor: #2b7ab5
Neighborhood Association          → primaryColor: #c26a17  accentColor: #338899
Arts Council                      → primaryColor: #7a3d9e  accentColor: #cc3366
Other                             → primaryColor: #2b7ab5  accentColor: #338899

If the customer mentions their own brand colors, use those instead of the defaults above.
Payment provider is ALWAYS Stripe — do not offer or mention Square.`;

const ORG_TYPE_FIELD = `What type of organization are you?
[OPTIONS: Main Street / Downtown Association | Chamber of Commerce | Rotary Club | Lions Club | VFW / American Legion | PTA / PTO | Community Foundation | Neighborhood Association | Arts Council | Other]`;

// ── Starter payload shape ────────────────────────────────────────────────────
const STARTER_PAYLOAD_SPEC = `
PAYLOAD JSON — output immediately after [PAYLOAD_READY] with NO extra text before or after the JSON:
{
  "orgName": "<full name>",
  "shortName": "<abbreviation>",
  "orgType": "<civic|chamber|rotary|lions|vfw|pta|foundation|neighborhood|arts|community>",
  "tagline": "<tagline>",
  "mission": "<expand tagline to 1-2 sentences>",
  "location": "<City, ST>",
  "primaryColor": "<hex>",
  "accentColor": "<hex>",
  "contactEmail": "<email>",
  "contactPhone": "<phone>",
  "contactAddress": "<address>",
  "mailingAddress": "<mailing address or null>",
  "website": null,
  "socialFacebook": "<url or null>",
  "socialInstagram": "<url or null>",
  "meetingDay": "<e.g. Every Tuesday or null>",
  "meetingTime": "<e.g. 7:00 PM or null>",
  "meetingLocation": "<venue or null>",
  "footerText": "<short footer description>",
  "metaDescription": "<SEO description>",
  "stats": [
    { "value": "12+", "label": "Annual Events" },
    { "value": "500+", "label": "Annual Attendees" },
    { "value": "100+", "label": "Active Members" },
    { "value": "100%", "label": "Volunteer Run" }
  ],
  "partners": [{ "name": "<name>", "description": "<description>", "website": null }],
  "siteContent": {
    "home_tagline": "<tagline>",
    "home_intro": "<mission>",
    "home_subtitle": "<org type label e.g. Civic Organization>",
    "contact_address": "<address>",
    "contact_phone": "<phone>",
    "contact_email": "<email>",
    "social_facebook": "<facebook url or empty string>",
    "social_instagram": "<instagram url or empty string>",
    "about_mission": "<2-3 paragraph mission>",
    "community_partners": "<JSON-stringified partners array>"
  }
}
NOTE: Do NOT add events, sponsors, businesses, sponsorshipLevels, or programs arrays — Starter does not include those features.
NOTE for stats: Use reasonable defaults based on org type (e.g. 12+ events, 500+ attendees, 100+ members). Adapt labels appropriately (Active Members vs Local Businesses).`;

// ── Autopilot payload shape (extends Starter) ────────────────────────────────
const AUTOPILOT_PAYLOAD_SPEC = `
PAYLOAD JSON — output immediately after [PAYLOAD_READY] with NO extra text before or after the JSON.
Same structure as Starter PLUS these additions:
- In siteContent, add: "pillarWebhookUrl": "__PILLAR_WEBHOOK_URL__"  (leave exactly as shown — Pillar fills it in)
- In siteContent, add: "has_blog": "true", "has_newsletter": "true"
- Do NOT include events, sponsors, or businesses arrays.
Full payload:
{
  "orgName": "<full name>",
  "shortName": "<abbreviation>",
  "orgType": "<civic|chamber|rotary|lions|vfw|pta|foundation|neighborhood|arts|community>",
  "tagline": "<tagline>",
  "mission": "<expand tagline to 1-2 sentences>",
  "location": "<City, ST>",
  "primaryColor": "<hex>",
  "accentColor": "<hex>",
  "contactEmail": "<email>",
  "contactPhone": "<phone>",
  "contactAddress": "<address>",
  "mailingAddress": "<mailing address or null>",
  "website": null,
  "socialFacebook": "<url or null>",
  "socialInstagram": "<url or null>",
  "meetingDay": "<e.g. Every Tuesday or null>",
  "meetingTime": "<e.g. 7:00 PM or null>",
  "meetingLocation": "<venue or null>",
  "footerText": "<short footer description>",
  "metaDescription": "<SEO description>",
  "stats": [
    { "value": "<annual_events>", "label": "Annual Events" },
    { "value": "<annual_attendees>", "label": "Annual Attendees" },
    { "value": "<members_or_businesses>", "label": "<Active Members OR Local Businesses>" },
    { "value": "100%", "label": "Volunteer Run" }
  ],
  "partners": [{ "name": "<name>", "description": "<description>", "website": null }],
  "siteContent": {
    "home_tagline": "<tagline>",
    "home_intro": "<mission>",
    "home_subtitle": "<org type label>",
    "contact_address": "<address>",
    "contact_phone": "<phone>",
    "contact_email": "<email>",
    "social_facebook": "<facebook url or empty string>",
    "social_instagram": "<instagram url or empty string>",
    "about_mission": "<2-3 paragraph mission>",
    "community_partners": "<JSON-stringified partners array>",
    "has_blog": "true",
    "has_newsletter": "true",
    "pillarWebhookUrl": "__PILLAR_WEBHOOK_URL__"
  }
}
NOTE: Do NOT add events, sponsors, businesses, sponsorshipLevels, or programs arrays — Autopilot does not include those features.`;

// ── Events/Total Ops payload shape (full) ────────────────────────────────────
const EVENTS_PAYLOAD_SPEC = `
PAYLOAD JSON — output immediately after [PAYLOAD_READY] with NO extra text before or after the JSON.
Full platform payload:
{
  "orgName": "<full name>",
  "shortName": "<abbreviation>",
  "orgType": "<civic|chamber|rotary|lions|vfw|pta|foundation|neighborhood|arts|community>",
  "tagline": "<tagline>",
  "mission": "<expand tagline to 1-2 sentences>",
  "location": "<City, ST>",
  "primaryColor": "<hex>",
  "accentColor": "<hex>",
  "contactEmail": "<email>",
  "contactPhone": "<phone>",
  "contactAddress": "<address>",
  "mailingAddress": "<mailing address or null>",
  "website": null,
  "socialFacebook": "<url or null>",
  "socialInstagram": "<url or null>",
  "meetingDay": "<e.g. Every Tuesday or null>",
  "meetingTime": "<e.g. 12:00 PM - 1:00 PM or null>",
  "meetingLocation": "<venue or null>",
  "footerText": "<short footer description>",
  "metaDescription": "<SEO description>",
  "stats": [
    { "value": "<annual_events answer>", "label": "Annual Events" },
    { "value": "<annual_attendees answer>", "label": "Annual Attendees" },
    { "value": "<local_businesses or members>", "label": "<Local Businesses OR Active Members>" },
    { "value": "100%", "label": "Volunteer Run" }
  ],
  "programs": [],
  "partners": [{ "name": "<name>", "description": "<description>", "website": null }],
  "sponsorshipLevels": [],
  "events": [
    {
      "title": "<event name>",
      "description": "<description>",
      "date": "<date string>",
      "time": "<time range>",
      "location": "<venue>",
      "category": "<category>",
      "featured": true,
      "isTicketed": <true|false>,
      "ticketPrice": "<price or null>",
      "ticketCapacity": <number or null>
    }
  ],
  "sponsors": [],
  "businesses": [],
  "siteContent": {
    "home_tagline": "<tagline>",
    "home_intro": "<mission>",
    "home_subtitle": "<org type label>",
    "contact_address": "<address>",
    "contact_phone": "<phone>",
    "contact_email": "<email>",
    "social_facebook": "<facebook url or empty string>",
    "social_instagram": "<instagram url or empty string>",
    "about_mission": "<2-3 paragraph mission>",
    "community_partners": "<JSON-stringified partners array>",
    "has_blog": "<true if they want blog, else false>",
    "has_newsletter": "<true if they want newsletter, else false>",
    "pillarWebhookUrl": "__PILLAR_WEBHOOK_URL__",
    "event_categories": "<comma-separated categories>"
  }
}
TICKETING: If has_ticketed_events = yes, mark relevant events with isTicketed: true, ticketPrice, and ticketCapacity. Always use Stripe — never mention Square.
BUSINESS DIRECTORY: If org is Main Street, Chamber, or Downtown Association, include a "businesses" array if they mentioned any local businesses.`;

// ── Build system prompt by tier ───────────────────────────────────────────────
function buildSystemPrompt(tier: string | null): string {
  const base = `You are a friendly site setup specialist for Pillar — an AI platform that configures community organization websites.

You are running the intake interview for a new organization. Ask questions ONE AT A TIME. Keep responses under 60 words. Acknowledge each answer in one brief sentence, then ask the next question.

If the user mentions they have an existing website URL at ANY point, stop and say: "Great — use the **Import from website** button to pull your content automatically."

━━━ CRITICAL RULES — apply on EVERY turn ━━━

RULE 1 — ALWAYS RESPOND. You must ALWAYS return a non-empty reply. "no", "none", "skip", blank, or any short answer is still a valid answer. Acknowledge it, apply the default below, and move to the next unanswered question. Never return silence.

RULE 2 — DEFAULT VALUES when the customer skips or says no/none/N/A:
• Short name / abbreviation → auto-generate from org name initials (e.g. "Norwin Rotary Club" → "NRC")
• Logo initials → same as short name
• Mailing address → copy physical address; say "Got it — I'll use your physical address for mailings."
• Events inquiry email → copy main contact email
• Facebook URL → null (say "No problem — I'll leave that out.")
• Instagram URL → null (say "Got it — no Instagram.")
• Community partners → empty array (that's fine)
• Event categories → ["Community", "Fundraiser", "Social"]
• Meeting schedule → null (skip cleanly)

RULE 3 — TRACK PROGRESS. Before asking question N, scan the FULL conversation history above. If the customer already answered that question at any point (even early in the conversation), mark it done and skip it. Each numbered question is asked EXACTLY ONCE. Never repeat a question that has already been answered.`;

  // Starter: tier1 or null/default
  if (!tier || tier === "tier1") {
    return `${base}

TIER: Starter — ask only the following 14 questions, in order:

BLOCK 1 — IDENTITY
1. What is the full name of your organization?
2. What is the short name or abbreviation? (e.g. "NRC", "IBPA", "VFW Post 1")
3. What is your tagline or one-sentence mission statement?
4. ${ORG_TYPE_FIELD}

BLOCK 2 — LOCATION & CONTACT
5. What city and state are you in?
6. What is your physical address?
7. Do you have a separate mailing address? (leave blank if same as physical)
8. What is your main phone number?
9. What is your main contact email?
10. What is your Facebook page URL? (optional)
11. What is your Instagram URL? (optional)

BLOCK 3 — BRANDING
12. What 2–3 letter abbreviation should appear on your logo badge? (e.g. "DI" for Discover Irwin)

BLOCK 4 — CONTENT
13. List your community partners — name and one-line description each (optional)
14. What is your regular meeting schedule, if any? (day, time, and location — skip if you don't have regular meetings)

HARD-SET (do NOT ask the customer — include these in payload automatically):
- has_sponsors = false
- has_vendors = false
- has_ticketed_events = false
- has_blog = false
- has_newsletter = false

When all 14 questions are answered, say: "I have everything I need! I'll build your website setup now." Then output:
[PAYLOAD_READY]

${STARTER_PAYLOAD_SPEC}

${COLOR_PALETTE}`;
  }

  // Autopilot: tier1a
  if (tier === "tier1a") {
    return `${base}

TIER: Autopilot — ask the following questions, in order:

BLOCK 1 — IDENTITY
1. What is the full name of your organization?
2. What is the short name or abbreviation? (e.g. "NRC", "IBPA", "VFW Post 1")
3. What is your tagline or one-sentence mission statement?
4. ${ORG_TYPE_FIELD}

BLOCK 2 — LOCATION & CONTACT
5. What city and state are you in?
6. What is your physical address?
7. Do you have a separate mailing address? (leave blank if same as physical)
8. What is your main phone number?
9. What is your main contact email?
10. What is your Facebook page URL? (optional)
11. What is your Instagram URL? (optional)

BLOCK 3 — BRANDING
12. What 2–3 letter abbreviation should appear on your logo badge?

BLOCK 4 — STATS
13. Approximately how many events do you host per year?
14. Approximately how many total attendees across all events?
15. How many local businesses or active members does your organization have?

BLOCK 5 — CONTENT
16. List your community partners — name and one-line description each (optional)
17. What is your regular meeting schedule, if any? (day, time, and location — skip if none)

HARD-SET (do NOT ask — include in payload automatically):
- has_sponsors = false
- has_vendors = false
- has_ticketed_events = false
- has_blog = TRUE (Autopilot includes News & Updates — do not ask)
- has_newsletter = TRUE (Autopilot includes newsletter signup — do not ask)

When all questions are answered, say: "I have everything I need! I'll build your setup now." Then output:
[PAYLOAD_READY]

${AUTOPILOT_PAYLOAD_SPEC}

${COLOR_PALETTE}`;
  }

  // Events (tier2) and Total Operations (tier3) — full 24 questions
  return `${base}

TIER: Events — ask all questions. Nothing is skipped. Payment provider is always Stripe (do not ask or mention Square).

BLOCK 1 — IDENTITY
1. What is the full name of your organization?
2. What is the short name or abbreviation? (e.g. "NRC", "IBPA", "VFW Post 1")
3. What is your tagline or one-sentence mission statement?
4. ${ORG_TYPE_FIELD}

BLOCK 2 — LOCATION & CONTACT
5. What city and state are you in?
6. What is your physical address?
7. Do you have a separate mailing address? (leave blank if same as physical)
8. What is your main phone number?
9. What is your main contact email?
10. Do you have a separate email for event inquiries? (optional)
11. What is your Facebook page URL? (optional)
12. What is your Instagram URL? (optional)

BLOCK 3 — BRANDING
13. What 2–3 letter abbreviation should appear on your logo badge?

BLOCK 4 — STATS
14. Approximately how many events do you host per year?
15. Approximately how many total attendees across all events?
16. How many local businesses, members, or programs does your org have?

BLOCK 5 — FEATURES
17. Do you accept event sponsors? (yes/no — if yes, ask for tier names and prices)
18. Do your events have vendor registration? (yes/no)
19. Do any events sell tickets? (yes/no — if yes, we use Stripe for checkout)
20. Do you want a News & Updates / Blog section? (yes/no)
21. Do you want email newsletter signup on your site? (yes/no)

BLOCK 6 — CONTENT
22. List your community partners — name and one-line description each (optional)
23. What categories do your events fall into? (e.g. Festival, Fundraiser, Meeting, Holiday)
24. Describe your regular meeting schedule, if any (day, time, location)

Also: If the user mentions specific upcoming events during the interview, capture them for the events array.

When all questions are answered, say: "I have everything I need! I'll build your site setup now." Then output:
[PAYLOAD_READY]

${EVENTS_PAYLOAD_SPEC}

${COLOR_PALETTE}`;
}

// ── GET /api/community-site/target ──────────────────────────────────────────
router.get("/target", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  try {
    const row = await db.execute(sql`
      SELECT community_site_url, community_site_key FROM organizations WHERE id = ${org.id} LIMIT 1
    `);
    const r = row.rows[0] as Record<string, string | null> | undefined;
    res.json({
      url: r?.community_site_url ?? null,
      hasKey: !!r?.community_site_key,
      tier: (org as { tier?: string | null }).tier ?? null,
    });
  } catch {
    res.json({ url: null, hasKey: false, tier: null });
  }
});

// ── PUT /api/community-site/target ──────────────────────────────────────────
router.put("/target", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { url, key } = req.body as { url?: string; key?: string };
  if (!url?.trim()) { res.status(400).json({ error: "url is required" }); return; }

  try {
    if (key?.trim()) {
      await db.execute(sql`
        UPDATE organizations
        SET community_site_url = ${url.trim()}, community_site_key = ${key.trim()}
        WHERE id = ${org.id}
      `);
    } else {
      await db.execute(sql`
        UPDATE organizations
        SET community_site_url = ${url.trim()}
        WHERE id = ${org.id}
      `);
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save target config" });
  }
});

// ── POST /api/community-site/interview ──────────────────────────────────────
router.post("/interview", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { message, history = [], prefilled } = req.body as {
    message: string;
    history: { role: string; content: string }[];
    prefilled?: Record<string, string>;
  };

  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  const tier = (org as { tier?: string | null }).tier ?? null;
  const trimmedHistory = history.slice(-(CONTEXT_TURNS * 2));

  let systemPrompt = buildSystemPrompt(tier);

  if (prefilled && Object.keys(prefilled).length > 0) {
    const lines = Object.entries(prefilled)
      .filter(([, v]) => v)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    systemPrompt += `\n\nPRE-FILLED FROM WEBSITE IMPORT (treat as already answered — skip these questions):\n${lines}`;
  }

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...trimmedHistory.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: message },
  ];

  try {
    const alreadyEmittedPayload = trimmedHistory.some(
      m => m.role === "assistant" && m.content.includes("[PAYLOAD_READY]"),
    );
    const maxTokens = alreadyEmittedPayload ? MAX_PAYLOAD_TOKENS : MAX_INTERVIEW_TOKENS;

    let reply = await callAI(messages, maxTokens);

    // If the model returns empty (can happen for very short inputs like "no", "skip"),
    // retry once with an explicit nudge injected into the system prompt.
    if (!reply || reply.trim().length < 5) {
      const retryMessages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: systemPrompt +
            "\n\nURGENT: Your last response was empty or too short. " +
            "You MUST reply now. Acknowledge the customer's last message, " +
            "apply the relevant default value if needed, and ask the next unanswered question.",
        },
        ...messages.slice(1),
      ];
      reply = await callAI(retryMessages, maxTokens);
    }

    if (!reply || reply.trim().length < 5) {
      res.status(500).json({ error: "Something went wrong — please try again" });
      return;
    }

    await db.update(organizationsTable)
      .set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` })
      .where(eq(organizationsTable.id, org.id));

    res.json({ reply, tier });
  } catch {
    res.status(500).json({ error: "AI service unavailable" });
  }
});

// ── POST /api/community-site/provision ──────────────────────────────────────
router.post("/provision", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { payload } = req.body as { payload: Record<string, unknown> };
  if (!payload || typeof payload !== "object") {
    res.status(400).json({ error: "payload is required" });
    return;
  }

  try {
    const row = await db.execute(sql`
      SELECT community_site_url, community_site_key FROM organizations WHERE id = ${org.id} LIMIT 1
    `);
    const r = row.rows[0] as Record<string, string | null> | undefined;
    const siteUrl = r?.community_site_url;
    const siteKey = r?.community_site_key;

    if (!siteUrl) {
      res.status(400).json({ error: "No community site URL configured. Add it using the Site Connection settings above." });
      return;
    }
    if (!siteKey) {
      res.status(400).json({ error: "No service key configured. Add the PILLAR_SERVICE_KEY in Site Connection settings." });
      return;
    }

    // Replace the __PILLAR_WEBHOOK_URL__ placeholder with the real Pillar hooks endpoint
    const orgSlug = (org as { slug?: string | null }).slug;
    const pillarWebhookUrl = orgSlug
      ? `${req.protocol}://${req.get("host")}/api/hooks/${orgSlug}`
      : null;

    const finalPayload = injectWebhookUrl(payload, pillarWebhookUrl);

    const endpoint = `${siteUrl.replace(/\/$/, "")}/api/pillar/setup`;

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pillar-Key": siteKey,
      },
      body: JSON.stringify(finalPayload),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await upstream.json() as Record<string, unknown>;

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: (data.error as string) ?? "Provision failed" });
      return;
    }

    res.json({ ok: true, result: data, siteUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Provision failed: ${msg}` });
  }
});

function injectWebhookUrl(
  payload: Record<string, unknown>,
  webhookUrl: string | null,
): Record<string, unknown> {
  if (!webhookUrl) return payload;
  const sc = payload.siteContent;
  if (!sc || typeof sc !== "object") return payload;
  const siteContent = { ...(sc as Record<string, unknown>) };
  if (siteContent.pillarWebhookUrl === "__PILLAR_WEBHOOK_URL__") {
    siteContent.pillarWebhookUrl = webhookUrl;
  }
  return { ...payload, siteContent };
}

export default router;
