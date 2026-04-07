import { Router, type Request, type Response } from "express";
import { db, organizationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { resolveFullOrg } from "../lib/resolveOrg";
import OpenAI from "openai";
import { load as cheerioLoad } from "cheerio";

const SIDECAR = "http://127.0.0.1:1106";

async function signStorageUrl(fullPath: string, method: "GET" | "PUT", ttlSec: number): Promise<string> {
  const normalized = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const parts = normalized.split("/");
  const bucketName = parts[1];
  const objectName = parts.slice(2).join("/");
  const resp = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`Sidecar sign failed: ${resp.status}`);
  const { signed_url } = await resp.json() as { signed_url: string };
  return signed_url;
}

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

// Wraps callAI with up to 2 automatic retries on thrown exception (transient API errors).
// Delays: 1.5 s then 3 s between attempts. Does NOT retry on empty replies —
// that is handled per-path below.
async function callAIWithRetry(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokens: number,
): Promise<string> {
  const delays = [1500, 3000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await callAI(messages, maxTokens);
    } catch (err) {
      lastErr = err;
      if (attempt < delays.length) {
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }
  }
  throw lastErr;
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

// ── Hardcoded intake helpers (form-based interview) ──────────────────────────

const ORG_TYPE_SLUG_MAP: Record<string, string> = {
  "Main Street / Downtown Association": "civic",
  "Chamber of Commerce": "chamber",
  "Rotary Club": "rotary",
  "Lions Club": "lions",
  "VFW / American Legion": "vfw",
  "Fraternal Organization": "fraternal",
  "PTA / PTO": "pta",
  "Community Foundation": "foundation",
  "Neighborhood Association": "neighborhood",
  "Arts Council": "arts",
  "Other": "community",
};

const ORG_TYPE_COLORS_MAP: Record<string, { primaryColor: string; accentColor: string }> = {
  "Main Street / Downtown Association": { primaryColor: "#c25038", accentColor: "#2b7ab5" },
  "Chamber of Commerce":               { primaryColor: "#1a4a8a", accentColor: "#d4a017" },
  "Rotary Club":                        { primaryColor: "#003DA5", accentColor: "#d4a017" },
  "Lions Club":                         { primaryColor: "#d4a017", accentColor: "#1a4a8a" },
  "VFW / American Legion":              { primaryColor: "#8b1a1a", accentColor: "#2b5797" },
  "Fraternal Organization":             { primaryColor: "#1a3a5c", accentColor: "#c5a030" },
  "PTA / PTO":                          { primaryColor: "#339966", accentColor: "#7a3d9e" },
  "Community Foundation":               { primaryColor: "#2d8a57", accentColor: "#2b7ab5" },
  "Neighborhood Association":           { primaryColor: "#c26a17", accentColor: "#338899" },
  "Arts Council":                       { primaryColor: "#7a3d9e", accentColor: "#cc3366" },
  "Other":                              { primaryColor: "#2b7ab5", accentColor: "#338899" },
};

function generateInitials(name: string): string {
  const words = name.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return name.slice(0, 3).toUpperCase();
  return words.map(w => w[0].toUpperCase()).join("").slice(0, 4);
}

const STATE_ABBREVS: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
  "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
  "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
  "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
  "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
  "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
};

function getStateAbbrev(state: string): string {
  if (!state?.trim()) return "";
  const t = state.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return STATE_ABBREVS[t] ?? t.slice(0, 2).toUpperCase();
}

const BUSINESS_FOCUSED_TYPES = new Set([
  "Main Street / Downtown Association",
  "Chamber of Commerce",
  "Neighborhood Association",
]);

const ORG_TYPE_SUBTITLE_MAP: Record<string, string> = {
  "Main Street / Downtown Association": "Downtown Association",
  "Chamber of Commerce":                "Chamber of Commerce",
  "Rotary Club":                        "Civic Organization",
  "Lions Club":                         "Civic Organization",
  "VFW / American Legion":              "Veterans Organization",
  "Fraternal Organization":             "Fraternal Organization",
  "PTA / PTO":                          "Parent-Teacher Organization",
  "Community Foundation":               "Community Foundation",
  "Neighborhood Association":           "Neighborhood Association",
  "Arts Council":                       "Arts Organization",
  "Other":                              "Community Organization",
};

function parseMeetingSchedule(text: string | null | undefined): {
  meetingDay: string | null;
  meetingTime: string | null;
  meetingLocation: string | null;
} {
  if (!text?.trim()) return { meetingDay: null, meetingTime: null, meetingLocation: null };
  const parts = text.trim().split(",").map(p => p.trim()).filter(Boolean);
  const timeRe = /\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))\b/;
  let meetingDay: string | null = null;
  let meetingTime: string | null = null;
  let meetingLocation: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(timeRe);
    if (m) {
      meetingTime = m[1].trim();
      const dayPart = parts[i].replace(/\s+at\s+.+/i, "").trim();
      if (dayPart) meetingDay = dayPart;
      if (i + 1 < parts.length) meetingLocation = parts.slice(i + 1).join(", ");
      break;
    }
  }
  if (!meetingTime && parts.length > 0) {
    meetingDay = parts[0];
    if (parts.length > 1) meetingLocation = parts.slice(1).join(", ");
  }
  return { meetingDay: meetingDay || null, meetingTime: meetingTime || null, meetingLocation: meetingLocation || null };
}

function parsePartners(text: string | null | undefined): { name: string; description: string; website: null }[] {
  if (!text?.trim()) return [];
  return text
    .split(/[;\n]/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(.+?)\s+[-—–]\s+(.+)$/);
      if (match) return { name: match[1].trim(), description: match[2].trim(), website: null };
      return { name: line, description: "Community partner", website: null };
    })
    .filter(p => p.name.length > 0);
}

function buildFallbackPayload(
  answers: Record<string, string | boolean | null | undefined>,
  tier: string | null,
): Record<string, unknown> {
  const orgType      = (answers.orgType   as string | null) ?? "Other";
  const orgName      = (answers.orgName   as string | null) ?? "";
  const tagline      = (answers.tagline   as string | null) ?? "";
  const city         = (answers.city      as string | null) ?? "";
  const state        = (answers.state     as string | null) ?? "";
  const stateAbbrev  = getStateAbbrev(state);
  const location     = stateAbbrev ? `${city}, ${stateAbbrev}` : city;
  const colors       = ORG_TYPE_COLORS_MAP[orgType] ?? { primaryColor: "#2b7ab5", accentColor: "#338899" };
  const shortName    = (answers.shortName    as string | null) || generateInitials(orgName);
  const logoInitials = (answers.logoInitials as string | null) || shortName;
  const partners     = parsePartners(answers.partners as string | null);
  const businessFocused = BUSINESS_FOCUSED_TYPES.has(orgType);
  const stat3Label   = businessFocused ? "Local Businesses" : "Active Members";
  const stat3Default = businessFocused ? "50+" : "100+";
  const homeSubtitle = ORG_TYPE_SUBTITLE_MAP[orgType] ?? "Community Organization";
  const meeting      = parseMeetingSchedule(answers.meetingSchedule as string | null);
  const contactEmail = (answers.contactEmail as string | null) ?? "";
  const eventsEmail  = (answers.eventsEmail  as string | null) ?? null;

  const boolVal = (v: unknown) => v === true || v === "Yes";

  const siteContent: Record<string, string> = {
    home_tagline:          tagline,
    home_intro:            tagline,
    home_subtitle:         homeSubtitle,
    contact_address:       (answers.contactAddress as string | null) ?? "",
    contact_phone:         (answers.contactPhone   as string | null) ?? "",
    contact_email:         contactEmail,
    meeting_contact_email: eventsEmail ?? contactEmail,
    social_facebook:       (answers.socialFacebook  as string | null) ?? "",
    social_instagram:      (answers.socialInstagram as string | null) ?? "",
    about_mission:         tagline,
    community_partners:    JSON.stringify(partners),
    logo_initials:         logoInitials,
  };

  if (tier === "tier1a") {
    siteContent.has_blog         = "true";
    siteContent.has_newsletter   = "true";
    siteContent.pillarWebhookUrl = "__PILLAR_WEBHOOK_URL__";
  } else if (tier === "tier2" || tier === "tier3") {
    siteContent.has_blog         = String(boolVal(answers.hasBlog));
    siteContent.has_newsletter   = String(boolVal(answers.hasNewsletter));
    siteContent.pillarWebhookUrl = "__PILLAR_WEBHOOK_URL__";
    siteContent.event_categories = (answers.eventCategories as string | null) ?? "Community, Fundraiser, Social";
  } else {
    siteContent.has_blog        = "false";
    siteContent.has_newsletter  = "false";
  }

  const payload: Record<string, unknown> = {
    orgName,
    shortName,
    orgType:         ORG_TYPE_SLUG_MAP[orgType] ?? "community",
    tagline,
    mission:         tagline,
    location,
    primaryColor:    colors.primaryColor,
    accentColor:     colors.accentColor,
    contactEmail:    contactEmail || null,
    contactPhone:    (answers.contactPhone   as string | null) ?? null,
    contactAddress:  (answers.contactAddress as string | null) ?? null,
    mailingAddress:  (answers.mailingAddress as string | null) ?? (answers.contactAddress as string | null) ?? null,
    website:         (answers.website        as string | null) ?? null,
    socialFacebook:  (answers.socialFacebook  as string | null) ?? null,
    socialInstagram: (answers.socialInstagram as string | null) ?? null,
    socialTwitter:   null,
    socialLinkedin:  null,
    meetingDay:      meeting.meetingDay,
    meetingTime:     meeting.meetingTime,
    meetingLocation: meeting.meetingLocation,
    logoUrl:         null,
    heroImageUrl:    null,
    footerText:      `${orgName} is a volunteer organization serving the ${location} community.`,
    metaDescription: `${orgName} — ${tagline}. Community events, programs, and more in ${location}.`,
    stats: [
      { value: answers.annualEvents        ? String(answers.annualEvents)        : "12+",        label: "Annual Events"   },
      { value: answers.annualAttendees     ? String(answers.annualAttendees)     : "500+",       label: "Annual Attendees" },
      { value: answers.membersOrBusinesses ? String(answers.membersOrBusinesses) : stat3Default, label: stat3Label },
      { value: "100%", label: "Volunteer Run" },
    ],
    partners,
    siteContent,
  };

  if (tier === "tier2" || tier === "tier3") {
    payload.events    = [];
    payload.sponsors  = [];
    payload.businesses = [];
  }

  return payload;
}

function getPayloadSpecForTier(tier: string | null): string {
  if (!tier || tier === "tier1") return STARTER_PAYLOAD_SPEC;
  if (tier === "tier1a")         return AUTOPILOT_PAYLOAD_SPEC;
  return EVENTS_PAYLOAD_SPEC;
}

// ── Starter payload shape ────────────────────────────────────────────────────
const STARTER_PAYLOAD_SPEC = `
PAYLOAD JSON — output immediately after [PAYLOAD_READY] with NO extra text before or after the JSON:
{
  "orgName": "<full name>",
  "shortName": "<abbreviation>",
  "orgType": "<civic|chamber|rotary|lions|vfw|pta|foundation|neighborhood|arts|community|fraternal>",
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
  "orgType": "<civic|chamber|rotary|lions|vfw|pta|foundation|neighborhood|arts|community|fraternal>",
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
  "orgType": "<civic|chamber|rotary|lions|vfw|pta|foundation|neighborhood|arts|community|fraternal>",
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

RULE 3 — TRACK PROGRESS. Before asking question N, scan the FULL conversation history above. If the customer already answered that question at any point (even early in the conversation), mark it done and skip it. Each numbered question is asked EXACTLY ONCE. Never repeat a question that has already been answered.

RULE 4 — HANDLE SKIP PHRASES IMMEDIATELY. Phrases like "skip", "none", "no [platform]", "Skip — no Facebook", "Skip — no Instagram", "No partners", "No regular meetings", or any variation mean: record null/empty for that field and ask the next question right away. Do NOT ask for confirmation. Do NOT return an empty response. Always respond with at least one sentence.

RULE 5 — LOGO NOTE. If the user mentions they have uploaded a logo (you may see a system note like "[Logo uploaded: filename]"), acknowledge it briefly ("Got your logo!") and move to the next question. Do NOT ask them to upload again.`;

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
      SELECT community_site_url, community_site_key, site_config FROM organizations WHERE id = ${org.id} LIMIT 1
    `);
    const r = row.rows[0] as Record<string, unknown> | undefined;
    const config = r?.site_config as Record<string, unknown> | null | undefined;

    // Return a lightweight summary for the management view
    const configSummary = config ? {
      orgName:      (config.orgName      as string | undefined) ?? null,
      location:     (config.location     as string | undefined) ?? null,
      primaryColor: (config.primaryColor as string | undefined) ?? null,
      accentColor:  (config.accentColor  as string | undefined) ?? null,
      tagline:      (config.tagline      as string | undefined) ?? null,
    } : null;

    res.json({
      url:          (r?.community_site_url as string | null) ?? null,
      hasKey:       !!(r?.community_site_key),
      tier:         (org as { tier?: string | null }).tier ?? null,
      isProvisioned: !!config,
      configSummary,
    });
  } catch {
    res.json({ url: null, hasKey: false, tier: null, isProvisioned: false, configSummary: null });
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

// ── POST /api/community-site/ai-edit ────────────────────────────────────────
// Takes a natural-language change request, applies it to the stored site_config,
// and returns the updated payload for review before re-provisioning.
router.post("/ai-edit", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { changeRequest } = req.body as { changeRequest?: string };
  if (!changeRequest?.trim()) {
    res.status(400).json({ error: "changeRequest is required" });
    return;
  }

  try {
    const row = await db.execute(sql`
      SELECT site_config FROM organizations WHERE id = ${org.id} LIMIT 1
    `);
    const r = row.rows[0] as Record<string, unknown> | undefined;
    const currentConfig = r?.site_config as Record<string, unknown> | null | undefined;

    if (!currentConfig) {
      res.status(400).json({ error: "No site configuration found. Complete the interview first." });
      return;
    }

    const prompt = `You are updating a community organization's website configuration.

Current configuration (JSON):
${JSON.stringify(currentConfig, null, 2)}

The user wants to make this change:
"${changeRequest.trim()}"

Apply the change and return the COMPLETE updated configuration as a single valid JSON object.
Keep all existing fields. Only modify what the user asked to change.
Return only the JSON object, no markdown, no explanation.`;

    const aiRaw = await Promise.race<string>([
      callAI([{ role: "user", content: prompt }], 1200),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20_000)),
    ]);

    const jsonStart = aiRaw.indexOf("{");
    const jsonEnd   = aiRaw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      res.status(500).json({ error: "AI returned an unexpected response. Please try again." });
      return;
    }

    const updatedPayload = JSON.parse(aiRaw.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;

    await db.update(organizationsTable)
      .set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` })
      .where(eq(organizationsTable.id, org.id));

    res.json({ ok: true, payload: updatedPayload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Edit failed: ${msg}` });
  }
});

// ── POST /api/community-site/logo-upload-url ────────────────────────────────
// Returns a presigned PUT URL so the frontend can upload a logo directly to GCS.
router.post("/logo-upload-url", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) {
    res.status(500).json({ error: "Object storage not configured" });
    return;
  }

  const { ext: rawExt = "png" } = req.body as { ext?: string };
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";

  try {
    const { randomUUID } = await import("crypto");
    const objectId = randomUUID();
    const fullPath = `${privateDir}/logos/${org.id}/${objectId}.${ext}`;
    const uploadUrl = await signStorageUrl(fullPath, "PUT", 900);
    const logoPath = `/objects/logos/${org.id}/${objectId}.${ext}`;
    res.json({ uploadUrl, logoPath });
  } catch (err) {
    res.status(500).json({ error: `Could not generate upload URL: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ── POST /api/community-site/crawl ───────────────────────────────────────────
// Fetches the org's existing website and extracts pre-fill data for the interview.
// Always returns 200 — errors return empty extracted object.
router.post("/crawl", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { url } = req.body as { url?: string };
  if (!url?.trim()) { res.json({ extracted: {} }); return; }

  const lower = url.toLowerCase();
  if (lower.includes("facebook.com") || lower.includes("instagram.com") ||
      lower.includes("twitter.com")  || lower.includes("linkedin.com")  ||
      lower.includes("tiktok.com")   || lower.includes("youtube.com")) {
    res.json({ extracted: {} });
    return;
  }

  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const resp = await fetch(normalized, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PillarBot/1.0; +https://mypillar.co)",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) { res.json({ extracted: {} }); return; }

    const html = await resp.text();
    const $ = cheerioLoad(html);
    const extracted: Record<string, string> = {};

    const phoneLink = $("a[href^='tel:']").first().attr("href");
    if (phoneLink) extracted.contactPhone = phoneLink.replace("tel:", "").trim();

    const emailLink = $("a[href^='mailto:']").first().attr("href");
    if (emailLink) extracted.contactEmail = emailLink.replace("mailto:", "").trim().split("?")[0];

    $("a[href]").each((_i, el) => {
      const href = $(el).attr("href") ?? "";
      if (!extracted.socialFacebook && href.includes("facebook.com") && !href.includes("sharer")) {
        extracted.socialFacebook = href;
      }
      if (!extracted.socialInstagram && href.includes("instagram.com")) {
        extracted.socialInstagram = href;
      }
    });

    res.json({ extracted });
  } catch {
    res.json({ extracted: {} });
  }
});

// ── POST /api/community-site/ack ─────────────────────────────────────────────
// Returns a brief conversational acknowledgment for a form-based interview step.
// Always returns 200 — AI is optional and wrapped in try/catch with static fallback.
router.post("/ack", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { fieldId, value, isSkip } = req.body as {
    fieldId: string;
    value: string;
    isSkip?: boolean;
  };

  const SKIP_ACKS: Record<string, string> = {
    shortName:        "I'll auto-generate initials from your org name.",
    mailingAddress:   "Got it — I'll use your physical address for mail.",
    eventsEmail:      "Got it — event inquiries will go to your main email.",
    socialFacebook:   "No problem — I'll leave Facebook out.",
    socialInstagram:  "Got it — no Instagram.",
    logoInitials:     "I'll use your short name for the logo badge.",
    partners:         "No partners to list — that's fine.",
    eventCategories:  "I'll use standard event categories.",
    meetingSchedule:  "Got it — no regular meetings.",
  };

  const ANSWER_ACKS: Record<string, (v: string) => string> = {
    orgName:             v => `Got it — "${v}"!`,
    shortName:           v => `"${v}" — perfect.`,
    tagline:             _v => `Great tagline!`,
    website:             v => `Got it — I'll note "${v}" as your existing site.`,
    city:                v => `${v} — got it.`,
    state:               v => `${v} — noted.`,
    contactAddress:      _v => `Address saved.`,
    mailingAddress:      _v => `Mailing address saved.`,
    contactPhone:        _v => `Phone number saved.`,
    contactEmail:        _v => `Email saved.`,
    eventsEmail:         _v => `Event inquiry email saved.`,
    socialFacebook:      _v => `Facebook page saved.`,
    socialInstagram:     _v => `Instagram saved.`,
    logoInitials:        v => `Logo badge: "${v}".`,
    orgType:             v => `${v} — noted.`,
    annualEvents:        v => `${v} events per year — noted.`,
    annualAttendees:     v => `${v} attendees — great.`,
    membersOrBusinesses: v => `Got it — ${v}.`,
    hasSponsors:         v => v === "Yes" ? "Sponsor options noted." : "Got it — no sponsors.",
    hasVendors:          v => v === "Yes" ? "Vendor registration noted." : "Got it — no vendors.",
    hasTicketedEvents:   v => v === "Yes" ? "Ticketed events via Stripe — noted." : "Got it — no ticketing.",
    hasBlog:             v => v === "Yes" ? "Blog section noted." : "Got it — no blog.",
    hasNewsletter:       v => v === "Yes" ? "Newsletter signup noted." : "Got it — no newsletter.",
    partners:            _v => `Community partners saved.`,
    eventCategories:     _v => `Event categories saved.`,
    meetingSchedule:     _v => `Meeting schedule saved.`,
  };

  if (isSkip) {
    res.json({ ack: SKIP_ACKS[fieldId] ?? "Got it — skipped." });
    return;
  }

  const staticAck = ANSWER_ACKS[fieldId]?.(value ?? "") ?? "Got it.";

  try {
    const aiAck = await Promise.race<string>([
      callAI([{
        role: "user",
        content: `Write a brief, warm 1-sentence acknowledgment (8 words max) for this intake form answer.
Field: ${fieldId}
Value: ${value ?? ""}
Output only the acknowledgment sentence, nothing else.`,
      }], 40),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    const trimmed = aiAck?.trim();
    if (trimmed && trimmed.length > 2 && trimmed.length < 120) {
      res.json({ ack: trimmed });
      return;
    }
  } catch { /* fall through */ }

  res.json({ ack: staticAck });
});

// ── POST /api/community-site/finalize ────────────────────────────────────────
// Builds the complete site payload from collected form answers.
//
// Strategy:
//   1. Always build a complete base payload synchronously (zero latency).
//   2. Try AI enrichment for narrative fields only (mission, footerText, etc.)
//      with a hard 15-second timeout. If it times out or fails, the base
//      payload is returned immediately — the interview never hangs.
router.post("/finalize", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { answers } = req.body as {
    answers: Record<string, string | boolean | null | undefined>;
  };
  if (!answers || typeof answers !== "object") {
    res.status(400).json({ error: "answers is required" });
    return;
  }

  const tier = (org as { tier?: string | null }).tier ?? null;

  // Step 1: build the complete base payload synchronously (always works).
  const base = buildFallbackPayload(answers, tier);

  // Step 2: ask AI to fill in ONLY the narrative text fields.
  // Keep the prompt small (< 600 tokens) and cap output at 400 tokens.
  const orgName  = (answers.orgName  as string | null) ?? "";
  const orgType  = (answers.orgType  as string | null) ?? "Civic Organization";
  const tagline  = (answers.tagline  as string | null) ?? "";
  const shortName = (base.shortName as string) ?? "";

  const narrativePrompt = `Org: ${orgName} (${orgType})
Tagline: ${tagline}
Short name: ${shortName}

Write these four fields as a valid JSON object (no markdown, no extra keys):
{
  "mission": "<1-2 sentences expanding the tagline into a mission statement>",
  "footerText": "<10-word footer description of the org>",
  "metaDescription": "<25-word SEO description>",
  "about_mission": "<2 short paragraphs describing the org mission and history>"
}`;

  try {
    const aiRaw = await Promise.race<string>([
      callAI([{ role: "user", content: narrativePrompt }], 400),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15_000)),
    ]);

    const jsonStart = aiRaw.indexOf("{");
    const jsonEnd   = aiRaw.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const narrative = JSON.parse(aiRaw.slice(jsonStart, jsonEnd + 1)) as {
        mission?: string;
        footerText?: string;
        metaDescription?: string;
        about_mission?: string;
      };
      if (narrative.mission)        base.mission       = narrative.mission;
      if (narrative.footerText)     base.footerText    = narrative.footerText;
      if (narrative.metaDescription) base.metaDescription = narrative.metaDescription;
      if (narrative.about_mission && base.siteContent) {
        (base.siteContent as Record<string, string>).about_mission = narrative.about_mission;
      }

      await db.update(organizationsTable)
        .set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` })
        .where(eq(organizationsTable.id, org.id));
    }
  } catch {
    // AI enrichment failed or timed out — proceed with the base payload.
  }

  const reply = `I have everything I need! Click Launch Site to go live.\n[PAYLOAD_READY]\n${JSON.stringify(base)}`;
  res.json({ reply });
});

// ── POST /api/community-site/interview ──────────────────────────────────────
router.post("/interview", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { message, history = [], prefilled, isSkip: clientIsSkip } = req.body as {
    message: string;
    history: { role: string; content: string }[];
    prefilled?: Record<string, string>;
    isSkip?: boolean;
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

  // Server-side skip detection as a fallback (catches typed "skip", "none", etc.)
  const SKIP_PATTERNS_SERVER = [
    /^skip\b/i,
    /^none$/i,
    /^n\/a$/i,
    /^no[,.]?\s*$/i,
    /^no\s+(abbreviation|badge|initials|logo|facebook|instagram|fb|ig|twitter|linkedin|youtube|tiktok|partners?|meetings?|sponsors?|vendors?|events?|email)\b/i,
    /^(skip|no)\s*[-—]\s*(no\s+)?(facebook|instagram|fb|ig|twitter|linkedin|youtube|tiktok|partners?|meetings?|sponsors?|vendors?|events?)\s*$/i,
    /^no (regular meetings|partners to list)\s*$/i,
  ];
  const isSkip = clientIsSkip === true || SKIP_PATTERNS_SERVER.some(p => p.test(message.trim()));

  // ── SKIP PATH — never send the skip text to the AI ──────────────────────────
  // Instead we inject a synthetic ack + ask the AI only to produce the next question.
  // This is guaranteed to return a non-empty response because the AI only has to ask
  // one question — it never has to "process" or "understand" the skip input.
  if (isSkip) {
    const alreadyEmittedPayloadSkip = trimmedHistory.some(
      m => m.role === "assistant" && m.content.includes("[PAYLOAD_READY]"),
    );
    const skipMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...trimmedHistory.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      // Synthetic skip — the AI sees a clean "user declined" signal, not the button label
      { role: "user", content: "[OPTIONAL FIELD — user skipped]" },
      { role: "assistant", content: "No problem — I'll leave that blank." },
      // Ask for the next question only; this cannot produce an empty response
      { role: "user", content: "Please continue with the next unanswered question." },
    ];
    try {
      const skipMaxTokens = alreadyEmittedPayloadSkip ? MAX_PAYLOAD_TOKENS : MAX_INTERVIEW_TOKENS;
      const skipReply = await callAIWithRetry(skipMessages, skipMaxTokens);
      if (!skipReply || skipReply.trim().length < 2) {
        res.status(500).json({ error: "Something went wrong — please try again" });
        return;
      }
      await db.update(organizationsTable)
        .set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` })
        .where(eq(organizationsTable.id, org.id));
      res.json({ reply: skipReply });
      return;
    } catch (skipErr) {
      console.error("[interview skip-path error]", skipErr);
      res.status(500).json({ error: "Something went wrong — please try again" });
      return;
    }
  }

  // ── NORMAL PATH ──────────────────────────────────────────────────────────────
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

    let reply = await callAIWithRetry(messages, maxTokens);

    if (!reply || reply.trim().length < 2) {
      const retryMessages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: systemPrompt +
            "\n\nCRITICAL: Your previous response was empty or too short. " +
            "You MUST respond with at least one full sentence and ask the next unanswered question.",
        },
        ...messages.slice(1),
      ];
      reply = await callAI(retryMessages, maxTokens);
    }

    if (!reply || reply.trim().length < 2) {
      res.status(500).json({ error: "Something went wrong — please try again" });
      return;
    }

    await db.update(organizationsTable)
      .set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` })
      .where(eq(organizationsTable.id, org.id));

    res.json({ reply, tier });
  } catch (normalErr) {
    console.error("[interview normal-path error]", normalErr);
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
      SELECT community_site_url, community_site_key, slug FROM organizations WHERE id = ${org.id} LIMIT 1
    `);
    const r = row.rows[0] as Record<string, string | null> | undefined;
    const siteUrl = r?.community_site_url;
    const siteKey = r?.community_site_key;
    const orgSlug = r?.slug ?? (org as { slug?: string | null }).slug;

    // Determine if this is a mypillar.co publish (no external URL, or already mypillar.co)
    const isMypillar = !siteUrl || siteUrl.includes(".mypillar.co");
    const mypillarUrl = orgSlug
      ? `https://${orgSlug}.mypillar.co`
      : `https://pillar-${org.id.slice(0, 8)}.mypillar.co`;

    // Replace the __PILLAR_WEBHOOK_URL__ placeholder with the real Pillar hooks endpoint
    const pillarWebhookUrl = orgSlug
      ? `${req.protocol}://${req.get("host")}/api/hooks/${orgSlug}`
      : null;

    let finalPayload = injectWebhookUrl(payload, pillarWebhookUrl);

    // Resolve logoPath → signed download URL (valid 24 h)
    const logoPath = payload.logoPath as string | undefined;
    if (logoPath && process.env.PRIVATE_OBJECT_DIR) {
      try {
        const entityId = logoPath.replace(/^\/objects\//, "");
        const fullPath = `${process.env.PRIVATE_OBJECT_DIR}/${entityId}`;
        const logoUrl = await signStorageUrl(fullPath, "GET", 86400);
        const { logoPath: _drop, ...rest } = finalPayload as Record<string, unknown>;
        void _drop;
        finalPayload = { ...rest, logoUrl };
      } catch {
        // Non-fatal — proceed without logoUrl
      }
    }

    // isNewSite = true when the org didn't have a URL before this provision call
    const isNewSite = !siteUrl;

    // ── mypillar.co publish: save config to DB + push to shared community platform ─
    if (isMypillar) {
      await db.execute(sql`
        UPDATE organizations
        SET site_config = ${JSON.stringify(finalPayload)}::jsonb,
            community_site_url = ${mypillarUrl}
        WHERE id = ${org.id}
      `);

      // Push to shared community platform so it can serve {slug}.mypillar.co
      const cpBaseUrl = process.env.COMMUNITY_PLATFORM_URL || "http://localhost:5001";
      const cpKey = process.env.PILLAR_SERVICE_KEY;
      if (cpKey && orgSlug) {
        try {
          const cpEndpoint = `${cpBaseUrl.replace(/\/$/, "")}/api/pillar/setup`;
          await fetch(cpEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-pillar-service-key": cpKey,
            },
            body: JSON.stringify({ ...finalPayload, orgId: orgSlug }),
            signal: AbortSignal.timeout(15_000),
          });
        } catch (cpErr) {
          // Non-fatal — site_config is saved, CP will get it on next retry
          console.warn("[provision] Community platform push failed (non-fatal):", cpErr);
        }
      }

      res.json({ ok: true, siteUrl: mypillarUrl, isNewSite });
      return;
    }

    // ── External site: forward payload to the site's setup endpoint ────────────
    if (!siteKey) {
      res.status(400).json({ error: "No service key configured for this site." });
      return;
    }

    const endpoint = `${siteUrl!.replace(/\/$/, "")}/api/pillar/setup`;

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pillar-Key": siteKey,
        "x-pillar-service-key": siteKey,
      },
      body: JSON.stringify({ ...finalPayload, orgId: orgSlug }),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await upstream.json() as Record<string, unknown>;

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: (data.error as string) ?? "Provision failed" });
      return;
    }

    // Save config to DB for external sites too (used by management view)
    await db.execute(sql`
      UPDATE organizations
      SET site_config = ${JSON.stringify(finalPayload)}::jsonb
      WHERE id = ${org.id}
    `);

    res.json({ ok: true, result: data, siteUrl, isNewSite });
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
