import React, { useCallback, useState, useRef, useEffect } from "react";
import {
  Send, Bot, User, Loader2, AlertCircle, CheckCircle2,
  Globe, Rocket, ExternalLink, ChevronDown, ChevronUp,
  ImagePlus, X, RefreshCw, Wand2, RotateCcw, Copy, ArrowLeft, ArrowRight,
  Plus, Trash2, GripVertical, FileText, ClipboardList, Image as ImageIcon,
  Eye, Save, MoveUp, MoveDown, LayoutList, Upload, Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { useGetOrganization } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { csrfHeaders } from "@/lib/api";
import { isImageFile, uploadImage } from "@/lib/uploadImage";

function csrfFetch(input: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  return fetch(input, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(mutating ? csrfHeaders(method) : {}),
      ...init?.headers,
    },
  });
}

async function readJson<T>(res: Response): Promise<T | null> {
  if (res.status === 204 || res.status === 205 || res.status === 304) return null;
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text) as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type QuestionType = "text" | "textarea" | "select" | "boolean";
type HeroVisualType = "banner_background" | "feature_photo" | "none";

interface IntakeQuestion {
  id: string;
  text: string;
  textFn?: (answers: Record<string, string | boolean | null>) => string;
  type: QuestionType;
  optional?: boolean;
  options?: string[];
  hint?: string;
  skipLabel?: string;
  tiers?: string[];
}

interface ChatItem {
  id: string;
  questionText: string;
  userAnswer: string;
  ackText: string | null;
  ackLoading: boolean;
}

// ── Questions list ─────────────────────────────────────────────────────────────

const ORG_TYPE_OPTIONS = [
  "Main Street / Downtown Association",
  "Chamber of Commerce",
  "Rotary Club",
  "Lions Club",
  "VFW / American Legion",
  "Fraternal Organization",
  "PTA / PTO",
  "Community Foundation",
  "Neighborhood Association",
  "Arts Council",
  "Other",
];

const BUSINESS_FOCUSED_TYPES = new Set([
  "Main Street / Downtown Association",
  "Chamber of Commerce",
  "Neighborhood Association",
]);

function setupTemplateForOrgType(orgType: string | null | undefined): { label: string; description: string } | null {
  const value = (orgType ?? "").toLowerCase();
  if (!value) return null;
  if (value.includes("rotary") || value.includes("lions") || value.includes("kiwanis")) {
    return { label: "Civic service template", description: "Built around service work, meetings, projects, members, and community impact." };
  }
  if (value.includes("fraternal") || value.includes("vfw") || value.includes("legion")) {
    return { label: "Lodge and post template", description: "Built around meetings, membership, hall details, dues, notices, and events." };
  }
  if (value.includes("chamber") || value.includes("downtown") || value.includes("main street")) {
    return { label: "Business association template", description: "Built around member businesses, events, sponsorship, and local promotion." };
  }
  if (value.includes("pta") || value.includes("pto")) {
    return { label: "School family template", description: "Built around families, volunteer needs, school events, and resources." };
  }
  if (value.includes("foundation")) {
    return { label: "Foundation template", description: "Built around mission, programs, giving, grants, and community outcomes." };
  }
  return { label: "Community organization template", description: "Built around your mission, programs, contact details, and upcoming activity." };
}

const INTAKE_QUESTIONS: IntakeQuestion[] = [
  // Q1
  { id: "orgName",        text: "What is the full name of your organization?", type: "text", hint: "e.g. Norwin Rotary Club" },
  // Q2
  { id: "shortName",      text: 'What short name or abbreviation do you use? (e.g. "NRC", "IBPA", "VFW Post 1")', type: "text", optional: true, hint: "e.g. NRC", skipLabel: "Auto-generate from name" },
  // Q3
  { id: "tagline",        text: "What is your tagline or one-sentence mission statement?", type: "text", hint: "e.g. Service Above Self" },
  // Q4 — optional, triggers website crawl when answered
  { id: "website",        text: "Do you have an existing website? If so, what's the URL?", type: "text", optional: true, hint: "e.g. norwinrotary.org", skipLabel: "No website" },
  // Q5
  { id: "city",           text: "What city is your organization based in?", type: "text", hint: "e.g. North Huntingdon" },
  // Q6
  { id: "state",          text: "What state?", type: "text", hint: "e.g. Pennsylvania" },
  // Q7
  { id: "contactAddress", text: "What is your organization's physical address?", type: "text", hint: "e.g. 123 Main St, North Huntingdon, PA 15642" },
  // Q8
  { id: "mailingAddress", text: "Do you have a separate mailing address, or is it the same?", type: "text", optional: true, hint: "e.g. PO Box 100, Irwin, PA 15642", skipLabel: "Same as physical address" },
  // Q9
  { id: "contactPhone",   text: "What is your main phone number?", type: "text", hint: "e.g. (724) 555-0100" },
  // Q10
  { id: "contactEmail",   text: "What is your main contact email?", type: "text", hint: "e.g. info@norwinrotary.org" },
  // Q11 — all tiers
  { id: "eventsEmail",    text: "Do you have a separate email for event inquiries?", type: "text", optional: true, hint: "e.g. events@norwinrotary.org", skipLabel: "Skip" },
  // Q12
  { id: "socialFacebook", text: "What is your Facebook page URL?", type: "text", optional: true, hint: "e.g. https://www.facebook.com/NorwinRotary", skipLabel: "No Facebook page" },
  // Q13
  { id: "socialInstagram", text: "What is your Instagram URL?", type: "text", optional: true, hint: "e.g. instagram.com/norwinrotary", skipLabel: "No Instagram" },
  // Q14
  { id: "logoInitials",   text: "What 2–3 letters should appear on your logo badge?", type: "text", optional: true, hint: "e.g. NR", skipLabel: "Use my short name" },
  // Q15
  { id: "orgType",        text: "What type of organization are you?", type: "select", options: ORG_TYPE_OPTIONS },
  // Q16 — all tiers
  { id: "annualEvents",   text: "Approximately how many events do you host per year?", type: "text", hint: "e.g. 12+" },
  // Q17 — all tiers
  { id: "annualAttendees", text: "Approximately how many total attendees across all events?", type: "text", hint: "e.g. 500+" },
  // Q18 — all tiers, label depends on orgType
  {
    id: "membersOrBusinesses",
    text: "How many active members does your organization have?",
    textFn: (ans) => {
      const orgType = ans.orgType as string | null;
      return BUSINESS_FOCUSED_TYPES.has(orgType ?? "")
        ? "How many local businesses are in your area or directory?"
        : "How many active members does your organization have?";
    },
    type: "text",
    hint: "e.g. 75+ members",
  },
  // Q19 — Events / Total Ops only (Starter + Autopilot: auto-set false in getAutoAnswers)
  { id: "hasSponsors",       text: "Do you accept event sponsors?", type: "boolean", tiers: ["tier2", "tier3"] },
  // Q20
  { id: "hasVendors",        text: "Do your events have vendor registration?", type: "boolean", tiers: ["tier2", "tier3"] },
  // Q21
  { id: "hasTicketedEvents", text: "Do any of your events sell tickets?", type: "boolean", tiers: ["tier2", "tier3"] },
  // Q22 — Events/Total Ops ask; Autopilot auto-yes; Starter auto-no
  { id: "hasBlog",       text: "Do you want a News & Updates / Blog section on your site?", type: "boolean", tiers: ["tier2", "tier3"] },
  // Q23
  { id: "hasNewsletter", text: "Do you want email newsletter signup on your site?", type: "boolean", tiers: ["tier2", "tier3"] },
  // Q24 — all tiers
  {
    id: "partners",
    text: "List any community partners — name and a one-line description each.",
    type: "textarea",
    optional: true,
    hint: "e.g. Norwin School District - Education partner; Rotary District 7330 - Regional leadership",
    skipLabel: "No partners to list",
  },
  // Q25 — all tiers, required
  { id: "eventCategories", text: "What categories do your events fall into?", type: "text", hint: "e.g. Fundraisers, Community Service, Social, Meetings" },
  // Q26 — all tiers
  {
    id: "meetingSchedule",
    text: "What is your regular meeting schedule? Include day, time, and location.",
    type: "text",
    optional: true,
    hint: "e.g. Every Wednesday at 12:00 PM, Norwin Hills Country Club",
    skipLabel: "No regular meetings",
  },
  // Q27 — all tiers
  {
    id: "heroBackground",
    text: "For your homepage hero section, would you like a background photo or your brand colors?",
    type: "select",
    options: [
      "AI picks a community photo",
      "I'll upload my own photo",
      "Brand colors only (no photo)",
    ],
  },
];

const SKIP_ACKS: Record<string, string> = {
  shortName:        "I'll auto-generate initials from your org name.",
  website:          "No problem — I'll continue without a website URL.",
  mailingAddress:   "Got it — I'll use your physical address for mail.",
  eventsEmail:      "Got it — event inquiries will go to your main email.",
  socialFacebook:   "No problem — I'll leave Facebook out.",
  socialInstagram:  "Got it — no Instagram.",
  logoInitials:     "I'll use your short name for the logo badge.",
  partners:         "No partners to list — that's fine.",
  meetingSchedule:  "Got it — no regular meetings.",
};

// Returns answers that are auto-set (not asked) based on tier.
function getAutoAnswers(tier: string | null): Record<string, string | boolean | null> {
  const t = tier ?? "tier1";
  const result: Record<string, string | boolean | null> = {};
  if (t === "tier1" || t === "tier1a") {
    result.hasSponsors       = false;
    result.hasVendors        = false;
    result.hasTicketedEvents = false;
  }
  if (t === "tier1") {
    result.hasBlog       = false;
    result.hasNewsletter = false;
  } else if (t === "tier1a") {
    result.hasBlog       = true;
    result.hasNewsletter = true;
  }
  return result;
}

function getFilteredQuestions(tier: string | null): IntakeQuestion[] {
  const effectiveTier = tier ?? "tier1";
  return INTAKE_QUESTIONS.filter(q => {
    if (!q.tiers) return true;
    return q.tiers.includes(effectiveTier);
  });
}

function getQuestionText(q: IntakeQuestion, answers: Record<string, string | boolean | null>): string {
  return q.textFn ? q.textFn(answers) : q.text;
}

// ── Payload helpers ────────────────────────────────────────────────────────────

function extractPayload(text: string): Record<string, unknown> | null {
  const idx = text.indexOf("[PAYLOAD_READY]");
  if (idx === -1) return null;
  const after = text.slice(idx + "[PAYLOAD_READY]".length).trim();
  const jsonStart = after.indexOf("{");
  if (jsonStart === -1) return null;
  try {
    return JSON.parse(after.slice(jsonStart));
  } catch {
    return null;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PayloadPreview({ payload }: { payload: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(true);

  const primaryColor = payload.primaryColor as string | undefined;
  const accentColor  = payload.accentColor  as string | undefined;
  const stats   = payload.stats   as { value: string; label: string }[] | undefined;
  const partners = payload.partners as { name: string }[] | undefined;
  const sc = payload.siteContent as Record<string, string> | undefined;

  const features: string[] = [];
  if (sc?.has_blog === "true")       features.push("News & Blog");
  if (sc?.has_newsletter === "true") features.push("Newsletter");
  if (payload.hasSponsors === true || payload.hasSponsors === "Yes")           features.push("Sponsors");
  if (payload.hasVendors === true || payload.hasVendors === "Yes")             features.push("Vendors");
  if (payload.hasTicketedEvents === true || payload.hasTicketedEvents === "Yes") features.push("Ticketed Events");

  return (
    <div className="rounded-xl border border-[#d4a017]/30 bg-[#0f1a2e] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#d4a017] hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Ready to launch — {String(payload.orgName ?? "")}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 max-h-72 overflow-y-auto">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs pt-1">
            <div>
              <span className="text-[#7a9cbf] block">Org Name</span>
              <span className="text-white font-medium">{String(payload.orgName ?? "")}</span>
            </div>
            <div>
              <span className="text-[#7a9cbf] block">Short Name</span>
              <span className="text-white font-medium">{String(payload.shortName ?? "")}</span>
            </div>
            <div className="mt-1">
              <span className="text-[#7a9cbf] block">Location</span>
              <span className="text-[#c8d8e8]">{String(payload.location ?? "")}</span>
            </div>
            <div className="mt-1">
              <span className="text-[#7a9cbf] block">Contact</span>
              <span className="text-[#c8d8e8] break-all">{String(payload.contactEmail ?? "")}</span>
              {payload.contactPhone ? <span className="text-[#c8d8e8] block">{String(payload.contactPhone)}</span> : null}
            </div>
          </div>

          {/* Brand Colors */}
          {(primaryColor || accentColor) && (
            <div>
              <span className="text-[#7a9cbf] text-xs block mb-1.5">Brand Colors</span>
              <div className="flex items-center gap-4">
                {primaryColor && (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded border border-white/20 flex-shrink-0" style={{ backgroundColor: primaryColor }} />
                    <span className="text-xs text-[#c8d8e8] font-mono">{primaryColor}</span>
                  </div>
                )}
                {accentColor && (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded border border-white/20 flex-shrink-0" style={{ backgroundColor: accentColor }} />
                    <span className="text-xs text-[#c8d8e8] font-mono">{accentColor}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stats */}
          {stats && stats.length > 0 && (
            <div>
              <span className="text-[#7a9cbf] text-xs block mb-1.5">Stats</span>
              <div className="grid grid-cols-4 gap-1.5">
                {stats.map((s, i) => (
                  <div key={i} className="text-center bg-[#1e3a5f]/50 rounded-lg p-1.5">
                    <div className="text-[#d4a017] font-bold text-sm leading-tight">{s.value}</div>
                    <div className="text-[#7a9cbf] text-[10px] leading-tight mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Partners */}
          {partners && partners.length > 0 && (
            <div>
              <span className="text-[#7a9cbf] text-xs block mb-1">Partners</span>
              <div className="flex flex-wrap gap-1">
                {partners.map((p, i) => (
                  <span key={i} className="text-xs bg-[#1e3a5f] text-[#c8d8e8] px-2 py-0.5 rounded-full">{p.name}</span>
                ))}
              </div>
            </div>
          )}

          {/* Features Enabled */}
          {features.length > 0 && (
            <div>
              <span className="text-[#7a9cbf] text-xs block mb-1">Features Enabled</span>
              <div className="flex flex-wrap gap-1">
                {features.map((f, i) => (
                  <span key={i} className="text-xs bg-green-500/10 border border-green-500/30 text-green-300 px-2 py-0.5 rounded-full">{f}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BotBubble({ children, loading }: { children?: React.ReactNode; loading?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#d4a017]/20 flex items-center justify-center">
        <Bot className="w-3.5 h-3.5 text-[#d4a017]" />
      </div>
      <div className="bg-[#0f1a2e] border border-[#1e3a5f] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed text-[#c8d8e8] max-w-[85%]">
        {loading ? (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#d4a017] animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#d4a017] animate-bounce [animation-delay:0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#d4a017] animate-bounce [animation-delay:0.3s]" />
          </div>
        ) : children}
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 flex-row-reverse">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#1e3a5f] flex items-center justify-center">
        <User className="w-3.5 h-3.5 text-[#7a9cbf]" />
      </div>
      <div className="bg-[#1e3a5f] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed text-[#c8d8e8] max-w-[85%]">
        {children}
      </div>
    </div>
  );
}

// ── Provision progress indicator ─────────────────────────────────────────────

function ProvisionProgress({ isNewSite }: { isNewSite: boolean }) {
  const [phase, setPhase] = useState(0);

  const steps = isNewSite
    ? [
        "Creating your site…",
        "Setting up your content…",
        "Finalizing…",
      ]
    : ["Updating your site content…"];

  useEffect(() => {
    if (!isNewSite) return;
    // Advance phases at 2s intervals — purely visual, API response ends the spinner
    const id = setInterval(() => {
      setPhase(p => Math.min(p + 1, steps.length - 1));
    }, 2000);
    return () => clearInterval(id);
  }, [isNewSite, steps.length]);

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#d4a017]/20 flex items-center justify-center">
        <Bot className="w-3.5 h-3.5 text-[#d4a017]" />
      </div>
      <div className="bg-[#0f1a2e] border border-[#1e3a5f] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-[#c8d8e8] space-y-2 max-w-[85%]">
        {steps.map((label, i) => {
          const done    = i < phase;
          const active  = i === phase;
          const pending = i > phase;
          return (
            <div key={i} className={`flex items-center gap-2 ${pending ? "opacity-40" : ""}`}>
              {done ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              ) : active ? (
                <Loader2 className="w-3.5 h-3.5 text-[#d4a017] animate-spin flex-shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-[#1e3a5f] flex-shrink-0" />
              )}
              <span className={active ? "text-white" : done ? "text-[#7aad6a]" : "text-[#4a6a8a]"}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Site status type ───────────────────────────────────────────────────────────

interface UnsplashPhoto {
  id: string;
  thumb: string;
  full: string;
  description: string;
  credit: string;
  // Legacy field names from old API responses (kept for backwards compat)
  thumbUrl?: string;
  previewUrl?: string;
}

function photoThumb(p: UnsplashPhoto) { return p.thumb ?? p.thumbUrl ?? ""; }
function photoFull(p: UnsplashPhoto)  { return p.full  ?? p.previewUrl ?? ""; }

interface SiteStatusData {
  url: string | null;
  slug?: string | null;
  localPreviewUrl?: string | null;
  isProvisioned: boolean;
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  heroVisualType?: HeroVisualType | null;
  configSummary: {
    orgName: string | null;
    orgType: string | null;
    location: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    tagline: string | null;
    mission: string | null;
    siteArchetype: string | null;
    homeIntro: string | null;
    aboutMission: string | null;
  } | null;
	  customPages?: Array<{
	    title: string;
	    slug: string;
	    navLabel?: string;
	    showInNav?: boolean;
	    intro?: string;
	    sections?: Array<{ title: string; body: string }>;
	    media?: unknown;
	    form?: unknown;
	    cta?: unknown;
	    blocks?: HomepageSectionBlock[];
	  }>;
	  homepageSections?: HomepageSectionBlock[];
	  pageSections?: Record<string, HomepageSectionBlock[]>;
	}

interface HomepageSectionBlock {
  id: string;
  type: string;
  title?: string;
  subtitle?: string;
  body?: string;
  visible?: boolean;
  imageUrl?: string | null;
  data?: Record<string, unknown>;
}

type SiteToolPanel = "edit" | "pages" | "brand";

// ── Hero image panel ───────────────────────────────────────────────────────────

type HeroPhase = "idle" | "picking" | "saving" | "approving";

function isLocalDashboardHost(): boolean {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function resolvePreviewUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (isLocalDashboardHost()) {
    return `${window.location.protocol}//${window.location.hostname}:8080${url}`;
  }
  return url;
}

function withPreviewMode(url: string): string {
  if (!url) return "";
  try {
    const next = new URL(url, window.location.href);
    next.searchParams.set("pillar_preview", "1");
    return next.toString();
  } catch {
    const [withoutHash, hash = ""] = url.split("#");
    const separator = withoutHash.includes("?") ? "&" : "?";
    return `${withoutHash}${separator}pillar_preview=1${hash ? `#${hash}` : ""}`;
  }
}

function originForUrl(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return null;
  }
}

function HeroImagePanel({
  initialUrl,
  initialVisualType,
  autoTriggerAi,
  onHeroChanged,
}: {
  initialUrl: string | null | undefined;
  initialVisualType?: HeroVisualType | null;
  autoTriggerAi?: boolean;
  onHeroChanged?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [visualType, setVisualType] = useState<HeroVisualType>(
    initialUrl ? (initialVisualType ?? "banner_background") : "none",
  );
  const [phase, setPhase] = useState<HeroPhase>("idle");
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoTriggered = useRef(false);

  // Auto-trigger the AI pick if the org chose "AI picks" during the interview
  useEffect(() => {
    if (autoTriggerAi && !url && !autoTriggered.current) {
      autoTriggered.current = true;
      void handleAiPick();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTriggerAi]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isImageFile(file)) { setError("Please select an image file."); return; }
    setPhase("saving");
    setError(null);
    try {
      const res = await fetch("/api/organizations/hero-image/upload", {
        method: "POST",
        headers: { "Content-Type": file.type, ...csrfHeaders("POST") },
        credentials: "include",
        cache: "no-store",
        body: file,
      });
      const d = await readJson<{ heroImageUrl?: string; heroVisualType?: HeroVisualType; error?: string }>(res) ?? {};
      if (!res.ok || !d.heroImageUrl) throw new Error(d.error ?? "Save failed");
      setUrl(d.heroImageUrl);
      setVisualType(d.heroVisualType ?? "feature_photo");
      onHeroChanged?.();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setPhase("idle");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleAiPick() {
    setPhase("picking");
    setError(null);
    try {
      const res = await csrfFetch("/api/organizations/hero-image/suggest");
      const d = await readJson<{ photos?: UnsplashPhoto[]; query?: string; error?: string }>(res) ?? {};
      if (!res.ok || !d.photos?.length) throw new Error(d.error ?? "No photos found");
      setPhotos(d.photos);
      setQuery(d.query ?? "");
      setPhase("approving");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load photos");
      setPhase("idle");
    }
  }

  async function applyPhoto(photo: UnsplashPhoto) {
    setPhase("saving");
    setError(null);
    try {
      const res = await csrfFetch("/api/organizations/hero-image/apply-unsplash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: photo.id, photoUrl: photoFull(photo), credit: photo.credit ?? photo.description }),
      });
      const d = await readJson<{ heroImageUrl?: string; heroVisualType?: HeroVisualType; error?: string }>(res) ?? {};
      if (!res.ok || !d.heroImageUrl) throw new Error(d.error ?? "Save failed");
      setUrl(d.heroImageUrl);
      setVisualType(d.heroVisualType ?? "banner_background");
      onHeroChanged?.();
      setPhotos([]);
      setPhase("idle");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply photo");
      setPhase("idle");
    }
  }

  async function removeBanner() {
    setPhase("saving");
    setError(null);
    try {
      await csrfFetch("/api/organizations/hero-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heroImageUrl: null }),
      });
      setUrl(null);
      setVisualType("none");
      onHeroChanged?.();
    } finally {
      setPhase("idle");
    }
  }

  async function createBrandedBanner() {
    setPhase("saving");
    setError(null);
    try {
      const res = await csrfFetch("/api/organizations/hero-image/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await readJson<{ heroImageUrl?: string; heroVisualType?: HeroVisualType; error?: string }>(res) ?? {};
      if (!res.ok || !data.heroImageUrl) {
        throw new Error(data.error ?? "Failed to create branded banner");
      }
      setUrl(data.heroImageUrl);
      setVisualType(data.heroVisualType ?? "banner_background");
      onHeroChanged?.();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create branded banner");
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="rounded-xl bg-[#0f1a2e] border border-[#1e3a5f] p-4 space-y-3">
      <div className="space-y-1">
        <p className="text-xs text-[#7a9cbf] font-medium uppercase tracking-wide">Homepage top image</p>
        <p className="text-xs text-[#7a9cbf]">
          Controls the large image or color banner at the top of your homepage.
        </p>
      </div>

      {/* Current image preview */}
      {url && (
        <div className="relative w-full h-28 rounded-lg overflow-hidden bg-[#08111f]">
          <img
            src={url}
            alt="Hero visual"
            className={`w-full h-full ${visualType === "feature_photo" ? "object-contain" : "object-cover"}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30" />
          <button
            onClick={removeBanner}
            disabled={phase === "saving"}
            title="Remove homepage image"
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors disabled:opacity-50"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      )}

      {/* Unsplash photo grid */}
      {phase === "approving" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            {query && (
              <p className="text-xs text-[#7a9cbf]">
                AI searched for: <span className="text-white font-medium">"{query}"</span>
              </p>
            )}
            <button
              onClick={() => void handleAiPick()}
              className="flex items-center gap-1 text-xs text-[#7a9cbf] hover:text-[#d4a017] transition-colors ml-auto shrink-0"
              title="Load a different set of photos"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map(photo => (
              <button
                key={photo.id}
                onClick={() => void applyPhoto(photo)}
                className="relative aspect-video rounded-md overflow-hidden group focus:outline-none focus:ring-2 focus:ring-[#d4a017]"
              >
                <img
                  src={photoThumb(photo)}
                  alt={photo.description}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-semibold">Select</span>
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => setPhase("idle")}
            className="text-xs text-[#7a9cbf] hover:text-white transition-colors"
          >
            ← Cancel
          </button>
        </div>
      )}

      {/* Feedback */}
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
        </p>
      )}
      {saved && <p className="text-xs text-green-400">Homepage image updated!</p>}

      {/* Action buttons */}
      {phase !== "approving" && (
        <div className="grid gap-2">
          <button
            onClick={() => { setError(null); setTimeout(() => fileRef.current?.click(), 50); }}
            disabled={phase !== "idle"}
            className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border border-[#1e3a5f] bg-[#0f1a2e] hover:bg-[#1e3a5f] text-sm text-[#c8d8e8] font-medium transition-colors disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <ImagePlus className="w-3.5 h-3.5 text-[#7a9cbf]" />
              Use my photo
            </span>
            <span className="text-[11px] text-[#7a9cbf] font-normal">Best for real people, buildings, and events.</span>
          </button>
          <button
            onClick={() => void createBrandedBanner()}
            disabled={phase !== "idle"}
            className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border border-[#d4a017]/40 bg-[#d4a017]/12 hover:bg-[#d4a017]/18 text-sm text-[#f2d27a] font-medium transition-colors disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              {phase === "saving"
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Wand2 className="w-3.5 h-3.5" />
              }
              Use my colors
            </span>
            <span className="text-[11px] text-[#c9aa55] font-normal">Best for a polished homepage background.</span>
          </button>
          <button
            onClick={() => void handleAiPick()}
            disabled={phase !== "idle"}
            className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border border-[#1e3a5f] bg-[#0d1526] hover:bg-[#12203a] text-sm text-[#8aa0bf] font-medium transition-colors disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              {phase === "picking"
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Wand2 className="w-3.5 h-3.5" />
              }
              {phase === "picking" ? "Searching..." : "Choose stock image"}
            </span>
            <span className="text-[11px] text-[#6f83a3] font-normal">Best for scenic or atmospheric backgrounds.</span>
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => void handleFileChange(e)}
      />
    </div>
  );
}

function LogoImagePanel({
  logoUrl,
  onLogoChanged,
}: {
  logoUrl?: string | null;
  onLogoChanged?: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function removeLogo() {
    setPhase("saving");
    setError(null);
    try {
      const res = await csrfFetch("/api/community-site/logo", { method: "DELETE" });
      const data = await readJson<{ ok?: boolean; error?: string }>(res) ?? {};
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to remove logo");
      onLogoChanged?.();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove logo");
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="rounded-xl bg-[#0f1a2e] border border-[#1e3a5f] p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs text-[#7a9cbf] font-medium uppercase tracking-wide">Site logo</p>
          <p className="text-xs text-[#7a9cbf]">Controls the image in the top-left site header.</p>
        </div>
        {logoUrl ? (
          <div className="flex h-12 min-w-16 max-w-28 items-center justify-center rounded-lg border border-white/10 bg-white p-2">
            <img src={logoUrl} alt="" className="max-h-8 max-w-full object-contain" />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[#1e3a5f] px-3 py-2 text-xs text-[#7a9cbf]">
            Using initials
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
        </p>
      )}
      {saved && <p className="text-xs text-green-400">Logo removed.</p>}

      {logoUrl ? (
        <button
          type="button"
          onClick={() => void removeLogo()}
          disabled={phase !== "idle"}
          className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/15 disabled:opacity-50"
        >
          {phase === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Remove logo image
        </button>
      ) : null}
    </div>
  );
}

// ── Manual website editor ─────────────────────────────────────────────────────

type EditorBlockType = "copy" | "form" | "photo";

const EDITOR_BLOCKS: Array<{
  type: EditorBlockType;
  label: string;
  description: string;
  icon: typeof FileText;
}> = [
  { type: "copy", label: "Copy", description: "Text sections, programs, tiers, or service details.", icon: FileText },
  { type: "form", label: "Request Form", description: "A simple form for information requests.", icon: ClipboardList },
  { type: "photo", label: "Picture", description: "A page image or picture area.", icon: ImageIcon },
];

type PageTemplate = {
  id: string;
  title: string;
  description: string;
  intro: string;
  sections: string[];
  blocks: EditorBlockType[];
  appliesTo?: string[];
  triggers?: string[];
  requireTrigger?: boolean;
};

const CONTEXTUAL_PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "service-projects",
    title: "Service Projects",
    description: "Current projects, who they help, and how neighbors can join in.",
    intro: "Show the practical work your organization does in the community.",
    sections: ["Current projects", "Who we serve", "How to get involved"],
    blocks: ["copy", "photo", "form"],
    appliesTo: ["rotary", "lions", "kiwanis", "optimist", "civic_service", "nonprofit_service"],
  },
  {
    id: "membership",
    title: "Membership",
    description: "Explain who should join and what membership looks like.",
    intro: "Invite prospective members to learn about meetings, service, and fellowship.",
    sections: ["Why join", "What members do", "Visit a meeting"],
    blocks: ["copy", "form"],
    appliesTo: ["rotary", "lions", "fraternal", "lodge", "membership_association", "business_chamber"],
  },
  {
    id: "meetings",
    title: "Meetings",
    description: "Regular meeting details, visitor expectations, and contact next steps.",
    intro: "Help visitors understand when and where to meet you.",
    sections: ["When we meet", "What to expect", "Questions before visiting"],
    blocks: ["copy", "form"],
    appliesTo: ["rotary", "lions", "fraternal", "lodge", "membership_association", "civic_service"],
  },
  {
    id: "scholarships",
    title: "Scholarships",
    description: "Student awards, eligibility, and request-information forms.",
    intro: "Share scholarship opportunities and how students or families can learn more.",
    sections: ["Scholarship opportunities", "Eligibility", "Request information"],
    blocks: ["copy", "form"],
    appliesTo: ["rotary", "civic_service", "foundation", "pta", "nonprofit_service"],
    triggers: ["scholarship", "graduating senior", "student award", "student support"],
    requireTrigger: true,
  },
  {
    id: "vision-service",
    title: "Vision Service",
    description: "Eyeglass collection, screenings, and vision-related service.",
    intro: "Explain vision projects and how people can donate or request details.",
    sections: ["Eyeglass collection", "Vision support", "How to help"],
    blocks: ["copy", "photo", "form"],
    appliesTo: ["lions"],
    triggers: ["vision", "eyeglass", "glasses", "hearing"],
  },
  {
    id: "donate-support",
    title: "Donate / Support",
    description: "Ways to donate, sponsor, volunteer, or support a cause.",
    intro: "Give supporters a clear path to help your mission.",
    sections: ["Ways to support", "Where gifts go", "Request donation information"],
    blocks: ["copy", "form"],
    appliesTo: ["lions", "foundation", "nonprofit_service", "civic_service"],
    triggers: ["donate", "donation", "support", "sponsor", "fundraiser"],
  },
  {
    id: "hall-rental",
    title: "Hall Rental",
    description: "Rental details, amenities, availability, and inquiry form.",
    intro: "Help neighbors understand whether your venue is a fit for their event.",
    sections: ["Rental overview", "Amenities", "Request availability"],
    blocks: ["copy", "photo", "form"],
    appliesTo: ["fraternal", "lodge"],
    triggers: ["hall", "venue", "rental", "banquet"],
  },
  {
    id: "officers",
    title: "Officers",
    description: "Leadership roster and officer contact details.",
    intro: "Introduce the people responsible for leading the organization.",
    sections: ["Current officers", "Committees", "Contact leadership"],
    blocks: ["copy"],
    appliesTo: ["fraternal", "lodge", "membership_association", "rotary", "lions"],
  },
  {
    id: "member-directory",
    title: "Member Directory",
    description: "A public directory or business/member listing.",
    intro: "Showcase members and make it easier for the community to connect.",
    sections: ["Featured members", "Directory categories", "Join the directory"],
    blocks: ["copy", "form"],
    appliesTo: ["business_chamber", "chamber", "business", "main street", "membership_association"],
  },
  {
    id: "vendors",
    title: "Vendors",
    description: "Vendor requirements, booth details, and application form.",
    intro: "Give vendors the details they need before applying.",
    sections: ["Vendor information", "Booth details", "Apply or request information"],
    blocks: ["copy", "form"],
    appliesTo: ["event_festival", "festival", "fair", "market"],
    triggers: ["vendor", "booth", "market", "festival", "fair"],
  },
  {
    id: "sponsors",
    title: "Sponsors",
    description: "Sponsor levels, recognition, and inquiry form.",
    intro: "Show sponsors how their support helps your event or mission.",
    sections: ["Sponsor opportunities", "Recognition", "Request sponsorship information"],
    blocks: ["copy", "form"],
    appliesTo: ["event_festival", "business_chamber", "nonprofit_service", "civic_service"],
    triggers: ["sponsor", "sponsorship", "supporter"],
  },
  {
    id: "event-schedule",
    title: "Schedule",
    description: "A schedule page for events, festivals, or recurring activities.",
    intro: "Help visitors quickly find what is happening and when.",
    sections: ["Event schedule", "Location details", "Questions"],
    blocks: ["copy"],
    appliesTo: ["event_festival", "festival", "fair", "market"],
    triggers: ["schedule", "festival", "fair", "market", "event"],
  },
];

const GENERAL_PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "programs",
    title: "Programs",
    description: "A flexible page for services, initiatives, or recurring work.",
    intro: "Organize your ongoing work into easy-to-scan sections.",
    sections: ["Program overview", "Who it helps", "How to learn more"],
    blocks: ["copy", "photo", "form"],
  },
  {
    id: "gallery",
    title: "Photo Gallery",
    description: "Photos from projects, events, and community moments.",
    intro: "Share real images that show your organization in action.",
    sections: ["Featured photos", "Recent events"],
    blocks: ["copy", "photo"],
  },
  {
    id: "faq",
    title: "FAQ",
    description: "Answers to common visitor, member, donor, or participant questions.",
    intro: "Answer common questions in one place.",
    sections: ["General questions", "Getting involved", "Contact"],
    blocks: ["copy", "form"],
  },
];

function textIncludesAny(text: string, terms: string[] | undefined): boolean {
  if (!terms?.length) return false;
  return terms.some(term => text.includes(term.toLowerCase()));
}

function statusSearchText(status: SiteStatusData): string {
  const summary = status.configSummary;
  return [
    summary?.orgName,
    summary?.orgType,
    summary?.siteArchetype,
    summary?.tagline,
    summary?.mission,
    summary?.homeIntro,
    summary?.aboutMission,
    ...(status.customPages ?? []).flatMap(page => [page.title, page.navLabel, page.intro]),
  ].filter(Boolean).join(" ").toLowerCase();
}

function pageSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function recommendedPageTemplates(status: SiteStatusData): PageTemplate[] {
  const text = statusSearchText(status);
  const existingSlugs = new Set((status.customPages ?? []).map(page => page.slug));
  return CONTEXTUAL_PAGE_TEMPLATES.filter(template => {
    if (existingSlugs.has(pageSlug(template.title))) return false;
    const orgMatch = !template.appliesTo?.length || textIncludesAny(text, template.appliesTo);
    const triggerMatch = textIncludesAny(text, template.triggers);
    return orgMatch && (!template.requireTrigger || triggerMatch);
  }).slice(0, 6);
}

function generalPageTemplates(status: SiteStatusData): PageTemplate[] {
  const existingSlugs = new Set((status.customPages ?? []).map(page => page.slug));
  return GENERAL_PAGE_TEMPLATES.filter(template => !existingSlugs.has(pageSlug(template.title)));
}

function ManualWebsiteEditor({
  status,
  embedded = false,
  onPagesChanged,
}: {
  status: SiteStatusData;
  embedded?: boolean;
  onPagesChanged?: (status: SiteStatusData) => void;
}) {
	  const [open, setOpen] = useState(() => embedded);
  const [pageTitle, setPageTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [sections, setSections] = useState("");
  const [blocks, setBlocks] = useState<EditorBlockType[]>(["copy"]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [savingPage, setSavingPage] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const customPages = status.customPages ?? [];
  const recommendedTemplates = recommendedPageTemplates(status);
  const generalTemplates = generalPageTemplates(status);
  const selectedTemplate = [...recommendedTemplates, ...generalTemplates].find(template => template.id === selectedTemplateId);

  function addBlock(type: EditorBlockType) {
    setBlocks(current => current.includes(type) ? current : [...current, type]);
  }

  function removeBlock(type: EditorBlockType) {
    setBlocks(current => current.filter(block => block !== type));
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const type = event.dataTransfer.getData("application/x-pillar-block") as EditorBlockType;
    if (EDITOR_BLOCKS.some(block => block.type === type)) addBlock(type);
  }

  function useTemplate(template: PageTemplate) {
    setSelectedTemplateId(template.id);
    setPageTitle(template.title);
    setIntro(template.intro);
    setSections(template.sections.join("\n"));
    setBlocks(template.blocks);
  }

  async function reloadPageStatus() {
    const res = await csrfFetch("/api/community-site/target");
    if (!res.ok) return;
    const nextStatus = await readJson<SiteStatusData>(res);
    if (nextStatus) onPagesChanged?.(nextStatus);
  }

  async function createPage() {
    const title = pageTitle.trim();
    if (!title) return;

    setSavingPage(true);
    setPageMessage(null);
    setPageError(null);
    try {
      const sectionList = sections
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);
      const res = await csrfFetch("/api/community-site/custom-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          intro: intro.trim(),
          sections: sectionList,
          blocks,
          templateId: selectedTemplateId,
        }),
      });
      const data = await readJson<{ ok?: boolean; error?: string }>(res) ?? {};
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not create page.");
      await reloadPageStatus();
      setPageTitle("");
      setIntro("");
      setSections("");
      setBlocks(["copy"]);
      setSelectedTemplateId(null);
      setPageMessage(`Created ${title}. You can edit it from Edit this page.`);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Could not create page.");
    } finally {
      setSavingPage(false);
    }
  }

  async function deletePage(page: NonNullable<SiteStatusData["customPages"]>[number]) {
    if (!confirm(`Delete the "${page.title}" page?`)) return;
    setDeletingSlug(page.slug);
    setPageMessage(null);
    setPageError(null);
    try {
      const res = await csrfFetch(`/api/community-site/custom-pages/${encodeURIComponent(page.slug)}`, {
        method: "DELETE",
      });
      const data = await readJson<{ ok?: boolean; error?: string }>(res) ?? {};
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not delete page.");
      await reloadPageStatus();
      setPageMessage(`Deleted ${page.title}.`);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Could not delete page.");
    } finally {
      setDeletingSlug(null);
    }
  }

  return (
    <div className={embedded ? "rounded-xl border border-[#1e3a5f] bg-[#0f1a2e] overflow-hidden" : "rounded-2xl border border-[#1e3a5f] bg-[#0f1a2e] overflow-hidden"}>
	      <button
	        type="button"
	        onClick={() => embedded ? undefined : setOpen(value => !value)}
	        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-[#c8d8e8] hover:bg-white/5 transition-colors"
	      >
	        <span className="flex min-w-0 items-center gap-3">
	          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#d4a017]/10 text-[#d4a017]">
	            <Plus className="w-4 h-4" />
	          </span>
	          <span className="min-w-0">
	            <span className="block text-sm text-white">{embedded ? "Pages & menu" : "Add a new page"}</span>
	            <span className="block truncate text-xs font-normal text-[#7a9cbf]">Add pages, review custom pages, or remove pages from the site menu.</span>
	          </span>
	        </span>
	        {!embedded && (open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
	      </button>

	      {open && (
		        <div className="px-4 pb-4 space-y-4">
		          <p className="text-xs text-[#7a9cbf]">
		            Start with a page idea, adjust the basics, then add it to the same site structure the AI editor uses.
		          </p>

          <div className={`grid gap-4 ${embedded ? "" : "lg:grid-cols-[minmax(0,1fr)_minmax(360px,1.25fr)]"}`}>
	            <div className="space-y-4 order-2 lg:order-1">
	              {customPages.length > 0 && (
	                <div className="space-y-2">
		                  <p className="text-xs uppercase tracking-wide text-[#7a9cbf] font-medium">Existing pages</p>
	                  <div className="space-y-2">
	                    {customPages.map(page => (
	                      <div key={page.slug} className="flex items-center justify-between gap-3 rounded-lg border border-[#1e3a5f] bg-[#08111f] px-3 py-2">
		                        <div className="min-w-0">
		                          <p className="text-sm text-white font-medium truncate">{page.navLabel || page.title}</p>
		                          <p className="text-xs text-[#7a9cbf] truncate">Shown in menu</p>
		                        </div>
	                        <button
	                          type="button"
	                          disabled={Boolean(deletingSlug)}
	                          onClick={() => void deletePage(page)}
	                          className="inline-flex items-center gap-1 rounded-md border border-red-500/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
	                          aria-label={`Delete ${page.title} page`}
	                        >
	                          {deletingSlug === page.slug ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
	                          {deletingSlug === page.slug ? "Deleting" : "Delete"}
	                        </button>
	                      </div>
	                    ))}
	                  </div>
	                </div>
	              )}

	              <div className="space-y-2">
		                <p className="text-xs uppercase tracking-wide text-[#7a9cbf] font-medium">Suggested for this site</p>
	                {recommendedTemplates.length > 0 ? (
	                  <div className="grid gap-2">
	                    {recommendedTemplates.map(template => (
	                      <button
	                        key={template.id}
	                        type="button"
	                        data-testid={`page-template-${template.id}`}
	                        onClick={() => useTemplate(template)}
	                        className={`rounded-lg border p-3 text-left transition-colors ${
	                          selectedTemplateId === template.id
	                            ? "border-[#d4a017]/70 bg-[#d4a017]/10"
	                            : "border-[#1e3a5f] bg-[#08111f] hover:border-[#d4a017]/50"
	                        }`}
	                      >
	                        <span className="block text-sm font-medium text-white">{template.title}</span>
	                        <span className="block pt-1 text-xs text-[#7a9cbf]">{template.description}</span>
	                      </button>
	                    ))}
	                  </div>
	                ) : (
	                  <p className="rounded-lg border border-[#1e3a5f] bg-[#08111f] p-3 text-xs text-[#7a9cbf]">
	                    No specialized page templates matched this site yet. Use a general page or create a custom page.
	                  </p>
	                )}
	              </div>

	              <div className="space-y-2">
		                <p className="text-xs uppercase tracking-wide text-[#7a9cbf] font-medium">Other page types</p>
	                <div className="flex flex-wrap gap-2">
	                  {generalTemplates.map(template => (
	                    <button
	                      key={template.id}
	                      type="button"
	                      onClick={() => useTemplate(template)}
	                      className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
	                        selectedTemplateId === template.id
	                          ? "border-[#d4a017]/70 bg-[#d4a017]/10 text-[#f2d27a]"
	                          : "border-[#1e3a5f] bg-[#08111f] text-[#c8d8e8] hover:border-[#d4a017]/50"
	                      }`}
	                    >
	                      {template.title}
	                    </button>
	                  ))}
	                </div>
	              </div>
	            </div>

	            <div
	              onDragOver={(event) => {
	                event.preventDefault();
	                setDragActive(true);
	              }}
	              onDragLeave={() => setDragActive(false)}
	              onDrop={handleDrop}
	              className={`order-1 lg:order-2 rounded-xl border border-dashed p-3 space-y-3 transition-colors ${dragActive ? "border-[#d4a017] bg-[#d4a017]/10" : "border-[#1e3a5f] bg-[#060f1e]"}`}
	            >
	              <div className="flex items-center justify-between gap-2">
	                <div>
		                  <p className="text-xs uppercase tracking-wide text-[#7a9cbf] font-medium">New page draft</p>
	                  {selectedTemplate && (
	                    <p className="text-[11px] text-[#4a6a8a]">Using {selectedTemplate.title} template</p>
	                  )}
	                </div>
	                <button
	                  type="button"
	                  onClick={() => {
	                    setPageTitle("");
	                    setIntro("");
	                    setSections("");
	                    setBlocks(["copy"]);
	                    setSelectedTemplateId(null);
	                  }}
	                  className="text-xs text-[#7a9cbf] hover:text-white"
	                >
	                  Reset
	                </button>
	              </div>

	              <input
	                data-testid="page-title-input"
	                value={pageTitle}
	                onChange={event => setPageTitle(event.target.value)}
	                placeholder="Page title"
	                className="w-full bg-[#0f1a2e] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#4a6a8a] focus:outline-none focus:border-[#d4a017]"
	              />
	              <Textarea
	                value={intro}
	                onChange={event => setIntro(event.target.value)}
	                placeholder="Optional intro copy"
	                rows={2}
	                className="bg-[#0f1a2e] border-[#1e3a5f] text-white placeholder:text-[#4a6a8a] focus:border-[#d4a017] resize-none"
	              />
	              <Textarea
	                value={sections}
	                onChange={event => setSections(event.target.value)}
	                placeholder={"Sections or items, one per line\nExample: Project overview\nRequest information"}
	                rows={4}
	                className="bg-[#0f1a2e] border-[#1e3a5f] text-white placeholder:text-[#4a6a8a] focus:border-[#d4a017] resize-none"
	              />

	              <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
	                <div className="space-y-2">
		                  <p className="text-xs uppercase tracking-wide text-[#7a9cbf] font-medium">Add content</p>
	              {EDITOR_BLOCKS.map(block => (
	                <button
	                  key={block.type}
                  type="button"
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("application/x-pillar-block", block.type)}
                  onClick={() => addBlock(block.type)}
                  className="w-full rounded-lg border border-[#1e3a5f] bg-[#08111f] p-3 text-left hover:border-[#d4a017]/50 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-[#c8d8e8]">
                    <block.icon className="w-4 h-4 text-[#d4a017]" />
                    {block.label}
                  </span>
	                  <span className="block pt-1 text-xs text-[#7a9cbf]">{block.description}</span>
	                </button>
	              ))}
	                </div>
	                <div className="space-y-2">
		                  <p className="text-xs uppercase tracking-wide text-[#7a9cbf] font-medium">Included content</p>
	                {blocks.map(blockType => {
	                  const block = EDITOR_BLOCKS.find(item => item.type === blockType);
	                  if (!block) return null;
                  return (
                    <div key={block.type} className="flex items-center justify-between gap-2 rounded-lg border border-[#1e3a5f] bg-[#0f1a2e] px-3 py-2">
                      <span className="flex items-center gap-2 text-sm text-[#c8d8e8]">
                        <block.icon className="w-4 h-4 text-[#d4a017]" />
                        {block.label}
                      </span>
                      {block.type !== "copy" && (
                        <button type="button" onClick={() => removeBlock(block.type)} className="text-[#7a9cbf] hover:text-white">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
	                })}
	                </div>
	              </div>

	              <Button
                type="button"
                onClick={() => void createPage()}
                disabled={savingPage || !pageTitle.trim()}
                className="w-full bg-[#d4a017] hover:bg-[#b88a14] disabled:opacity-50 text-black font-semibold"
              >
                {savingPage ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
	                Add page
              </Button>
              {pageMessage && <p className="text-xs text-green-300">{pageMessage}</p>}
              {pageError && (
                <p className="flex items-center gap-1 text-xs text-red-300">
                  <AlertCircle className="w-3 h-3" />
                  {pageError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// This is for nontechnical civic groups. Prioritize safe guardrails over maximum design freedom.
// v1 is a controlled section/block editor, not a freeform Wix-style canvas.
const BUILT_IN_HOMEPAGE_SECTIONS: HomepageSectionBlock[] = [
  { id: "hero", type: "hero", title: "Hero", visible: true },
  { id: "announcements", type: "announcements", title: "Announcements", visible: true },
  { id: "rotary-features", type: "rotary_features", title: "News & Features", visible: true },
  { id: "stats", type: "stats", title: "Impact", visible: true },
  { id: "rotary-service-areas", type: "rotary_service_areas", title: "Service Areas", visible: true },
  { id: "events", type: "events", title: "Upcoming Events", visible: true },
  { id: "partners", type: "partners", title: "Community Partners", visible: true },
  { id: "newsletter", type: "newsletter", title: "Stay Connected", visible: true },
];

const SYSTEM_MANAGED_HOMEPAGE_SECTION_TYPES = new Set(["events"]);
const SYSTEM_MANAGED_PAGE_KEYS = new Set(["events"]);

const APPROVED_SECTION_TEMPLATES: Array<{
  type: string;
  title: string;
  body: string;
  description: string;
}> = [
  {
    type: "meeting_schedule",
    title: "When We Meet",
    body: "Share regular meeting details and where visitors can find you.",
    description: "Meeting cadence and location",
  },
  {
    type: "volunteer_opportunities",
    title: "Volunteer Opportunities",
    body: "List practical ways neighbors can help with current projects.",
    description: "Volunteer cards",
  },
  {
    type: "history",
    title: "Our History",
    body: "Tell the story of your organization and its role in the community.",
    description: "Timeline or story section",
  },
  {
    type: "gallery",
    title: "Photo Gallery",
    body: "Show photos from service projects, meetings, and events.",
    description: "Approved image grid",
  },
  {
    type: "documents",
    title: "Resources",
    body: "Share useful forms, annual reports, or public documents.",
    description: "Document list",
  },
];

function cloneSections(sections: HomepageSectionBlock[]): HomepageSectionBlock[] {
  return sections.map(section => ({
    ...section,
    data: section.data ? { ...section.data } : undefined,
  }));
}

function normalizeHomepageDraft(sections: HomepageSectionBlock[] | undefined): HomepageSectionBlock[] {
  const source = sections && sections.length > 0 ? sections : BUILT_IN_HOMEPAGE_SECTIONS;
  const normalized: HomepageSectionBlock[] = source
    .filter(section => section && typeof section.type === "string")
    .filter(section => section.visible !== false)
    .map(section => {
      return {
        id: section.id || section.type,
        type: section.type,
        title: section.title || sectionLabel(section.type),
        subtitle: section.subtitle,
        body: section.body,
        imageUrl: section.imageUrl ?? null,
        visible: section.visible !== false,
        data: section.data,
      };
    });

  return normalized;
}

interface EditorPageOption {
  key: string;
  label: string;
  path: string;
  locked?: boolean;
  helper?: string;
  defaultSections: HomepageSectionBlock[];
}

function customPageKey(slug: string): string {
  return `custom:${slug}`;
}

function sectionFromCopy(pagePrefix: string, index: number, title: string, body: string): HomepageSectionBlock {
  return {
    id: `${pagePrefix}-section-${index + 1}`,
    type: "copy",
    title,
    body,
    visible: true,
  };
}

function pagePath(key: string): string {
  if (key === "home") return "/";
  if (key === "events") return "/events";
  if (key.startsWith("custom:")) return `/${key.slice("custom:".length)}`;
  return `/${key}`;
}

function pageSectionsFor(status: SiteStatusData, key: string): HomepageSectionBlock[] | undefined {
  if (key === "home") return status.homepageSections;
  return status.pageSections?.[key];
}

function buildEditorPages(status: SiteStatusData): EditorPageOption[] {
  const orgName = status.configSummary?.orgName || "Your Organization";
  const tagline = status.configSummary?.tagline || "";
  const mission = status.configSummary?.mission || "";
  const aboutMission = status.configSummary?.aboutMission || mission;

  const pages: EditorPageOption[] = [
    {
      key: "home",
      label: "Home",
      path: "/",
      defaultSections: normalizeHomepageDraft(status.homepageSections),
    },
    {
      key: "about",
      label: "About",
      path: "/about",
      defaultSections: [
        { id: "about-hero", type: "page_hero", title: orgName, body: tagline, visible: true },
        { id: "about-intro", type: "about_intro", title: "Our Mission", body: aboutMission, visible: true },
        { id: "about-programs", type: "programs", title: "What We Do", visible: true },
        { id: "about-find-us", type: "find_us", title: "Find Us", visible: true },
        { id: "about-partners", type: "partners", title: "Our Partners", visible: true },
        {
          id: "about-cta",
          type: "cta",
          title: "Get Involved",
          body: "We'd love to have you join our community. Reach out to learn more about membership and volunteering.",
          visible: true,
        },
      ],
    },
    {
      key: "contact",
      label: "Contact",
      path: "/contact",
      defaultSections: [
        { id: "contact-intro", type: "contact_intro", title: "Contact Us", body: "We'd love to hear from you", visible: true },
        { id: "contact-form", type: "contact_form", title: "Send a Message", visible: true },
        { id: "contact-details", type: "contact_details", title: "Get in Touch", visible: true },
        { id: "contact-social", type: "social_links", title: "Follow Us", visible: true },
      ],
    },
    {
      key: "gallery",
      label: "Gallery",
      path: "/gallery",
      defaultSections: [
        { id: "gallery-intro", type: "gallery_intro", title: "Photo Gallery", body: "Memories from our community events", visible: true },
        { id: "gallery-albums", type: "album_grid", title: "Albums", visible: true },
      ],
    },
    {
      key: "members",
      label: "Members",
      path: "/members",
      defaultSections: [
        { id: "members-intro", type: "members_intro", title: "Members area", body: "Please sign in to access member content.", visible: true },
        { id: "members-actions", type: "member_actions", title: "Member sign in", visible: true },
      ],
    },
    {
      key: "events",
      label: "Events",
      path: "/events",
      locked: true,
      helper: "Events are managed from the Events tab.",
      defaultSections: [],
    },
  ];

  for (const page of status.customPages ?? []) {
    const defaults: HomepageSectionBlock[] = [
      { id: `${page.slug}-hero`, type: "page_hero", title: page.title, body: page.intro ?? "", visible: true },
      ...(page.media ? [{ id: `${page.slug}-media`, type: "media", title: "Featured image", visible: true } as HomepageSectionBlock] : []),
      ...(page.sections ?? []).map((section, index) => sectionFromCopy(page.slug, index, section.title, section.body)),
      ...(page.form ? [{ id: `${page.slug}-form`, type: "form", title: "Request Information", visible: true } as HomepageSectionBlock] : []),
      ...(page.cta ? [{ id: `${page.slug}-cta`, type: "cta", title: "Call to Action", visible: true } as HomepageSectionBlock] : []),
    ];
    pages.push({
      key: customPageKey(page.slug),
      label: page.navLabel || page.title,
      path: `/${page.slug}`,
      defaultSections: defaults,
    });
  }

  return pages;
}

function normalizePageDraft(page: EditorPageOption, sections: HomepageSectionBlock[] | undefined): HomepageSectionBlock[] {
  if (page.key === "home") return normalizeHomepageDraft(sections);
  const source = sections && sections.length > 0 ? sections : page.defaultSections;
  return source
    .filter(section => section && typeof section.type === "string")
    .filter(section => section.visible !== false)
    .map(section => ({
      id: section.id || section.type,
      type: section.type,
      title: section.title || sectionLabel(section.type),
      subtitle: section.subtitle,
      body: section.body,
      imageUrl: section.imageUrl ?? null,
      visible: section.visible !== false,
      data: section.data,
    }));
}

function initialDraftsForStatus(status: SiteStatusData): Record<string, HomepageSectionBlock[]> {
  const drafts: Record<string, HomepageSectionBlock[]> = {};
  for (const page of buildEditorPages(status)) {
    if (page.locked) continue;
    drafts[page.key] = normalizePageDraft(page, pageSectionsFor(status, page.key));
  }
  return drafts;
}

function visualDraftStorageKey(status: SiteStatusData): string {
  return `pillar-visual-site-draft:${status.slug ?? status.url ?? "current"}`;
}

function loadPersistedVisualDraft(status: SiteStatusData): Record<string, HomepageSectionBlock[]> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(visualDraftStorageKey(status));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { drafts?: unknown };
    if (!parsed || typeof parsed !== "object" || !parsed.drafts || typeof parsed.drafts !== "object") return null;
    const pages = buildEditorPages(status);
    const next: Record<string, HomepageSectionBlock[]> = {};
    for (const page of pages) {
      if (page.locked) continue;
      const value = (parsed.drafts as Record<string, unknown>)[page.key];
      if (Array.isArray(value)) next[page.key] = normalizePageDraft(page, value as HomepageSectionBlock[]);
    }
    return Object.keys(next).length ? next : null;
  } catch {
    return null;
  }
}

function persistVisualDraft(status: SiteStatusData, drafts: Record<string, HomepageSectionBlock[]>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(visualDraftStorageKey(status), JSON.stringify({
    savedAt: new Date().toISOString(),
    drafts,
  }));
}

function clearPersistedVisualDraft(status: SiteStatusData) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(visualDraftStorageKey(status));
}

function sectionLabel(type: string): string {
  switch (type) {
    case "hero": return "Hero";
    case "announcements": return "Announcements";
    case "rotary_features": return "News & Features";
    case "lions_support": return "Support Pathway";
    case "lodge_explore": return "Explore";
    case "stats": return "Impact";
    case "rotary_service_areas": return "Service Areas";
    case "lions_promo": return "Service Promo";
    case "events": return "Upcoming Events";
    case "partners": return "Community Partners";
    case "newsletter": return "Stay Connected";
    case "meeting_schedule": return "When We Meet";
    case "volunteer_opportunities": return "Volunteer Opportunities";
    case "history": return "Our History";
    case "gallery": return "Photo Gallery";
	    case "documents": return "Resources";
	    case "page_hero": return "Page Header";
	    case "about_intro": return "About Copy";
	    case "programs": return "Programs";
	    case "find_us": return "Find Us";
	    case "cta": return "Call to Action";
	    case "contact_intro": return "Contact Intro";
	    case "contact_form": return "Contact Form";
	    case "contact_details": return "Contact Details";
	    case "social_links": return "Social Links";
	    case "gallery_intro": return "Gallery Intro";
	    case "album_grid": return "Photo Albums";
	    case "members_intro": return "Members Intro";
	    case "member_actions": return "Member Actions";
	    case "media": return "Media";
	    case "form": return "Form";
	    case "copy": return "Copy";
	    default: return "Section";
	  }
	}

function sectionDescription(type: string): string {
  switch (type) {
    case "hero": return "Main welcome area";
    case "announcements": return "Latest site notice";
    case "rotary_features": return "News and service highlights";
    case "lions_support": return "Donation or support options";
    case "lodge_explore": return "Ways to explore the organization";
    case "stats": return "Impact numbers";
    case "rotary_service_areas": return "Service focus areas";
    case "lions_promo": return "Featured service message";
    case "events": return "Managed from Events";
    case "partners": return "Partner or sponsor logos";
    case "newsletter": return "Email signup area";
    case "meeting_schedule": return "Meeting details";
    case "volunteer_opportunities": return "Ways people can help";
    case "history": return "Organization story";
    case "gallery": return "Photo highlights";
    case "documents": return "Files and resources";
    case "page_hero": return "Top page headline";
    case "about_intro": return "Mission and about copy";
    case "programs": return "Programs or services";
    case "find_us": return "Location details";
    case "cta": return "Button and next step";
    case "contact_intro": return "Contact page heading";
    case "contact_form": return "Message form";
    case "contact_details": return "Email, phone, and address";
    case "social_links": return "Social media links";
    case "gallery_intro": return "Gallery page heading";
    case "album_grid": return "Photo albums";
    case "members_intro": return "Members page heading";
    case "member_actions": return "Member sign-in links";
    case "media": return "Image or media area";
    case "form": return "Request form";
    case "copy": return "Text content";
    default: return "Page section";
  }
}

function sectionDisplayTitle(section: HomepageSectionBlock): string {
  const label = sectionLabel(section.type);
  const title = section.title?.trim();
  if (!title) return label;
  if (title.toLowerCase() === label.toLowerCase()) return label;
  return title;
}

function PageVisualEditor({
  status,
  selectedPageKey,
  onSelectedPageKeyChange,
  onPublished,
  onDraftChange,
  onRefreshPreview,
  previewOrigin,
}: {
  status: SiteStatusData;
  selectedPageKey: string;
  onSelectedPageKeyChange: (pageKey: string) => void;
  onPublished: (status: SiteStatusData) => void;
  onDraftChange: (drafts: Record<string, HomepageSectionBlock[]>) => void;
  onRefreshPreview: () => void;
  previewOrigin: string | null;
}) {
  const pages = buildEditorPages(status);
  const selectedPage = pages.find(page => page.key === selectedPageKey) ?? pages[0];
  const [draftByPage, setDraftByPage] = useState<Record<string, HomepageSectionBlock[]>>(
    () => loadPersistedVisualDraft(status) ?? initialDraftsForStatus(status),
  );
  const draft = draftByPage[selectedPage.key] ?? normalizePageDraft(selectedPage, pageSectionsFor(status, selectedPage.key));
  const [selectedId, setSelectedId] = useState(() => draft[0]?.id ?? "hero");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
	  const [saving, setSaving] = useState(false);
	  const [uploading, setUploading] = useState(false);
	  const [message, setMessage] = useState<string | null>(null);
	  const [error, setError] = useState<string | null>(null);
  const [lastRemoved, setLastRemoved] = useState<{
    pageKey: string;
    section: HomepageSectionBlock;
    index: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next = loadPersistedVisualDraft(status) ?? initialDraftsForStatus(status);
    setDraftByPage(next);
    const currentPage = buildEditorPages(status).find(page => page.key === selectedPageKey) ?? buildEditorPages(status)[0];
    const currentDraft = next[currentPage.key] ?? [];
    setSelectedId(current => currentDraft.some(section => section.id === current) ? current : currentDraft[0]?.id ?? "hero");
  }, [status.homepageSections, status.pageSections, status.customPages, selectedPageKey]);

  const selected = draft.find(section => section.id === selectedId) ?? draft[0];
  const selectedDirty = JSON.stringify(draft) !== JSON.stringify(normalizePageDraft(selectedPage, pageSectionsFor(status, selectedPage.key)));
  const selectedIsSystemManaged = selected ? SYSTEM_MANAGED_HOMEPAGE_SECTION_TYPES.has(selected.type) : false;
  const hasAnyDirty = Object.entries(draftByPage).some(([pageKey, sections]) => {
    const page = pages.find(item => item.key === pageKey);
    if (!page || page.locked) return false;
    return JSON.stringify(sections) !== JSON.stringify(normalizePageDraft(page, pageSectionsFor(status, page.key)));
  });

  useEffect(() => {
    const cloned = Object.fromEntries(
      Object.entries(draftByPage).map(([key, sections]) => [key, cloneSections(sections)]),
    );
    if (hasAnyDirty) persistVisualDraft(status, cloned);
    else clearPersistedVisualDraft(status);
    onDraftChange(cloned);
  }, [draftByPage, hasAnyDirty, onDraftChange, status]);

  useEffect(() => {
    if (!hasAnyDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasAnyDirty]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as {
        type?: string;
        pageKey?: string;
        sectionId?: string;
        field?: string;
        value?: string;
      };
      if (!message || typeof message !== "object") return;
      if (message.type !== "pillar:inline-edit" && message.type !== "pillar:inline-select") return;
      if (previewOrigin && event.origin !== previewOrigin) return;
      if (!message.pageKey || SYSTEM_MANAGED_PAGE_KEYS.has(message.pageKey)) return;
      const page = pages.find(item => item.key === message.pageKey);
      if (!page || page.locked) return;
      onSelectedPageKeyChange(message.pageKey);
      if (message.sectionId) setSelectedId(message.sectionId);

      if (
        message.type === "pillar:inline-edit" &&
        message.sectionId &&
        typeof message.value === "string" &&
        (message.field === "title" || message.field === "subtitle" || message.field === "body")
      ) {
        setDraftByPage(current => ({
          ...current,
          [message.pageKey!]: (current[message.pageKey!] ?? normalizePageDraft(page, pageSectionsFor(status, page.key))).map(section => (
            section.id === message.sectionId ? { ...section, [message.field!]: message.value } : section
          )),
        }));
        setMessage("Inline edit added to your draft. Publish when it looks right.");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [pages, status, onSelectedPageKeyChange, previewOrigin]);

  function setCurrentDraft(updater: (current: HomepageSectionBlock[]) => HomepageSectionBlock[]) {
    setDraftByPage(current => ({
      ...current,
      [selectedPage.key]: updater(current[selectedPage.key] ?? normalizePageDraft(selectedPage, pageSectionsFor(status, selectedPage.key))),
    }));
  }

	  function updateSelected(patch: Partial<HomepageSectionBlock>) {
    setLastRemoved(null);
	    setCurrentDraft(current => current.map(section => (
	      section.id === selected?.id ? { ...section, ...patch } : section
	    )));
  }

	  function moveSelected(direction: -1 | 1) {
	    if (!selected) return;
    moveSection(selected.id, direction);
	  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    setCurrentDraft(current => {
      const index = current.findIndex(section => section.id === sectionId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = cloneSections(current);
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
	    });
    setSelectedId(sectionId);
	  }

		  function reorderSection(dragId: string, targetId: string) {
		    if (dragId === targetId) return;
			    setCurrentDraft(current => {
	      const from = current.findIndex(section => section.id === dragId);
	      const to = current.findIndex(section => section.id === targetId);
	      if (from < 0 || to < 0) return current;
	      const next = cloneSections(current);
	      const [item] = next.splice(from, 1);
	      next.splice(to, 0, item);
	      return next;
	    });
		    setSelectedId(dragId);
		  }

  function deleteSection(sectionId: string) {
    if (draft.length <= 1) {
      setMessage("Keep at least one section on the page.");
      return;
    }
    const index = draft.findIndex(section => section.id === sectionId);
    if (index < 0) return;
    const next = draft.filter(section => section.id !== sectionId);
    setDraftByPage(current => ({ ...current, [selectedPage.key]: next }));
    setLastRemoved({ pageKey: selectedPage.key, section: draft[index], index });
    if (selectedId === sectionId) {
      setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? next[0]?.id ?? "");
    }
    setMessage(`${sectionLabel(draft[index].type)} removed from this draft.`);
  }

  function undoRemoveSection() {
    if (!lastRemoved) return;
    setDraftByPage(current => {
      const pageDraft = current[lastRemoved.pageKey] ?? [];
      const next = cloneSections(pageDraft);
      next.splice(Math.min(lastRemoved.index, next.length), 0, lastRemoved.section);
      return { ...current, [lastRemoved.pageKey]: next };
    });
    onSelectedPageKeyChange(lastRemoved.pageKey);
    setSelectedId(lastRemoved.section.id);
    setLastRemoved(null);
    setMessage("Section restored to your draft.");
  }

  function addTemplate(templateType: string) {
    const template = APPROVED_SECTION_TEMPLATES.find(item => item.type === templateType);
    if (!template) return;
    const id = `${template.type}-${Date.now()}`;
    const section: HomepageSectionBlock = {
      id,
      type: template.type,
      title: template.title,
      body: template.body,
      visible: true,
      data: {},
    };
		    setCurrentDraft(current => [...current, section]);
    setLastRemoved(null);
	    setSelectedId(id);
	    setMessage("Template added to your draft. Publish when it looks right.");
  }

  async function handleImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selected) return;
    if (!isImageFile(file)) {
      setError("Please choose an image file.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const imageUrl = await uploadImage(file);
      updateSelected({ imageUrl });
      setMessage("Image added to this draft section.");
    } catch {
      setError("Image upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function publishDraft() {
    if (selectedPage.locked) {
      setError(selectedPage.helper ?? "This page is managed elsewhere.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await csrfFetch("/api/community-site/page-sections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageKey: selectedPage.key, sections: draft }),
      });
      const data = await readJson<{ ok?: boolean; error?: string }>(res) ?? {};
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not publish page sections");
      }
      clearPersistedVisualDraft(status);
      const statusRes = await csrfFetch("/api/community-site/target");
	      if (statusRes.ok) {
	        const statusData = await readJson<SiteStatusData>(statusRes);
	        if (statusData) onPublished(statusData);
	      }
      setLastRemoved(null);
	      setMessage("Published. The preview will refresh with the saved page draft.");
      onRefreshPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish page sections");
    } finally {
      setSaving(false);
    }
  }

	  return (
	    <aside className="h-full border-l border-white/10 bg-[#08111f] flex flex-col">
	      <div className="border-b border-white/10 p-3">
	        <div className="flex items-center justify-between gap-2">
	          <div>
		            <p className="text-xs uppercase tracking-wide text-[#7a9cbf] font-medium">Edit page</p>
			            <p className="text-sm text-white">Edit this page</p>
	          </div>
	          <LayoutList className="w-4 h-4 text-[#d4a017]" />
	        </div>
			        <p className="mt-2 text-[11px] text-[#7a9cbf]">Choose a page, drag sections to reorder, or remove sections you do not need. Your site design stays consistent.</p>
		      </div>

		      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-4">
		        <div className="space-y-2">
			          <p className="text-xs uppercase tracking-wide text-[#7a9cbf] font-medium">Choose page</p>
		          <div className="grid grid-cols-2 gap-2">
		            {pages.map(page => (
		              <button
		                key={page.key}
		                type="button"
		                data-testid={`visual-editor-page-${page.key.replace(/[^a-z0-9_-]+/g, "-")}`}
		                onClick={() => {
		                  onSelectedPageKeyChange(page.key);
		                  const nextDraft = draftByPage[page.key] ?? normalizePageDraft(page, pageSectionsFor(status, page.key));
		                  setSelectedId(nextDraft[0]?.id ?? "");
		                }}
		                className={`rounded-md border px-2 py-1.5 text-xs text-left ${
		                  selectedPage.key === page.key
		                    ? "border-[#d4a017]/70 bg-[#d4a017]/10 text-[#f2d27a]"
		                    : "border-[#1e3a5f] bg-[#0f1a2e] text-[#c8d8e8] hover:border-[#7a9cbf]/60"
		                }`}
		              >
		                {page.label}
		              </button>
		            ))}
		          </div>
		        </div>

		        {selectedPage.locked && (
		          <div data-testid="page-locked-helper" className="rounded-lg border border-[#d4a017]/30 bg-[#d4a017]/10 px-3 py-2 text-xs leading-relaxed text-[#f2d27a]">
		            <p>{selectedPage.helper ?? "This page is managed elsewhere."}</p>
		            {selectedPage.key === "events" && (
		              <Link to="/dashboard/events" className="mt-2 inline-flex items-center gap-1 font-semibold text-[#f2d27a] underline underline-offset-2 hover:text-white">
		                Open Events tab <ExternalLink className="w-3 h-3" />
		              </Link>
		            )}
		          </div>
		        )}

		        {!selectedPage.locked && (
		        <>
		        <div className="space-y-2">
			          <p className="text-xs uppercase tracking-wide text-[#7a9cbf] font-medium">Sections on this page</p>
	          {draft.map((section) => (
		            <div
		              key={section.id}
		              draggable
		              data-testid={`homepage-section-row-${section.type}`}
		              onClick={() => setSelectedId(section.id)}
	              onDragStart={(event) => {
	                setDraggingId(section.id);
	                event.dataTransfer.effectAllowed = "move";
	                event.dataTransfer.setData("application/x-pillar-section", section.id);
	              }}
	              onDragOver={(event) => {
	                event.preventDefault();
	                event.dataTransfer.dropEffect = "move";
	                setDropTargetId(section.id);
	              }}
	              onDragLeave={() => setDropTargetId(current => current === section.id ? null : current)}
	              onDrop={(event) => {
	                event.preventDefault();
	                const dragId = event.dataTransfer.getData("application/x-pillar-section") || draggingId;
	                if (dragId) reorderSection(dragId, section.id);
	                setDraggingId(null);
	                setDropTargetId(null);
	              }}
	              onDragEnd={() => {
	                setDraggingId(null);
	                setDropTargetId(null);
	              }}
		              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
		                selected?.id === section.id
		                  ? "border-[#d4a017]/70 bg-[#d4a017]/10"
	                  : dropTargetId === section.id
	                    ? "border-[#d4a017]/50 bg-[#d4a017]/5"
		                  : "border-[#1e3a5f] bg-[#0f1a2e] hover:border-[#7a9cbf]/60"
		              }`}
		            >
		              <div className="flex items-center gap-2">
		                <button
		                  type="button"
		                  onClick={() => setSelectedId(section.id)}
		                  className="min-w-0 flex flex-1 items-center gap-2 text-left"
		                  title="Drag to reorder, click to edit"
		                  aria-label={`Select ${sectionLabel(section.type)} section`}
		                >
		                  <GripVertical className="w-3.5 h-3.5 shrink-0 text-[#7a9cbf]" />
		                  <span className="min-w-0">
		                    <span className="block text-sm text-white truncate">{sectionDisplayTitle(section)}</span>
		                    <span className="block text-[11px] text-[#7a9cbf] truncate">{sectionDescription(section.type)}</span>
		                  </span>
		                </button>
		                <button
		                  type="button"
		                  onClick={(event) => {
		                    event.stopPropagation();
		                    moveSection(section.id, -1);
		                  }}
		                  disabled={draft.findIndex(item => item.id === section.id) <= 0}
		                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-[#c8d8e8] hover:bg-white/5 disabled:opacity-40"
		                  title={`Move ${sectionLabel(section.type)} up`}
		                  aria-label={`Move ${sectionLabel(section.type)} up`}
		                >
		                  <MoveUp className="w-3.5 h-3.5" />
		                </button>
		                <button
		                  type="button"
		                  onClick={(event) => {
		                    event.stopPropagation();
		                    moveSection(section.id, 1);
		                  }}
		                  disabled={draft.findIndex(item => item.id === section.id) >= draft.length - 1}
		                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-[#c8d8e8] hover:bg-white/5 disabled:opacity-40"
		                  title={`Move ${sectionLabel(section.type)} down`}
		                  aria-label={`Move ${sectionLabel(section.type)} down`}
		                >
		                  <MoveDown className="w-3.5 h-3.5" />
		                </button>
		                <button
		                  type="button"
		                  data-testid={`homepage-section-delete-${section.type}`}
		                  onClick={(event) => {
		                    event.stopPropagation();
		                    deleteSection(section.id);
		                  }}
		                  disabled={draft.length <= 1}
		                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-red-500/25 text-red-300 hover:bg-red-500/10 hover:text-red-200 disabled:opacity-40 disabled:hover:bg-transparent"
		                  title={`Remove ${sectionLabel(section.type)}`}
		                  aria-label={`Remove ${sectionLabel(section.type)}`}
		                >
		                  <Trash2 className="w-3.5 h-3.5" />
		                </button>
		              </div>
		            </div>
			          ))}
		        </div>

			        </>
			        )}

		        {!selectedPage.locked && selected && (
	          <div className="space-y-3 border-t border-white/10 pt-4">
		            <div className="flex items-center justify-between gap-2">
		              <div>
		                <p className="text-xs uppercase tracking-wide text-[#7a9cbf] font-medium">Selected section</p>
		                <p className="text-sm text-white">{sectionDisplayTitle(selected)}</p>
		                <p className="text-[11px] text-[#4a6a8a]">{sectionDescription(selected.type)}</p>
		              </div>
		              <div className="flex items-center gap-1">
	                <button
	                  type="button"
	                  data-testid={`homepage-section-move-up-${selected.type}`}
	                  onClick={() => moveSelected(-1)}
	                  disabled={draft.findIndex(section => section.id === selected.id) <= 0}
	                  className="h-7 w-7 rounded-md border border-white/10 text-[#c8d8e8] hover:bg-white/5 disabled:opacity-40"
	                  title="Move section up"
	                  aria-label="Move selected section up"
	                >
	                  <MoveUp className="w-3.5 h-3.5 mx-auto" />
	                </button>
	                <button
	                  type="button"
	                  data-testid={`homepage-section-move-down-${selected.type}`}
	                  onClick={() => moveSelected(1)}
	                  disabled={draft.findIndex(section => section.id === selected.id) >= draft.length - 1}
	                  className="h-7 w-7 rounded-md border border-white/10 text-[#c8d8e8] hover:bg-white/5 disabled:opacity-40"
	                  title="Move section down"
	                  aria-label="Move selected section down"
	                >
	                  <MoveDown className="w-3.5 h-3.5 mx-auto" />
	                </button>
	              </div>
	            </div>

		            {selectedIsSystemManaged ? (
		              <div
		                data-testid="homepage-section-locked-helper"
			                className="rounded-lg border border-[#d4a017]/30 bg-[#d4a017]/10 px-3 py-2 text-xs leading-relaxed text-[#f2d27a]"
			              >
			                <p>This content is managed from Events. You can reorder or remove this section here.</p>
			                <Link to="/dashboard/events" className="mt-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-white">
			                  Open Events tab <ExternalLink className="w-3 h-3" />
			                </Link>
			              </div>
		            ) : (
		              <>
		                <p className="text-xs text-[#7a9cbf]">
		                  Edit this section's copy below. Changes appear in the preview immediately and stay unsaved until you publish.
		                </p>
		                <label className="block text-xs text-[#7a9cbf]">
		                  Title
		                  <input
		                    data-testid="homepage-section-title-input"
		                    value={selected.title ?? ""}
		                    onChange={event => updateSelected({ title: event.target.value })}
		                    className="mt-1 w-full bg-[#060f1e] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#4a6a8a] focus:outline-none focus:border-[#d4a017]"
		                  />
		                </label>
		                <label className="block text-xs text-[#7a9cbf]">
		                  Subtitle
		                  <input
		                    data-testid="homepage-section-subtitle-input"
		                    value={selected.subtitle ?? ""}
		                    onChange={event => updateSelected({ subtitle: event.target.value })}
		                    className="mt-1 w-full bg-[#060f1e] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#4a6a8a] focus:outline-none focus:border-[#d4a017]"
		                  />
		                </label>
		                <label className="block text-xs text-[#7a9cbf]">
		                  Body copy
		                  <Textarea
		                    data-testid="homepage-section-body-input"
		                    value={selected.body ?? ""}
		                    onChange={event => updateSelected({ body: event.target.value })}
		                    rows={4}
		                    className="mt-1 bg-[#060f1e] border-[#1e3a5f] text-white placeholder:text-[#4a6a8a] focus:border-[#d4a017] resize-none"
		                  />
		                </label>
		              </>
		            )}
				            <button
				              type="button"
				              data-testid={`homepage-section-delete-selected-${selected.type}`}
				              onClick={() => deleteSection(selected.id)}
				              disabled={draft.length <= 1}
				              className="inline-flex items-center gap-1.5 text-xs text-red-300 hover:text-red-200 disabled:opacity-40"
				              title={`Remove ${sectionLabel(selected.type)}`}
				              aria-label={`Remove ${sectionLabel(selected.type)} from this page`}
				            >
				              <Trash2 className="w-3.5 h-3.5" />
				              Remove this section from the page
				            </button>
		            {!selectedIsSystemManaged && (
		              <>
		                <button
		                  type="button"
		                  onClick={() => fileRef.current?.click()}
		                  disabled={uploading}
		                  className="w-full rounded-lg border border-[#1e3a5f] bg-[#0f1a2e] px-3 py-2 text-sm text-[#c8d8e8] hover:border-[#d4a017]/50 disabled:opacity-50 flex items-center justify-center gap-2"
		                >
		                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
		                  Replace section image
		                </button>
		                {selected.imageUrl && (
		                  <div className="rounded-lg overflow-hidden border border-[#1e3a5f] bg-[#060f1e]">
		                    <img src={selected.imageUrl} alt="" className="w-full h-24 object-cover" />
		                  </div>
		                )}
		              </>
		            )}
		          </div>
		        )}

			        {!selectedPage.locked && (
			          <div className="space-y-2 border-t border-white/10 pt-4">
			            <p className="text-xs uppercase tracking-wide text-[#7a9cbf] font-medium">Add a section</p>
			            <div className="grid grid-cols-1 gap-2">
			              {APPROVED_SECTION_TEMPLATES.map(template => (
			                <button
			                  key={template.type}
			                  type="button"
			                  onClick={() => addTemplate(template.type)}
			                  className="rounded-lg border border-[#1e3a5f] bg-[#0f1a2e] px-3 py-2 text-left hover:border-[#d4a017]/50"
			                >
			                  <span className="text-sm text-[#c8d8e8]">{template.title}</span>
			                  <span className="block text-[11px] text-[#7a9cbf]">{template.description}</span>
			                </button>
			              ))}
			            </div>
			          </div>
			        )}

			        {message && (
		          <p className="flex items-center gap-2 text-xs text-green-300">
		            <span>{message}</span>
		            {lastRemoved && (
		              <button
		                type="button"
		                onClick={undoRemoveSection}
		                className="font-semibold text-[#f2d27a] underline underline-offset-2 hover:text-[#d4a017]"
		              >
		                Undo
		              </button>
		            )}
		          </p>
		        )}
	        {error && (
	          <p className="text-xs text-red-400 flex items-center gap-1">
	            <AlertCircle className="w-3 h-3" />{error}
	          </p>
	        )}
	      </div>

		      <div className="border-t border-white/10 p-3 space-y-2">
		        <p className="text-[11px] text-[#7a9cbf]">Previewing draft changes. Publish when ready.</p>
		        <div className="flex items-center justify-between gap-2">
		        <button
		          type="button"
		          onClick={() => {
	            const next = normalizePageDraft(selectedPage, pageSectionsFor(status, selectedPage.key));
		            setDraftByPage(current => ({ ...current, [selectedPage.key]: next }));
		            setSelectedId(next[0]?.id ?? "hero");
		            setLastRemoved(null);
		            setMessage("Draft reset.");
	          }}
		          disabled={!selectedDirty || saving || selectedPage.locked}
	          className="text-xs text-[#7a9cbf] hover:text-white disabled:opacity-40"
	        >
	          Reset draft
	        </button>
	        <button
	          type="button"
		          data-testid="page-sections-publish"
	          onClick={() => void publishDraft()}
	          disabled={!selectedDirty || saving || selectedPage.locked}
	          className="inline-flex items-center gap-2 rounded-lg bg-[#d4a017] px-4 py-2 text-xs font-semibold text-black hover:bg-[#b88a14] disabled:opacity-50"
	        >
		          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
		          Publish
		        </button>
		        </div>
		      </div>

	      <input
	        ref={fileRef}
	        type="file"
	        accept="image/*"
	        className="hidden"
	        onChange={event => void handleImageSelected(event)}
	      />
	    </aside>
	  );
}

function BrandingPanel({
  status,
  onLogoChanged,
  onHeroChanged,
}: {
  status: SiteStatusData;
  onLogoChanged: () => void;
  onHeroChanged: () => void;
}) {
  return (
    <aside className="h-full border-l border-white/10 bg-[#08111f] flex flex-col">
      <div className="border-b border-white/10 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#7a9cbf] font-medium">Branding</p>
            <p className="text-sm text-white">Logo, colors, and homepage image</p>
          </div>
          <ImageIcon className="w-4 h-4 text-[#d4a017]" />
        </div>
        <p className="mt-2 text-[11px] text-[#7a9cbf]">
          These settings apply across the public site. Use the preview to check the homepage header after changes.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-4">
        {status.configSummary?.orgName && (
          <div className="rounded-xl bg-[#0f1a2e] border border-[#1e3a5f] p-4 space-y-3">
            <p className="text-xs text-[#7a9cbf] font-medium uppercase tracking-wide">Current brand</p>
            <div>
              <p className="text-white font-semibold text-sm">{status.configSummary.orgName}</p>
              {status.configSummary.tagline && (
                <p className="text-xs text-[#7a9cbf] italic">"{status.configSummary.tagline}"</p>
              )}
              {status.configSummary.location && (
                <p className="text-xs text-[#c8d8e8] mt-1">{status.configSummary.location}</p>
              )}
            </div>
            {(status.configSummary.primaryColor || status.configSummary.accentColor) && (
              <div className="flex flex-wrap items-center gap-3">
                {status.configSummary.primaryColor && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded border border-white/20" style={{ backgroundColor: status.configSummary.primaryColor }} />
                    <span className="text-xs text-[#7a9cbf]">Primary</span>
                  </div>
                )}
                {status.configSummary.accentColor && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded border border-white/20" style={{ backgroundColor: status.configSummary.accentColor }} />
                    <span className="text-xs text-[#7a9cbf]">Accent</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <LogoImagePanel
          logoUrl={status.logoUrl}
          onLogoChanged={onLogoChanged}
        />

        <HeroImagePanel
          initialUrl={status.heroImageUrl}
          initialVisualType={status.heroVisualType}
          onHeroChanged={onHeroChanged}
        />
      </div>
    </aside>
  );
}

// ── Site management view (shown on return visits after site is built) ─────────

function SiteManagementView({
  status,
  onStatusChange,
  onRestart,
  onAiEdit,
  aiLoading,
  aiError,
  aiSuccessMessage,
  siteEditVersion,
}: {
  status: SiteStatusData;
  onStatusChange: (status: SiteStatusData) => void;
  onRestart: () => void;
  onAiEdit: (req: string) => void;
  aiLoading: boolean;
  aiError: string | null;
  aiSuccessMessage?: string | null;
  siteEditVersion: number;
}) {
  const [aiInput, setAiInput] = useState("");
  const [copied, setCopied]   = useState(false);
  const [sectionEditorOpen, setSectionEditorOpen] = useState(true);
  const [activeToolPanel, setActiveToolPanel] = useState<SiteToolPanel>("edit");
  const [selectedVisualPageKey, setSelectedVisualPageKey] = useState("home");
		  const previewUrl =
		    isLocalDashboardHost() && status.localPreviewUrl
		      ? resolvePreviewUrl(status.localPreviewUrl)
		      : status.url ?? "";
  const selectedPreviewUrl = previewUrl
    ? `${previewUrl.replace(/\/$/, "")}${pagePath(selectedVisualPageKey) === "/" ? "" : pagePath(selectedVisualPageKey)}`
    : "";
  const previewModeUrl = selectedPreviewUrl ? withPreviewMode(selectedPreviewUrl) : "";
		  const publicUrl = status.url ?? previewUrl;
	  const [previewKey, setPreviewKey] = useState(0);
	  const [previewSrc, setPreviewSrc] = useState(previewModeUrl);
	  const [previewHistory, setPreviewHistory] = useState<string[]>(previewModeUrl ? [previewModeUrl] : []);
	  const [previewIndex, setPreviewIndex] = useState(previewModeUrl ? 0 : -1);
  const [draftPreviewSections, setDraftPreviewSections] = useState<Record<string, HomepageSectionBlock[]> | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const previewOrigin = originForUrl(previewSrc || previewModeUrl);

  const postDraftToPreview = useCallback((drafts: Record<string, HomepageSectionBlock[]> | null) => {
    if (!drafts) return;
    const targetOrigin = originForUrl(previewSrc || previewModeUrl);
    if (!targetOrigin) return;
    previewFrameRef.current?.contentWindow?.postMessage({
      type: "pillar:preview-config",
      patch: {
        homepageSections: drafts.home,
        pageSections: drafts,
      },
    }, targetOrigin);
  }, [previewModeUrl, previewSrc]);

  const handleDraftChange = useCallback((drafts: Record<string, HomepageSectionBlock[]>) => {
    setDraftPreviewSections(drafts);
  }, []);

	  useEffect(() => {
	    if (!previewUrl) {
	      setPreviewSrc("");
	      setPreviewHistory([]);
	      setPreviewIndex(-1);
      setDraftPreviewSections(null);
	      return;
	    }
	    setPreviewSrc(previewModeUrl);
	    setPreviewHistory([previewModeUrl]);
	    setPreviewIndex(0);
	  }, [previewUrl, previewModeUrl]);

  useEffect(() => {
    if (!draftPreviewSections) return;
    const timeout = window.setTimeout(() => postDraftToPreview(draftPreviewSections), 0);
    return () => window.clearTimeout(timeout);
  }, [draftPreviewSections, previewKey, previewSrc, postDraftToPreview]);

	  useEffect(() => {
	    if (siteEditVersion > 0) refreshPreview();
	  }, [siteEditVersion]);

  function copyUrl() {
    if (!publicUrl) return;
    void navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function reloadSiteStatus() {
    try {
      const statusRes = await csrfFetch("/api/community-site/target");
      if (!statusRes.ok) return;
      const statusData = await readJson<SiteStatusData>(statusRes);
      if (statusData) onStatusChange(statusData);
    } catch {
      // The preview refresh still runs; status will refresh on the next load.
    }
  }

	  function refreshPreview() {
	    setPreviewKey((current) => current + 1);
	    setPreviewSrc((current) => current || previewModeUrl || "");
	  }

  function handleLogoChanged() {
    void reloadSiteStatus();
    refreshPreview();
  }

  function handleHeroChanged() {
    void reloadSiteStatus();
    refreshPreview();
  }

  function goPreviewBack() {
    if (previewIndex <= 0) return;
	    const nextIndex = previewIndex - 1;
	    setPreviewIndex(nextIndex);
	    setPreviewSrc(previewHistory[nextIndex] ?? previewModeUrl ?? "");
	    setPreviewKey((current) => current + 1);
	  }

  function goPreviewForward() {
    if (previewIndex < 0 || previewIndex >= previewHistory.length - 1) return;
		    const nextIndex = previewIndex + 1;
		    setPreviewIndex(nextIndex);
		    setPreviewSrc(previewHistory[nextIndex] ?? previewModeUrl ?? "");
		    setPreviewKey((current) => current + 1);
		  }

  const editorPages = buildEditorPages(status);
  const selectedPreviewPage = editorPages.find(page => page.key === selectedVisualPageKey) ?? editorPages[0];
  const previewStateText = aiLoading
    ? "Drafting changes..."
    : draftPreviewSections
      ? "Previewing unsaved draft"
      : "Showing live site";

  const toolPanels: Array<{
    id: SiteToolPanel;
    title: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "edit",
      title: "Edit this page",
      description: "Change copy, reorder sections, add approved blocks, then publish.",
      icon: <LayoutList className="w-4 h-4" />,
    },
    {
      id: "pages",
      title: "Pages & menu",
      description: "Add custom pages, review existing pages, or remove pages.",
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: "brand",
      title: "Branding",
      description: "Update the logo, colors, and homepage top image.",
      icon: <ImageIcon className="w-4 h-4" />,
    },
  ];

  function openToolPanel(panel: SiteToolPanel) {
    setActiveToolPanel(panel);
    setSectionEditorOpen(true);
  }

  const aiQuickPrompts = [
    "Update our About page with our latest service work",
    "Create a Scholarships page with a request information form",
    "Delete the Service Projects page",
    "Change our contact email",
    "Add a photo to the homepage",
    "Update our colors",
  ];

  const aiUpdatePanel = (
    <div className="rounded-2xl border border-[#d4a017]/45 bg-[radial-gradient(circle_at_top_left,rgba(212,160,23,0.22),rgba(15,26,46,0.98)_38%,rgba(8,17,31,1)_100%)] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d4a017]/40 bg-[#d4a017]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#f2d27a]">
            <Sparkles className="w-3.5 h-3.5" />
            AI Website Updates
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Tell Pillar what changed. It updates the site for you.</h2>
            <p className="mt-1 max-w-2xl text-sm text-[#a8bdd4]">
              Use plain language for page edits, new sections, forms, photos, contact info, colors, or menu changes. You can review changes before they go live.
            </p>
          </div>
        </div>
        <button
          onClick={() => { if (aiInput.trim()) onAiEdit(aiInput.trim()); }}
          disabled={aiLoading || !aiInput.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#d4a017] px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#b88a14] disabled:opacity-50 lg:min-w-36"
        >
          {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
	          {aiLoading ? "Drafting..." : "Apply changes"}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <textarea
          value={aiInput}
          onChange={e => setAiInput(e.target.value)}
          placeholder='Try: "Create a Scholarships page with three scholarship levels and a request information form"'
          rows={4}
          className="w-full resize-none rounded-xl border border-[#d4a017]/35 bg-[#060f1e]/90 px-3 py-2.5 text-sm text-white placeholder:text-[#6f89a6] transition-colors focus:border-[#d4a017] focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {aiQuickPrompts.map(prompt => (
            <button
              key={prompt}
              type="button"
              onClick={() => setAiInput(prompt)}
              className="rounded-full border border-[#d4a017]/25 bg-[#d4a017]/10 px-3 py-1.5 text-xs text-[#f2d27a] transition-colors hover:border-[#d4a017]/60 hover:bg-[#d4a017]/15"
            >
              {prompt}
            </button>
          ))}
        </div>
        {aiError && (
          <p className="flex items-center gap-1 text-xs text-red-300">
            <AlertCircle className="w-3 h-3" />{aiError}
          </p>
        )}
        {aiSuccessMessage && !aiLoading && (
          <p className="flex items-center gap-2 text-xs text-green-300">
            <CheckCircle2 className="w-3 h-3" />
            {aiSuccessMessage}
          </p>
        )}
        {aiLoading && (
          <p className="flex items-center gap-2 text-xs text-[#f2d27a]" aria-live="polite">
            <Loader2 className="w-3 h-3 animate-spin" />
            Drafting a safe update for review.
          </p>
        )}
        <div className="flex items-center justify-between border-t border-[#d4a017]/15 pt-2">
          <p className="text-xs text-[#7a9cbf]">Prefer a full reset?</p>
          <button
            onClick={onRestart}
            className="flex items-center gap-1 text-xs text-[#7a9cbf] transition-colors hover:text-white"
          >
            <RotateCcw className="w-3 h-3" /> Rebuild from scratch
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5 py-6">
      {aiUpdatePanel}

      <div className="rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-green-300">Site is live</span>
            </div>
            {publicUrl && (
              <div className="mt-1 flex items-center gap-2 min-w-0">
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-sm text-green-400 underline underline-offset-2 hover:text-green-300"
                >
                  {publicUrl}
                </a>
                <button onClick={copyUrl} className="flex-shrink-0 text-green-400/70 hover:text-green-300 transition-colors" title="Copy URL">
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/dashboard/domains" className="text-xs font-medium text-green-400 hover:text-green-300 underline underline-offset-2">
              Connect a domain
            </Link>
            {publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-green-500/30 px-3 py-1.5 text-xs font-medium text-green-300 hover:bg-green-500/10"
              >
                Open site <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {toolPanels.map(tool => (
          <button
            key={tool.id}
            type="button"
            onClick={() => openToolPanel(tool.id)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              activeToolPanel === tool.id && sectionEditorOpen
                ? "border-[#d4a017]/70 bg-[#d4a017]/10"
                : "border-[#1e3a5f] bg-[#0f1a2e] hover:border-[#d4a017]/45 hover:bg-[#12203a]"
            }`}
          >
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
              activeToolPanel === tool.id && sectionEditorOpen
                ? "bg-[#d4a017]/20 text-[#f2d27a]"
                : "bg-[#1e3a5f] text-[#7a9cbf]"
            }`}>
              {tool.icon}
            </span>
            <span className="mt-3 block text-sm font-semibold text-white">{tool.title}</span>
            <span className="mt-1 block text-xs leading-relaxed text-[#7a9cbf]">{tool.description}</span>
          </button>
        ))}
      </div>

      {previewUrl && (
        <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0f1a2e]">
          <div className="flex flex-col gap-3 border-b border-white/10 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-300">Preview</span>
                {selectedPreviewPage && (
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-[#7a9cbf]">
                    {selectedPreviewPage.label}
                  </span>
                )}
                <span className="rounded-full border border-[#d4a017]/25 bg-[#d4a017]/10 px-2 py-0.5 text-[11px] text-[#f2d27a]">
                  {previewStateText}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#7a9cbf]">
                Draft edits update here before you publish.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSectionEditorOpen(open => !open)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                  sectionEditorOpen
                    ? "border-[#d4a017]/50 bg-[#d4a017]/10 text-[#f2d27a]"
                    : "border-white/10 text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {sectionEditorOpen ? "Hide tools" : "Show tools"}
              </button>
              <button
                type="button"
                onClick={goPreviewBack}
                disabled={previewIndex <= 0}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-300"
                title="Back"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={goPreviewForward}
                disabled={previewIndex < 0 || previewIndex >= previewHistory.length - 1}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-300"
                title="Forward"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={refreshPreview}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#d4a017] hover:text-[#b88a14] flex items-center gap-1"
              >
                Open full site <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className={sectionEditorOpen ? "grid lg:grid-cols-[minmax(0,1fr)_390px]" : ""}>
            <div className="relative w-full min-h-[520px] bg-white">
              <iframe
                ref={previewFrameRef}
                key={previewKey}
                src={previewSrc}
                className="absolute inset-0 w-full h-full border-0"
                title="Site preview"
                sandbox="allow-scripts allow-same-origin"
                onLoad={() => postDraftToPreview(draftPreviewSections)}
              />
            </div>
            {sectionEditorOpen && activeToolPanel === "edit" && (
              <PageVisualEditor
                status={status}
                selectedPageKey={selectedVisualPageKey}
                onSelectedPageKeyChange={setSelectedVisualPageKey}
                onPublished={onStatusChange}
                onDraftChange={handleDraftChange}
                onRefreshPreview={refreshPreview}
                previewOrigin={previewOrigin}
              />
            )}
            {sectionEditorOpen && activeToolPanel === "pages" && (
              <aside className="h-full border-l border-white/10 bg-[#08111f] p-3">
                <ManualWebsiteEditor
                  status={status}
                  embedded
                  onPagesChanged={(nextStatus) => {
                    onStatusChange(nextStatus);
                    refreshPreview();
                  }}
                />
              </aside>
            )}
            {sectionEditorOpen && activeToolPanel === "brand" && (
              <BrandingPanel
                status={status}
                onLogoChanged={handleLogoChanged}
                onHeroChanged={handleHeroChanged}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
	}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CommunityBuilder() {
  const { data: orgData } = useGetOrganization();
  const org = orgData?.organization;
  const tier = (org as { tier?: string | null } | undefined)?.tier ?? null;

  const filteredQuestions = getFilteredQuestions(tier);
  const totalSteps = filteredQuestions.length;

  const autoAnswers = getAutoAnswers(tier);

  const [started, setStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | boolean | null>>(autoAnswers);
  const [chatItems, setChatItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [finalizingPayload, setFinalizingPayload] = useState(false);
  const [finalizeError, setFinalizeError] = useState(false);
  const [readyPayload, setReadyPayload] = useState<Record<string, unknown> | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisioningIsNew, setProvisioningIsNew] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{
    ok: boolean;
    siteUrl?: string;
    error?: string;
    canRetry?: boolean;
    isNewSite?: boolean;
  } | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [crawling, setCrawling] = useState(false);

  // ── Site status (loaded on mount) ───────────────────────────────────────────
  const [siteStatus, setSiteStatus]               = useState<SiteStatusData | null>(null);
  const [siteStatusLoading, setSiteStatusLoading] = useState(true);
  const [editMode, setEditMode]                   = useState(false);
  const [aiEditLoading, setAiEditLoading]         = useState(false);
  const [aiEditError, setAiEditError]             = useState<string | null>(null);
  const [aiEditSuccessMessage, setAiEditSuccessMessage] = useState<string | null>(null);
  const [siteEditVersion, setSiteEditVersion] = useState(0);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const isInterviewDone = stepIndex >= totalSteps;
  const currentQuestion = !isInterviewDone ? filteredQuestions[stepIndex] : null;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatItems, stepIndex, finalizingPayload, readyPayload]);

  useEffect(() => {
    if (started && currentQuestion?.type === "text" || currentQuestion?.type === "textarea") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [stepIndex, started, currentQuestion?.type]);

  // Fetch site status on mount to detect return visits
  useEffect(() => {
    csrfFetch("/api/community-site/target")
      .then(async r => {
        if (!r.ok) throw new Error("Could not load community site status");
        const data = await readJson<SiteStatusData>(r);
        if (!data) throw new Error("Community site status was empty");
        return data;
      })
      .then((d: SiteStatusData) => {
        setSiteStatus(d);
        setSiteStatusLoading(false);
      })
      .catch(() => setSiteStatusLoading(false));
  }, []);

  async function submitAiEdit(changeRequest: string) {
    setAiEditLoading(true);
    setAiEditError(null);
    setAiEditSuccessMessage(null);
    try {
      const res = await csrfFetch("/api/community-site/ai-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeRequest }),
      });
      const d = await readJson<{
        ok?: boolean;
        status?: "completed" | "prepared";
        payload?: Record<string, unknown>;
        message?: string;
        error?: string;
      }>(res) ?? {};
      if (!res.ok || !d.ok) {
        setAiEditError(d.error ?? "Something went wrong. Please try again.");
      } else if (d.status === "completed") {
        setReadyPayload(null);
        setProvisionResult(null);
        setEditMode(false);
        setAiEditSuccessMessage(d.message ?? "Update completed.");
        try {
          const statusRes = await csrfFetch("/api/community-site/target");
          if (statusRes.ok) {
            const statusData = await readJson<SiteStatusData>(statusRes);
            if (statusData) setSiteStatus(statusData);
          }
        } catch {
          // Non-fatal. The saved update has already been verified server-side.
        }
        setSiteEditVersion(version => version + 1);
      } else if (d.payload) {
        // Load the updated payload for review — PayloadPreview + Launch button appear automatically.
        setReadyPayload(d.payload);
        setProvisionResult(null);
        setEditMode(false);
      } else {
        setAiEditError("Something went wrong. Please try again.");
      }
    } catch {
      setAiEditError("Something went wrong. Please try again.");
    } finally {
      setAiEditLoading(false);
    }
  }

  // ── Ack fetch (fire-and-forget, never blocks progress) ──────────────────────
  async function fetchAck(fieldId: string, value: string, itemId: string) {
    try {
      const res = await csrfFetch("/api/community-site/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId, value, isSkip: false }),
      });
      const d = res.ok
        ? (await readJson<{ ack: string }>(res) ?? { ack: "Got it." })
        : { ack: "Got it." };
      setChatItems(prev =>
        prev.map(item => item.id === itemId ? { ...item, ackText: d.ack, ackLoading: false } : item),
      );
    } catch {
      setChatItems(prev =>
        prev.map(item => item.id === itemId ? { ...item, ackText: "Got it.", ackLoading: false } : item),
      );
    }
  }

  // ── Submit an answer ────────────────────────────────────────────────────────
  async function submitAnswer(value: string | null, isSkip: boolean) {
    const q = filteredQuestions[stepIndex];
    if (!q) return;

    const displayValue = value === null ? (q.skipLabel ?? "Skipped") : value;
    const itemId = `${Date.now()}-${q.id}`;
    const ackText = isSkip ? (SKIP_ACKS[q.id] ?? "Got it — skipped.") : null;

    const item: ChatItem = {
      id: itemId,
      questionText: getQuestionText(q, answers),
      userAnswer: displayValue,
      ackText,
      ackLoading: !isSkip,
    };

    const newAnswers = { ...answers, [q.id]: isSkip ? null : value };
    setAnswers(newAnswers);
    setChatItems(prev => [...prev, item]);
    setInput("");

    // Q4 website crawl — fire before advancing so we can merge extracted data
    if (q.id === "website" && !isSkip && value?.trim()) {
      setCrawling(true);
      try {
        const res = await csrfFetch("/api/community-site/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: value.trim() }),
        });
        if (res.ok) {
          const { extracted } = await readJson<{ extracted: Record<string, string> }>(res) ?? { extracted: {} };
          const fields = ["contactPhone", "contactEmail", "socialFacebook", "socialInstagram"] as const;
          const merged: Record<string, string | boolean | null> = { ...newAnswers };
          let count = 0;
          for (const f of fields) {
            if (extracted[f] && !merged[f]) { merged[f] = extracted[f]; count++; }
          }
          if (count > 0) {
            setAnswers(merged);
            setChatItems(prev => prev.map(i =>
              i.id === itemId
                ? { ...i, ackText: `Got it! Pre-filled ${count} field${count !== 1 ? "s" : ""} from your site.`, ackLoading: false }
                : i,
            ));
            setCrawling(false);
            const nextIndex = stepIndex + 1;
            setStepIndex(nextIndex);
            if (nextIndex >= totalSteps) void finalizePayload(merged);
            return;
          }
        }
      } catch { /* non-fatal */ }
      setCrawling(false);
      setChatItems(prev => prev.map(i =>
        i.id === itemId ? { ...i, ackText: "Got it!", ackLoading: false } : i,
      ));
      const nextIdx = stepIndex + 1;
      setStepIndex(nextIdx);
      if (nextIdx >= totalSteps) void finalizePayload(newAnswers);
      return;
    }

    const nextIndex = stepIndex + 1;
    setStepIndex(nextIndex);

    if (!isSkip && value) {
      void fetchAck(q.id, value, itemId);
    }

    if (nextIndex >= totalSteps) {
      void finalizePayload(newAnswers);
    }
  }

  function handleSubmitText() {
    const val = input.trim();
    if (!val && !currentQuestion?.optional) return;
    if (!val && currentQuestion?.optional) {
      void submitAnswer(null, true);
    } else {
      void submitAnswer(val, false);
    }
  }

  // ── Finalize ─────────────────────────────────────────────────────────────────
  async function finalizePayload(finalAnswers: Record<string, string | boolean | null>) {
    setFinalizingPayload(true);
    setFinalizeError(false);
    try {
      const res = await csrfFetch("/api/community-site/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: finalAnswers }),
      });
      if (!res.ok) throw new Error("Finalize request failed");
      const d = await readJson<{ reply: string }>(res);
      if (!d) throw new Error("Finalize response was empty");
      const payload = extractPayload(d.reply);
      if (!payload) throw new Error("No payload in response");
      setReadyPayload(payload);
    } catch {
      setFinalizeError(true);
    } finally {
      setFinalizingPayload(false);
    }
  }

  // ── Logo upload ──────────────────────────────────────────────────────────────
  async function uploadLogo(file: File) {
    if (logoUploading) return;
    setLogoUploading(true);
    setLogoUploadError(null);
    try {
      const newLogoPath = await uploadImage(file);
      setLogoPath(newLogoPath);
      setLogoPreview(URL.createObjectURL(file));
    } catch {
      setLogoUploadError("Logo upload failed. Please try another image.");
    } finally {
      setLogoUploading(false);
    }
  }

  // ── Provision ────────────────────────────────────────────────────────────────
  async function provision() {
    if (!readyPayload) return;
    // Determine new vs update BEFORE the API call (for the progress UI)
    const isNew = !siteStatus?.isProvisioned && !siteStatus?.url;
    setProvisioningIsNew(isNew);
    setProvisioning(true);
    setProvisionResult(null);
    try {
      const payload = logoPath ? { ...readyPayload, logoPath } : readyPayload;
      const res = await csrfFetch("/api/community-site/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const d = await readJson<{ ok?: boolean; siteUrl?: string; error?: string; isNewSite?: boolean }>(res) ?? {};
      if (!res.ok || !d.ok) {
        const canRetry = res.status !== 400;
        setProvisionResult({
          ok: false,
          error: "Something went wrong setting up your site. Please try again or contact support.",
          canRetry,
        });
      } else {
        let refreshedStatus: SiteStatusData | null = null;
        try {
          const statusRes = await csrfFetch("/api/community-site/target");
          if (statusRes.ok) {
            refreshedStatus = await readJson<SiteStatusData>(statusRes);
          }
        } catch {
          // Non-fatal. The launch succeeded, so fall back to the local status.
        }

        const liveUrl = d.siteUrl ?? refreshedStatus?.url ?? siteStatus?.url ?? undefined;
        setProvisionResult({ ok: true, siteUrl: liveUrl, isNewSite: d.isNewSite ?? isNew });
        setSiteStatus(refreshedStatus ?? (siteStatus
          ? { ...siteStatus, isProvisioned: true, url: d.siteUrl ?? siteStatus.url }
          : { url: d.siteUrl ?? null, isProvisioned: true, configSummary: null }
        ));
        setReadyPayload(null);
        setStarted(false);
        setEditMode(false);
        setStepIndex(0);
        setChatItems([]);
        setInput("");
        setFinalizingPayload(false);
        setFinalizeError(false);
        setLogoPath(null);
        setLogoPreview(null);
        setLogoUploadError(null);
        setAiEditError(null);
        setAiEditSuccessMessage(null);
      }
    } catch {
      setProvisionResult({
        ok: false,
        error: "Something went wrong. Please try again in a few minutes.",
        canRetry: true,
      });
    } finally {
      setProvisioning(false);
    }
  }


  // ── Reset ────────────────────────────────────────────────────────────────────
  function resetAll() {
    setStarted(false);
    setStepIndex(0);
    setAnswers(getAutoAnswers(tier));
    setChatItems([]);
    setInput("");
    setFinalizingPayload(false);
    setFinalizeError(false);
    setReadyPayload(null);
    setProvisionResult(null);
    setCrawling(false);
    setEditMode(false);
    setAiEditError(null);
    setLogoUploadError(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const progressPct = totalSteps > 0
    ? Math.min(100, Math.round((stepIndex / totalSteps) * 100))
    : 0;
  const isExistingSiteDraft = !!siteStatus?.isProvisioned;
  const publishActionLabel = isExistingSiteDraft ? "Publish changes" : "Launch Community Site";
  const publishingLabel = isExistingSiteDraft ? "Publishing..." : "Launching...";
  const setupTemplateHint = setupTemplateForOrgType(answers.orgType as string | null | undefined);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#060f1e] text-[#c8d8e8]">

      {/* ── Header ── */}
      <div className="flex-shrink-0 border-b border-[#1e3a5f] px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#d4a017]" />
              {siteStatus?.isProvisioned && !started ? "Community Site Editor" : "Website Setup"}
            </h1>
            <p className="text-sm text-[#7a9cbf] mt-0.5">
              {!started
                ? siteStatus?.isProvisioned && !editMode && !readyPayload
                  ? "Manage your live community site"
                  : "Answer a few questions and your site is ready to launch"
                : isInterviewDone
                  ? readyPayload
                    ? provisioning
                      ? provisioningIsNew ? "Setting up your site…" : "Updating your site…"
                      : isExistingSiteDraft ? "All set — review and publish below" : "All set — review and launch below"
                    : finalizingPayload
                      ? "Building your site configuration…"
                      : "Building your site configuration…"
                  : `Step ${stepIndex + 1} of ${totalSteps}`}
            </p>
          </div>
          {started && !provisionResult?.ok && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetAll}
              className="text-[#7a9cbf] hover:text-white text-xs"
            >
              Start over
            </Button>
          )}
        </div>
        {started && (
          <div className="h-1 bg-[#1e3a5f] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#d4a017] rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>

      {/* ── Success banner ── */}
      {provisionResult?.ok && (
        <div className="flex-shrink-0 mx-6 mt-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {provisionResult.isNewSite ? (
                <>
                  <p className="text-sm font-semibold text-green-300">Your site is live!</p>
                  {provisionResult.siteUrl && (
                    <a
                      href={provisionResult.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-green-400 hover:text-green-300 underline underline-offset-2 mt-1 break-all"
                    >
                      {provisionResult.siteUrl}
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                    </a>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-green-300">Site updated — changes are live!</p>
                  {provisionResult.siteUrl && (
                    <a
                      href={provisionResult.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-green-400 hover:text-green-300 underline underline-offset-2 mt-1 break-all"
                    >
                      {provisionResult.siteUrl}
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                    </a>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-green-500/20 flex items-center justify-between">
            <p className="text-xs text-green-400/70">Want to use your own domain name?</p>
            <Link
              to="/dashboard/domains"
              className="text-xs font-medium text-green-400 hover:text-green-300 underline underline-offset-2 transition-colors"
            >
              Connect a domain →
            </Link>
          </div>
        </div>
      )}

      {/* ── Launch error ── */}
      {provisionResult && !provisionResult.ok && (
        <div className="flex-shrink-0 mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p>{provisionResult.error}</p>
            {provisionResult.canRetry && (
              <button
                onClick={() => void provision()}
                disabled={provisioning}
                className="mt-1.5 flex items-center gap-1 text-xs text-red-400 hover:text-red-200 underline underline-offset-2 disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Chat scroll area ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

        {/* Not started — management view (returning visitor, site already built) */}
        {!started && !readyPayload && siteStatus?.isProvisioned && !editMode && (
          <SiteManagementView
            status={siteStatus}
            onStatusChange={setSiteStatus}
            onRestart={() => {
              if (!window.confirm("This will restart the full interview from scratch. Your current site stays live until you relaunch. Continue?")) return;
              setEditMode(true);
              setStarted(true);
            }}
            onAiEdit={req => void submitAiEdit(req)}
            aiLoading={aiEditLoading}
            aiError={aiEditError}
            aiSuccessMessage={aiEditSuccessMessage}
            siteEditVersion={siteEditVersion}
          />
        )}

        {/* Not started — loading (briefly while fetching site status) */}
        {!started && !readyPayload && siteStatusLoading && (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-[#4a6a8a]" />
          </div>
        )}

        {/* Not started — welcome screen (first-time or redo) */}
        {!started && !readyPayload && !siteStatus?.isProvisioned && !siteStatusLoading && (
          <div className="flex flex-col items-center text-center pt-10 pb-6 gap-6">

            {/* Welcome copy + logo + start button */}
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-[#d4a017]/10 flex items-center justify-center mb-4">
                <Globe className="w-8 h-8 text-[#d4a017]" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">
                Let's set up your website!
              </h2>
              <p className="text-sm text-[#7a9cbf] max-w-sm mb-6">
                I'll ask you a few questions about your organization.
                Takes about 5 minutes.
              </p>
              {logoPreview ? (
                <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-[#0f1a2e] border border-[#1e3a5f]">
                  <img src={logoPreview} alt="Logo" className="w-8 h-8 rounded object-cover" />
                  <span className="text-xs text-[#7aad6a]">Logo uploaded</span>
                  <button
                    onClick={() => { setLogoPath(null); setLogoPreview(null); }}
                    className="text-[#4a6a8a] hover:text-red-400 ml-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[#1e3a5f] bg-[#0f1a2e] hover:bg-[#1e3a5f] text-sm text-[#c8d8e8] font-medium transition-colors disabled:opacity-50 mb-4"
                >
                  {logoUploading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7a9cbf]" />
                    : <ImagePlus className="w-3.5 h-3.5 text-[#7a9cbf]" />
                  }
                  {logoUploading ? "Uploading…" : "Upload your logo (optional)"}
                </button>
              )}
              {logoUploadError && (
                <p className="mb-4 flex items-center gap-1 text-xs text-red-300">
                  <AlertCircle className="w-3 h-3" />
                  {logoUploadError}
                </p>
              )}
              <Button
                className="bg-[#d4a017] hover:bg-[#b88a14] text-black font-semibold px-8"
                onClick={() => setStarted(true)}
              >
                Let's get started
              </Button>
            </div>

            {/* Homepage banner picker — shown before interview so it's always reachable */}
            <div className="w-full max-w-md text-left">
              <HeroImagePanel
                initialUrl={siteStatus?.heroImageUrl}
                initialVisualType={siteStatus?.heroVisualType}
              />
            </div>

          </div>
        )}

        {/* Not started + readyPayload (from AI edit) — show review prompt */}
        {!started && readyPayload && !provisioning && (
          <BotBubble>
            I prepared that site update as a draft. Review the changes below, then click <strong>{publishActionLabel}</strong> to apply them.
          </BotBubble>
        )}

        {/* Completed chat items */}
        {started && chatItems.map(item => (
          <div key={item.id} className="space-y-3">
            <BotBubble>{item.questionText}</BotBubble>
            <UserBubble>{item.userAnswer}</UserBubble>
            {item.ackLoading
              ? <BotBubble loading />
              : item.ackText
                ? <BotBubble>{item.ackText}</BotBubble>
                : null}
          </div>
        ))}

        {/* Crawling (Q4 website check) */}
        {crawling && <BotBubble loading />}

        {/* Finalizing */}
        {started && isInterviewDone && finalizingPayload && (
          <BotBubble loading />
        )}

        {/* Finalize error */}
        {started && isInterviewDone && finalizeError && !readyPayload && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Couldn't build your configuration — tap to retry.</span>
              <button
                onClick={() => void finalizePayload(answers)}
                className="flex items-center gap-1 underline underline-offset-2 hover:text-red-300"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Payload ready message */}
        {started && readyPayload && !provisioning && (
          <>
            <BotBubble>
              I have everything I need! Review your configuration below, then click <strong>{publishActionLabel}</strong>.
            </BotBubble>

            {/* Hero image picker — shown inline after interview if org chose a photo background */}
            {answers.heroBackground !== "Brand colors only (no photo)" && (
              <div className="w-full">
                <HeroImagePanel
                  initialUrl={siteStatus?.heroImageUrl}
                  initialVisualType={siteStatus?.heroVisualType}
                  autoTriggerAi={answers.heroBackground === "AI picks a community photo"}
                />
              </div>
            )}
          </>
        )}

        {/* Provision in-progress steps */}
        {provisioning && (
          <ProvisionProgress isNewSite={provisioningIsNew} />
        )}

        {started && setupTemplateHint && !isInterviewDone && (
          <div className="ml-10 rounded-xl border border-[#d4a017]/25 bg-[#d4a017]/10 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#f2d27a]">Template selected</p>
            <p className="mt-1 text-sm text-white">{setupTemplateHint.label}</p>
            <p className="mt-0.5 text-xs text-[#a8bdd4]">{setupTemplateHint.description}</p>
          </div>
        )}

        {/* Current question form */}
        {started && currentQuestion && !isInterviewDone && (
          <div className="space-y-3">
            <BotBubble>{getQuestionText(currentQuestion, answers)}</BotBubble>

            {/* SELECT — button grid */}
            {currentQuestion.type === "select" && currentQuestion.options && (
              <div className="pl-10">
                <div className="flex flex-wrap gap-2">
                  {currentQuestion.options.map(opt => (
                    <button
                      key={opt}
                      onClick={() => void submitAnswer(opt, false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#d4a017]/40 text-[#d4a017] bg-[#d4a017]/8 hover:bg-[#d4a017]/20 hover:border-[#d4a017]/70 transition-all"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* BOOLEAN — Yes / No */}
            {currentQuestion.type === "boolean" && (
              <div className="pl-10 flex gap-3">
                <button
                  onClick={() => void submitAnswer("Yes", false)}
                  className="px-6 py-2 rounded-lg text-sm font-medium border border-green-500/40 text-green-400 bg-green-500/8 hover:bg-green-500/20 transition-all"
                >
                  Yes
                </button>
                <button
                  onClick={() => void submitAnswer("No", false)}
                  className="px-6 py-2 rounded-lg text-sm font-medium border border-[#4a6a8a]/40 text-[#7a9cbf] bg-white/3 hover:bg-white/8 transition-all"
                >
                  No
                </button>
              </div>
            )}

            {/* TEXT / TEXTAREA */}
            {(currentQuestion.type === "text" || currentQuestion.type === "textarea") && (
              <div className="pl-10 space-y-2">
                {/* Logo upload badge (during interview) */}
                {logoPreview && (
                  <div className="flex items-center gap-2 px-1">
                    <img src={logoPreview} alt="Logo" className="w-7 h-7 rounded object-cover border border-[#1e3a5f]" />
                    <span className="text-xs text-[#7aad6a]">Logo uploaded</span>
                    <button
                      onClick={() => { setLogoPath(null); setLogoPreview(null); }}
                      className="text-[#4a6a8a] hover:text-red-400 ml-auto"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {logoUploadError && (
                  <p className="flex items-center gap-1 px-1 text-xs text-red-300">
                    <AlertCircle className="w-3 h-3" />
                    {logoUploadError}
                  </p>
                )}

                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmitText();
                    }
                  }}
                  placeholder={currentQuestion.hint ?? "Type your answer…"}
                  rows={currentQuestion.type === "textarea" ? 3 : 1}
                  className="w-full bg-[#0f1a2e] border-[#1e3a5f] text-[#c8d8e8] placeholder:text-[#4a6a8a] rounded-xl text-sm focus:ring-[#d4a017]/50 resize-none max-h-40"
                />

                <div className="flex items-center gap-2">
                  {/* Logo upload button */}
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                    title="Upload your organization logo"
                    className="p-1.5 rounded-lg text-[#4a6a8a] hover:text-[#d4a017] hover:bg-[#1e3a5f] transition-colors disabled:opacity-50"
                  >
                    {logoUploading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <ImagePlus className="w-4 h-4" />}
                  </button>

                  <div className="flex-1" />

                  {/* Skip (optional only) */}
                  {currentQuestion.optional && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void submitAnswer(null, true)}
                      className="text-[#7a9cbf] hover:text-white text-xs h-8"
                    >
                      {currentQuestion.skipLabel ?? "Skip"}
                    </Button>
                  )}

                  {/* Continue */}
                  <Button
                    onClick={handleSubmitText}
                    disabled={!input.trim() && !currentQuestion.optional}
                    className="bg-[#d4a017] hover:bg-[#b88a14] text-black h-8 px-4 text-sm font-semibold rounded-xl"
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Continue
                  </Button>
                </div>

                {currentQuestion.optional && (
                  <p className="text-xs text-[#4a6a8a] px-1">
                    This field is optional — tap <span className="text-[#7a9cbf]">{currentQuestion.skipLabel ?? "Skip"}</span> to leave it blank.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ── Payload preview + Launch button ── */}
      {readyPayload && !provisionResult?.ok && (
        <div className="flex-shrink-0 px-6 pb-4 space-y-3">
          <PayloadPreview payload={readyPayload} />
          <Button
            className="w-full bg-[#d4a017] hover:bg-[#b88a14] text-black font-semibold h-11 text-base"
            onClick={() => void provision()}
            disabled={provisioning}
          >
            {provisioning ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />{publishingLabel}</>
            ) : (
              <><Rocket className="w-4 h-4 mr-2" />{publishActionLabel}</>
            )}
          </Button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void uploadLogo(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
