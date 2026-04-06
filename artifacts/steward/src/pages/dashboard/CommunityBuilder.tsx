import React, { useState, useRef, useEffect } from "react";
import {
  Send, Bot, User, Loader2, AlertCircle, CheckCircle2,
  Globe, Rocket, ExternalLink, ChevronDown, ChevronUp,
  ImagePlus, X, RefreshCw,
} from "lucide-react";
import { useGetOrganization } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { csrfHeaders } from "@/lib/api";

function csrfFetch(input: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  return fetch(input, {
    credentials: "include",
    ...init,
    headers: {
      ...(mutating ? csrfHeaders(method) : {}),
      ...init?.headers,
    },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type QuestionType = "text" | "textarea" | "select" | "boolean";

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
  const [provisionResult, setProvisionResult] = useState<{
    ok: boolean;
    siteUrl?: string;
    error?: string;
    canRetry?: boolean;
  } | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [crawling, setCrawling] = useState(false);


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


  // ── Ack fetch (fire-and-forget, never blocks progress) ──────────────────────
  async function fetchAck(fieldId: string, value: string, itemId: string) {
    try {
      const res = await csrfFetch("/api/community-site/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId, value, isSkip: false }),
      });
      const d = res.ok
        ? await res.json() as { ack: string }
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
          const { extracted } = await res.json() as { extracted: Record<string, string> };
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
      const d = await res.json() as { reply: string };
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
    try {
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
      const urlRes = await csrfFetch("/api/community-site/logo-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ext }),
      });
      if (!urlRes.ok) throw new Error("Could not get upload URL");
      const { uploadUrl, logoPath: newLogoPath } = await urlRes.json() as { uploadUrl: string; logoPath: string };
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/png" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload failed");
      setLogoPath(newLogoPath);
      setLogoPreview(URL.createObjectURL(file));
    } catch {
    } finally {
      setLogoUploading(false);
    }
  }

  // ── Provision ────────────────────────────────────────────────────────────────
  async function provision() {
    if (!readyPayload) return;
    setProvisioning(true);
    setProvisionResult(null);
    try {
      const payload = logoPath ? { ...readyPayload, logoPath } : readyPayload;
      const res = await csrfFetch("/api/community-site/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const d = await res.json() as { ok?: boolean; siteUrl?: string; error?: string };
      if (!res.ok || !d.ok) {
        let error: string;
        let canRetry = false;
        if (res.status === 401) {
          error = "Authentication failed. The service key doesn't match the deployed site. Contact support.";
        } else if (res.status === 400) {
          error = d.error?.includes("No community site")
            ? (d.error ?? "No community site configured.")
            : "Invalid configuration data. Please try the interview again.";
        } else if (res.status >= 500) {
          error = "The site encountered an error during setup. Please try again in a few minutes.";
          canRetry = true;
        } else {
          error = d.error ?? "Launch failed";
          canRetry = true;
        }
        setProvisionResult({ ok: false, error, canRetry });
      } else {
        setProvisionResult({ ok: true, siteUrl: d.siteUrl });
      }
    } catch {
      setProvisionResult({
        ok: false,
        error: "Couldn't reach your site. It may still be deploying. Please try again in a few minutes.",
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
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const progressPct = totalSteps > 0
    ? Math.min(100, Math.round((stepIndex / totalSteps) * 100))
    : 0;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#060f1e] text-[#c8d8e8]">

      {/* ── Header ── */}
      <div className="flex-shrink-0 border-b border-[#1e3a5f] px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#d4a017]" />
              Website Setup
            </h1>
            <p className="text-sm text-[#7a9cbf] mt-0.5">
              {!started
                ? "Answer a few questions and your site is ready to launch"
                : isInterviewDone
                  ? readyPayload
                    ? "All set — review and launch below"
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
        <div className="flex-shrink-0 mx-6 mt-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-green-300">Your site is live!</p>
            {provisionResult.siteUrl && (
              <a
                href={provisionResult.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-green-400 hover:text-green-300 underline mt-1"
              >
                {provisionResult.siteUrl}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
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

        {/* Not started yet */}
        {!started && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-[#d4a017]/10 flex items-center justify-center mb-4">
              <Globe className="w-8 h-8 text-[#d4a017]" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">
              Let's set up {org?.name ?? "your website"}
            </h2>
            <p className="text-sm text-[#7a9cbf] max-w-sm mb-6">
              I'll ask you {totalSteps} questions about your organization — name, location,
              contact info, and how you'd like your site to look. Takes about 5 minutes.
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
                className="flex items-center gap-2 text-xs text-[#7a9cbf] hover:text-[#d4a017] mb-4 transition-colors"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                Upload your logo (optional)
              </button>
            )}
            <Button
              className="bg-[#d4a017] hover:bg-[#b88a14] text-black font-semibold px-8"
              onClick={() => setStarted(true)}
            >
              Let's get started
            </Button>
          </div>
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
        {started && readyPayload && (
          <BotBubble>
            I have everything I need! Review your configuration below, then click <strong>Launch Site</strong> to go live.
          </BotBubble>
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
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Launching…</>
            ) : (
              <><Rocket className="w-4 h-4 mr-2" />Launch Community Site</>
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
