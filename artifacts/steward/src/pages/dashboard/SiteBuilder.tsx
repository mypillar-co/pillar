import React, { useState, useRef, useEffect } from "react";
import {
  Send, Globe, Sparkles, Bot, User, Loader2, AlertCircle,
  Eye, CheckCircle2, ExternalLink, RefreshCw, EyeOff,
  Edit3, Play, Save, Trash2, Zap, ChevronRight,
  X, Check, ImagePlus, CalendarClock, Images, ShoppingBag,
  Download, Link2, Monitor, Tablet, Smartphone, Pencil,
} from "lucide-react";
import { uploadImage, ACCEPTED_IMAGE_TYPES, MAX_IMAGE_SIZE_MB } from "@/lib/uploadImage";
import { useGetOrganization } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { csrfHeaders } from "@/lib/api";

// Fetch wrapper that automatically attaches CSRF token for mutating methods
// and ensures credentials are always included.
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

const CONTEXT_TURNS = 10;

type Message = { id: string; role: "user" | "assistant"; content: string; streaming?: boolean; images?: string[] };
type Usage = { used: number; limit: number; remaining: number; tier: string | null };
type Site = {
  id: string;
  status: string;
  generatedHtml: string | null;
  orgSlug: string | null;
  publishedAt: string | null;
  updatedAt: string;
};
type Schedule = {
  id: string;
  frequency: string;
  dayOfWeek: string | null;
  updateItems: string[];
  customInstructions: string | null;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

type ImportedSiteData = {
  name: string;
  mission: string;
  services: string;
  location: string;
  schedule: string;
  events: string;
  contact: string;
  social: string;
  leadership: string;
  audience: string;
  style: string;
  extra: string;
  /** Crawl summary counts — shown in the post-crawl confirmation message */
  crawlMeta?: {
    eventsFound: number;
    programsFound: number;
    boardMembersFound: number;
  };
};

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const SITE_STYLES = [
  { id: "classic", label: "Classic & Professional", desc: "Timeless look with strong typography — great for service clubs and associations", swatches: ["#1e3a5f", "#f59e0b", "#ffffff"] },
  { id: "modern", label: "Modern & Bold", desc: "Contemporary with impactful visuals and clean lines", swatches: ["#0f172a", "#6366f1", "#f8fafc"] },
  { id: "warm", label: "Warm & Community", desc: "Friendly, inviting tones that welcome all members", swatches: ["#7c2d12", "#f97316", "#fef3c7"] },
  { id: "minimal", label: "Clean & Minimal", desc: "Uncluttered and focused — lets your content shine", swatches: ["#1e293b", "#e2e8f0", "#ffffff"] },
] as const;

const SITE_SECTIONS = [
  { id: "hero", label: "Hero / Banner", emoji: "🏠", required: true },
  { id: "about", label: "About Us", emoji: "ℹ️", required: true },
  { id: "mission", label: "Mission & Values", emoji: "🎯" },
  { id: "events", label: "Events & Calendar", emoji: "📅" },
  { id: "leadership", label: "Officers & Leadership", emoji: "👥" },
  { id: "gallery", label: "Photo Gallery", emoji: "🖼️" },
  { id: "contact", label: "Contact & Location", emoji: "📬" },
  { id: "news", label: "News & Updates", emoji: "📰" },
  { id: "donate", label: "Donate / Support", emoji: "💛" },
  { id: "sponsors", label: "Sponsors & Partners", emoji: "🤝" },
] as const;

const COLOR_THEMES = [
  { id: "navy-gold", label: "Navy & Gold", bg: "#1e3a5f", accent: "#f59e0b" },
  { id: "forest-amber", label: "Forest & Amber", bg: "#14532d", accent: "#d97706" },
  { id: "burgundy-silver", label: "Burgundy & Silver", bg: "#4c0519", accent: "#94a3b8" },
  { id: "royal-white", label: "Royal Blue & White", bg: "#1d4ed8", accent: "#f8fafc" },
  { id: "charcoal-teal", label: "Charcoal & Teal", bg: "#1e293b", accent: "#0d9488" },
  { id: "plum-gold", label: "Plum & Gold", bg: "#3b0764", accent: "#eab308" },
] as const;

const DEFAULT_SECTIONS = ["hero", "about", "events", "contact"];

const UPDATE_ITEMS = [
  { id: "events", label: "Upcoming events", description: "Keep the events section current" },
  { id: "hours", label: "Hours & schedule", description: "Refresh meeting times and hours" },
  { id: "announcements", label: "Announcements", description: "Update news and announcements" },
];

function tierAllowsSchedule(tier: string | null | undefined) {
  return tier === "tier1a" || tier === "tier2" || tier === "tier3";
}

function tierAllowsChanges(tier: string | null | undefined) {
  return tier === "tier1" || tier === "tier1a" || tier === "tier2" || tier === "tier3";
}

function formatRelativeTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SiteBuilder() {
  const { data: orgData } = useGetOrganization();
  const org = orgData?.organization;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [siteLoading, setSiteLoading] = useState(true);
  const [tier, setTier] = useState<string | null>(null);

  const [mode, setMode] = useState<"interview" | "generating" | "preview">("interview");
  const [activeTab, setActiveTab] = useState<"preview" | "edit" | "schedule" | "shop">("preview");

  const [changeInput, setChangeInput] = useState("");
  const [changePending, setChangePending] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [proposedHtml, setProposedHtml] = useState<string | null>(null);

  const [slugEditing, setSlugEditing] = useState(false);
  const [slugInput, setSlugInput] = useState("");
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    frequency: "weekly",
    dayOfWeek: "Monday",
    updateItems: [] as string[],
    customInstructions: "",
    isActive: true,
  });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleRunning, setScheduleRunning] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const [syncingEvents, setSyncingEvents] = useState(false);
  const [showPublishDisclaimer, setShowPublishDisclaimer] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [uploadedPhotos, setUploadedPhotos] = useState<{ url: string; name: string }[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);

  // ── Preview chat panel uploads ─────────────────────────────────────────────
  const [editPanelImages, setEditPanelImages] = useState<{ url: string; name: string }[]>([]);
  const [editPanelUploading, setEditPanelUploading] = useState(false);
  const [shopEmbedCode, setShopEmbedCode] = useState("");
  const [shopSaving, setShopSaving] = useState(false);
  const [shopMessage, setShopMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importData, setImportData] = useState<ImportedSiteData | null>(null);
  const [editableImportData, setEditableImportData] = useState<ImportedSiteData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedFromUrl, setImportedFromUrl] = useState<string | null>(null);
  const [showImportForm, setShowImportForm] = useState(false);

  const [showSetup, setShowSetup] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>("classic");
  const [selectedSections, setSelectedSections] = useState<string[]>(DEFAULT_SECTIONS);
  const [selectedColorTheme, setSelectedColorTheme] = useState<string>("navy-gold");

  const bottomRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const editPanelFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    Promise.all([
      csrfFetch("/api/sites/builder/usage").then(r => r.json()),
      csrfFetch("/api/sites/my").then(r => r.json()),
    ]).then(([usageData, siteData]: [Usage, { site: Site | null; orgSlug: string | null; schedule: Schedule | null; tier: string | null }]) => {
      setUsage(usageData);
      setSite(siteData.site);
      setOrgSlug(siteData.orgSlug);
      setTier(siteData.tier ?? usageData.tier);
      if (siteData.schedule) {
        setSchedule(siteData.schedule);
        setScheduleForm({
          frequency: siteData.schedule.frequency,
          dayOfWeek: siteData.schedule.dayOfWeek ?? "Monday",
          updateItems: siteData.schedule.updateItems ?? [],
          customInstructions: siteData.schedule.customInstructions ?? "",
          isActive: siteData.schedule.isActive ?? true,
        });
      }
      if (siteData.site?.generatedHtml) setMode("preview");
    }).catch(() => null).finally(() => setSiteLoading(false));
  }, []);

  // ── Preview pane state ─────────────────────────────────────────────────────
  // Default viewport matches the user's actual screen size
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "tablet" | "mobile">(() => {
    if (typeof window !== "undefined") {
      if (window.innerWidth >= 1024) return "desktop";
      if (window.innerWidth >= 640) return "tablet";
    }
    return "mobile";
  });
  const [previewSection, setPreviewSection] = useState<string>("");
  const [previewKey, setPreviewKey] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<"chat" | "preview">("preview");

  const navigatePreviewTo = (hash: string) => {
    setPreviewSection(hash);
    if (iframeRef.current) {
      iframeRef.current.src = `/api/sites/preview-html${hash}`;
    }
  };

  // Reload preview whenever the active tab switches to preview
  useEffect(() => {
    if (activeTab === "preview") setPreviewKey(k => k + 1);
  }, [activeTab]);

  // Load saved embed code
  useEffect(() => {
    csrfFetch("/api/sites/embed-code", { credentials: "include" })
      .then(r => r.json())
      .then((d: { embedCode?: string }) => { if (d.embedCode) setShopEmbedCode(d.embedCode); })
      .catch(() => null);
  }, []);

  const handleShopSave = async () => {
    setShopSaving(true);
    setShopMessage(null);
    try {
      const res = await csrfFetch("/api/sites/embed-code", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedCode: shopEmbedCode }),
      });
      if (!res.ok) throw new Error("Save failed");
      setShopMessage({ type: "success", text: "Embed code saved. Rebuild your site to add the shop section." });
    } catch {
      setShopMessage({ type: "error", text: "Failed to save. Please try again." });
    } finally {
      setShopSaving(false);
    }
  };

  const isLimitReached = usage !== null && usage.remaining <= 0;
  const userMsgCount = messages.filter(m => m.role === "user").length;
  const lastAiMsg = messages.filter(m => m.role === "assistant").slice(-1)[0];
  const aiSignaledCompletion = !!(lastAiMsg?.content?.toLowerCase().includes("i have everything i need") || lastAiMsg?.content?.toLowerCase().includes("generate my site"));
  const canGenerate = (userMsgCount >= 8 || aiSignaledCompletion) && !generating;
  const interviewProgress = Math.min(Math.max(0, userMsgCount - 1), 8);
  const publicUrl = orgSlug ? `https://${orgSlug}.mypillar.co` : null;

  const handleSaveSlug = async () => {
    const newSlug = slugInput.trim().toLowerCase();
    if (!newSlug) return;
    setSlugSaving(true);
    setSlugError(null);
    try {
      const res = await csrfFetch("/api/sites/my/slug", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newSlug }),
      });
      const data = await res.json() as { slug?: string; error?: string };
      if (!res.ok) { setSlugError(data.error ?? "Failed to update URL"); return; }
      setOrgSlug(data.slug!);
      setSlugEditing(false);
    } catch {
      setSlugError("Failed to update URL. Please try again.");
    } finally {
      setSlugSaving(false);
    }
  };

  const usagePercent = usage ? Math.round((usage.used / usage.limit) * 100) : 0;
  const usageColor = usagePercent >= 90 ? "text-red-400" : usagePercent >= 70 ? "text-amber-400" : "text-emerald-400";
  const usageBarColor = usagePercent >= 90 ? "bg-red-400" : usagePercent >= 70 ? "bg-amber-400" : "bg-emerald-400";

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Logo must be under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setLogoDataUrl(dataUrl);
      setLogoFileName(file.name);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (uploadedPhotos.length + files.length > 6) {
      alert("You can upload up to 6 photos.");
      return;
    }
    setPhotoUploading(true);
    try {
      const results = await Promise.all(
        files.map(async file => {
          if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) throw new Error(`${file.name} exceeds ${MAX_IMAGE_SIZE_MB}MB`);
          const url = await uploadImage(file);
          return { url, name: file.name };
        })
      );
      setUploadedPhotos(prev => [...prev, ...results]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to upload photo. Please try again.");
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const toggleSection = (id: string) => {
    const section = SITE_SECTIONS.find(s => s.id === id);
    if (section && "required" in section && section.required) return;
    setSelectedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const startWithSetup = () => {
    const style = SITE_STYLES.find(s => s.id === selectedStyle);
    const theme = COLOR_THEMES.find(t => t.id === selectedColorTheme);
    const sectionLabels = SITE_SECTIONS.filter(s => selectedSections.includes(s.id)).map(s => s.label).join(", ");
    const contextMsg: Message = {
      id: "setup-user-0",
      role: "user",
      content: `Setup preferences: Style — ${style?.label ?? selectedStyle}. Color theme — ${theme?.label ?? selectedColorTheme}. Sections to include — ${sectionLabels}.`,
    };
    setMessages([contextMsg]);
    setShowSetup(false);
    void send("Let's build my website.", [contextMsg]);
  };

  const handleImportUrl = async () => {
    const trimmed = importUrl.trim();
    if (!trimmed || importing) return;
    setImporting(true);
    setImportError(null);
    setImportData(null);
    try {
      const res = await csrfFetch("/api/sites/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json() as { data?: ImportedSiteData; url?: string; error?: string };
      if (!res.ok) { setImportError(data.error ?? "Import failed. Please try again."); return; }
      setImportData(data.data!);
      setEditableImportData({ ...data.data! });
      setImportedFromUrl(data.url ?? trimmed);
    } catch {
      setImportError("Could not reach the server. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = () => {
    if (!editableImportData) return;
    const d = editableImportData;
    const orgName = org?.name ?? d.name ?? "your organization";
    const sourceUrl = importedFromUrl ?? "your existing website";

    // ── Build the post-crawl summary message (spec: exact counts) ──────────
    const foundItems: string[] = [];
    if (d.name) foundItems.push(`org name (${d.name})`);

    const eventLines = d.events ? d.events.split("\n").filter(l => l.trim()) : [];
    if (eventLines.length > 0) {
      const preview = eventLines.slice(0, 2).map(l => l.split("|")[0].trim()).filter(Boolean).join(", ");
      foundItems.push(`${eventLines.length} upcoming event${eventLines.length !== 1 ? "s" : ""} (${preview}${eventLines.length > 2 ? "…" : ""})`);
    }

    const programItems = d.services ? d.services.split(/[,\n]/).map(s => s.trim()).filter(Boolean) : [];
    if (programItems.length > 0) {
      const preview = programItems.slice(0, 2).join(", ");
      foundItems.push(`${programItems.length} program${programItems.length !== 1 ? "s" : ""} (${preview}${programItems.length > 2 ? "…" : ""})`);
    }

    if (d.contact) foundItems.push("contact info");
    if (d.social) foundItems.push("social links");

    const boardLines = d.leadership ? d.leadership.split("\n").filter(l => l.trim()) : [];
    if (boardLines.length > 0) {
      foundItems.push(`${boardLines.length} board member${boardLines.length !== 1 ? "s" : ""}`);
    }

    const summaryText = foundItems.length > 0
      ? `I pulled everything from ${sourceUrl}. I found:\n- ${foundItems.join("\n- ")}\n\nDoes this look right? Anything to add or change?`
      : `I imported content from ${sourceUrl}, but couldn't find much. Let me ask you a few questions to fill in the details.`;

    // ── Build synthetic Q&A — only inject fields with REAL data ─────────────
    type QA = { q: string; a: string };
    const qa: QA[] = [];
    if (d.mission)   qa.push({ q: `What is ${orgName}'s mission or main purpose?`, a: d.mission });
    if (d.services)  qa.push({ q: "What programs, services, or activities do you offer?", a: d.services });
    const locationAnswer = [d.location, d.schedule].filter(Boolean).join(". ");
    if (locationAnswer) qa.push({ q: "Where are you located? Include address and meeting schedule.", a: locationAnswer });
    if (d.events)    qa.push({ q: "Tell me about your upcoming events.", a: d.events });
    if (d.contact)   qa.push({ q: "How should visitors reach you? Share email and phone number.", a: d.contact });
    if (d.social)    qa.push({ q: "What are your social media accounts?", a: d.social });
    if (d.leadership) qa.push({ q: "Who are your current officers or board members?", a: d.leadership });
    if (d.audience)  qa.push({ q: "Who are you trying to reach?", a: d.audience });
    if (d.style)     qa.push({ q: "Any color or style preferences or parent organization branding?", a: d.style });

    // Extra / history — always include as context note
    const extraParts = [d.extra, `Content imported from ${sourceUrl}.`].filter(Boolean).join(" ");
    qa.push({ q: "Any other context, history, or announcements?", a: extraParts });

    // ── Identify missing critical fields for follow-up (spec requirement) ────
    const followUps: string[] = [];
    if (!d.events) {
      followUps.push("I didn't find any upcoming events on your current site. Do you have events to add? List names, dates, and ticket prices if applicable.");
    }
    if (!d.contact) {
      followUps.push("I couldn't find contact info. What's the best email and phone number for visitors to reach you?");
    }
    if (!d.mission && !d.services) {
      followUps.push(`What does ${orgName} do? Give me a one-sentence description plus your main programs or activities.`);
    }

    // ── Assemble the full message list ────────────────────────────────────────
    const syntheticMessages: Message[] = [];

    // First AI message = post-crawl summary (spec requirement)
    syntheticMessages.push({ id: "import-summary", role: "assistant", content: summaryText });
    syntheticMessages.push({ id: "import-confirm", role: "user", content: "Yes, looks right!" });

    // Inject all real Q&A pairs so the generator has full context
    qa.forEach(({ q, a }, i) => {
      syntheticMessages.push({ id: `import-ai-${i}`, role: "assistant", content: q });
      syntheticMessages.push({ id: `import-user-${i}`, role: "user", content: a });
    });

    // Spec: ask follow-ups ONLY for data the crawl didn't find
    if (followUps.length > 0) {
      const followUpMsg = followUps.join("\n\n") + "\n\nOnce you've answered these, click **Generate My Site**.";
      syntheticMessages.push({ id: "import-followup", role: "assistant", content: followUpMsg });
    } else {
      syntheticMessages.push({ id: "import-ai-final", role: "assistant", content: "I have everything I need! Click **Generate My Site** to build your website." });
    }

    setMessages(syntheticMessages);
    setImportData(null);
    setEditableImportData(null);
    setImportUrl("");
    // NOTE: Do NOT clear importedFromUrl here — generateSite reads it.
    setShowImportForm(false);
  };

  const syncEvents = async () => {
    setSyncingEvents(true);
    setSyncMessage(null);
    try {
      const res = await csrfFetch("/api/sites/sync-events", { method: "POST", credentials: "include" });
      const data = await res.json() as { proposalReady?: boolean; eventCount?: number; used?: number; limit?: number; remaining?: number; error?: string };

      if (res.status === 429) {
        setUsage(prev => prev ? { ...prev, used: data.used ?? prev.used, remaining: 0 } : null);
        setSyncMessage("Monthly AI limit reached. Upgrade your plan to sync events.");
        return;
      }
      if (!res.ok || data.error) {
        setSyncMessage(data.error ?? "Failed to sync events. Please try again.");
        return;
      }

      // Update usage counters from response
      if (data.used !== undefined) {
        setUsage(prev => prev ? { ...prev, used: data.used!, limit: data.limit ?? prev.limit, remaining: data.remaining ?? 0 } : null);
      }

      // Fetch proposed HTML and load into preview
      const proposeRes = await csrfFetch("/api/sites/my/proposal-preview", { credentials: "include" });
      if (proposeRes.ok) {
        const proposeData = await proposeRes.json() as { proposedHtml?: string };
        if (proposeData.proposedHtml) {
          setProposedHtml(proposeData.proposedHtml);
          setPreviewKey(k => k + 1);
        }
      }

      setActiveTab("preview");
      const count = data.eventCount ?? 0;
      setSyncMessage(`${count} event${count !== 1 ? "s" : ""} synced — review the preview, then click "Apply Change" to publish.`);
    } catch {
      setSyncMessage("Connection error. Please try again.");
    } finally {
      setSyncingEvents(false);
    }
  };

  const send = async (text: string, prependMessages?: Message[]) => {
    if (!text.trim() || chatLoading || isLimitReached) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text };
    const base = prependMessages ?? messages;
    const trimmedHistory = base.slice(-(CONTEXT_TURNS * 2)).map(m => ({ role: m.role, content: m.content }));
    const assistantMsgId = (Date.now() + 1).toString();

    setMessages(prev => [...prev, userMsg, { id: assistantMsgId, role: "assistant", content: "", streaming: true }]);
    setInput("");
    setChatLoading(true);

    try {
      const res = await csrfFetch("/api/sites/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text, history: trimmedHistory, orgName: org?.name, orgType: org?.type }),
      });

      if (res.status === 429) {
        const data = await res.json() as { used: number; limit: number };
        setUsage(prev => prev ? { ...prev, used: data.used, remaining: 0 } : null);
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: "You've reached your monthly AI limit. Upgrade to continue.", streaming: false } : m));
        return;
      }

      const data = await res.json() as { reply?: string; used?: number; limit?: number; remaining?: number; error?: string };

      if (!res.ok || data.error) {
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: data.error ?? "AI service error. Please try again.", streaming: false } : m));
        return;
      }

      const reply = data.reply ?? "";

      // Animate the reply character-by-character for a natural feel
      let displayed = "";
      for (let i = 0; i < reply.length; i++) {
        displayed += reply[i];
        const snap = displayed;
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: snap } : m));
        // Small delay between characters — faster for longer replies
        await new Promise(r => setTimeout(r, reply.length > 100 ? 8 : 14));
      }

      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, streaming: false } : m));

      if (data.used !== undefined) {
        setUsage({ used: data.used, limit: data.limit!, remaining: data.remaining!, tier: usage?.tier ?? null });
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: "Connection error. Please try again.", streaming: false } : m));
    } finally {
      setChatLoading(false);
    }
  };

  const generateSite = async () => {
    setGenerating(true);
    setMode("generating");
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await csrfFetch("/api/sites/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          history,
          orgName: org?.name,
          orgType: org?.type,
          logoDataUrl: logoDataUrl ?? undefined,
          photoUrls: uploadedPhotos.length > 0 ? uploadedPhotos.map(p => p.url) : undefined,
          originalSiteUrl: importedFromUrl ?? undefined,
        }),
      });

      if (res.status === 429) {
        const data = await res.json() as { used?: number; limit?: number };
        setUsage(prev => prev ? { ...prev, used: data.used ?? prev.used, remaining: 0 } : null);
        setMode("interview");
        alert("You've reached your monthly AI limit. Upgrade your plan to generate more sites.");
        return;
      }

      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json() as { site: Site; orgSlug: string; walkthrough?: string[]; used?: number; limit?: number; remaining?: number };
      setSite(data.site);
      setOrgSlug(data.orgSlug);
      if (data.used !== undefined) {
        setUsage(prev => prev ? { ...prev, used: data.used!, limit: data.limit ?? prev.limit, remaining: data.remaining ?? 0 } : null);
      }
      setMessages([]);
      setMode("preview");
      setActiveTab("preview");
      // Animate the walkthrough steps into the chat
      if (data.walkthrough?.length) {
        for (let stepIdx = 0; stepIdx < data.walkthrough.length; stepIdx++) {
          const step = data.walkthrough[stepIdx];
          const msgId = crypto.randomUUID();
          setMessages(prev => [...prev, { id: msgId, role: "assistant" as const, content: "", streaming: true }]);
          let displayed = "";
          for (let i = 0; i < step.length; i++) {
            displayed += step[i];
            const snap = displayed;
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: snap } : m));
            await new Promise(r => setTimeout(r, step.length > 200 ? 5 : 10));
          }
          setMessages(prev => prev.map(m => m.id === msgId ? { ...m, streaming: false } : m));
          if (stepIdx < data.walkthrough.length - 1) {
            await new Promise(r => setTimeout(r, 700));
          }
        }
      }
    } catch {
      setMode("interview");
      alert("Site generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handlePublishClick = () => {
    if (!site) return;
    if (site.status !== "published" && !localStorage.getItem("steward_publish_disclaimer_accepted")) {
      setDisclaimerAccepted(false);
      setShowPublishDisclaimer(true);
      return;
    }
    void togglePublish();
  };

  const confirmPublish = () => {
    localStorage.setItem("steward_publish_disclaimer_accepted", "1");
    setShowPublishDisclaimer(false);
    void togglePublish();
  };

  const togglePublish = async () => {
    if (!site) return;
    setPublishing(true);
    try {
      const publish = site.status !== "published";
      const res = await csrfFetch("/api/sites/my/publish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ publish }),
      });
      const data = await res.json() as { site?: Site; siteUrl?: string; error?: string };
      if (!res.ok) {
        alert(data.error ?? "Failed to update site status.");
        return;
      }
      if (data.site) setSite(data.site);
      if (publish && data.siteUrl) {
        setOrgSlug(data.siteUrl.replace("https://", "").replace(".mypillar.co", ""));
      }
    } catch {
      alert("Failed to update site status. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const resetSite = async () => {
    if (!window.confirm("This will permanently delete your current website and reset it to a blank state. You'll need to regenerate a new site. Continue?")) return;
    try {
      const res = await csrfFetch("/api/site-engine/reset", { method: "DELETE" });
      if (!res.ok) throw new Error("Reset failed");
      setSite(null);
      setMessages([]);
      setMode("interview");
    } catch {
      alert("Failed to reset site. Please try again.");
    }
  };

  const proposeChange = async () => {
    if (!changeInput.trim() || changePending) return;
    setChangePending(true);
    setChangeError(null);
    setProposedHtml(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      let res: Response;
      try {
        res = await csrfFetch("/api/sites/change-request/propose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ changeRequest: changeInput }),
          signal: controller.signal,
        });
      } catch (err) {
        const msg = err instanceof DOMException && err.name === "AbortError"
          ? "Request timed out. Please try again."
          : "Could not reach the server. Check your connection and try again.";
        setChangeError(msg);
        return;
      }

      if (res.status === 403) {
        setChangeError("Change requests require a paid plan (Starter or higher).");
        return;
      }
      if (res.status === 429) {
        setChangeError("Monthly AI limit reached. Upgrade to continue.");
        return;
      }
      if (!res.ok) {
        let errMsg = "Proposal failed. Please try again.";
        try { const d = await res.json() as { error?: string }; errMsg = d.error ?? errMsg; } catch { /* non-JSON body */ }
        setChangeError(errMsg);
        return;
      }

      let data: { proposalReady: boolean; used: number; limit: number; remaining: number };
      try {
        data = await res.json() as typeof data;
      } catch {
        setChangeError("Unexpected response from server. Please try again.");
        return;
      }
      setUsage(prev => prev ? { ...prev, used: data.used, remaining: data.remaining } : null);

      // Fetch the proposal HTML from the server (server-stored, never client-supplied)
      let previewRes: Response;
      try {
        previewRes = await csrfFetch("/api/sites/my/proposal-preview", { credentials: "include" });
      } catch {
        setChangeError("Preview could not be loaded. Please try again.");
        return;
      }
      if (!previewRes.ok) {
        let previewErr = "Failed to load preview. Please try again.";
        try { const d = await previewRes.json() as { error?: string }; previewErr = d.error ?? previewErr; } catch { /* non-JSON body */ }
        setChangeError(previewErr);
        return;
      }
      let previewData: { proposedHtml: string };
      try {
        previewData = await previewRes.json() as typeof previewData;
      } catch {
        setChangeError("Preview data was unreadable. Please try again.");
        return;
      }
      setProposedHtml(previewData.proposedHtml);
      setPreviewKey(k => k + 1);
      setActiveTab("preview");
    } finally {
      clearTimeout(timeout);
      setChangePending(false);
    }
  };

  const handleEditPanelImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (editPanelImages.length + files.length > 4) { alert("You can attach up to 4 images per message."); return; }
    setEditPanelUploading(true);
    try {
      const uploads = await Promise.all(files.map(async f => ({ url: await uploadImage(f), name: f.name })));
      setEditPanelImages(prev => [...prev, ...uploads]);
    } catch { alert("Image upload failed. Please try again."); }
    finally { setEditPanelUploading(false); if (editPanelFileInputRef.current) editPanelFileInputRef.current.value = ""; }
  };

  const handleSiteEditSend = async () => {
    const text = input.trim();
    if ((!text && editPanelImages.length === 0) || chatLoading) return;
    setInput("");
    const imagesCopy = [...editPanelImages];
    setEditPanelImages([]);
    // Build the display message — include image names if any
    const displayText = text || (imagesCopy.length > 0 ? `Uploaded ${imagesCopy.length} image${imagesCopy.length > 1 ? "s" : ""}` : "");
    const userMsgId = crypto.randomUUID();
    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: "user" as const, content: displayText, images: imagesCopy.length > 0 ? imagesCopy.map(i => i.url) : undefined },
    ]);
    const assistantMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: assistantMsgId, role: "assistant" as const, content: "", streaming: true }]);
    setChatLoading(true);
    setProposedHtml(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      let res: Response;
      try {
        res = await csrfFetch("/api/sites/change-request/propose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            changeRequest: text || "Incorporate the uploaded images into the site.",
            uploadedImageUrls: imagesCopy.length > 0 ? imagesCopy.map(i => i.url) : undefined,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        const msg = err instanceof DOMException && err.name === "AbortError" ? "Request timed out. Please try again." : "Connection error. Please try again.";
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: msg, streaming: false } : m));
        return;
      }
      if (res.status === 403) {
        const reply = "Change requests require a paid plan. Upgrade to Starter or above to edit your site.";
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: reply, streaming: false } : m));
        return;
      }
      if (res.status === 429) {
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: "Monthly AI limit reached. Upgrade to continue.", streaming: false } : m));
        return;
      }
      if (!res.ok) {
        let errMsg = "Something went wrong. Please try again.";
        try { const d = await res.json() as { error?: string }; errMsg = d.error ?? errMsg; } catch { /* non-JSON */ }
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: errMsg, streaming: false } : m));
        return;
      }
      const data = await res.json() as { proposalReady: boolean; used: number; limit: number; remaining: number };
      setUsage(prev => prev ? { ...prev, used: data.used, remaining: data.remaining } : null);
      const previewRes = await csrfFetch("/api/sites/my/proposal-preview", { credentials: "include" });
      if (!previewRes.ok) {
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: "Preview could not be loaded. Please try again.", streaming: false } : m));
        return;
      }
      const previewData = await previewRes.json() as { proposedHtml: string };
      setProposedHtml(previewData.proposedHtml);
      setPreviewKey(k => k + 1);
      setActiveTab("preview");
      const reply = "Done — the preview shows the updated version. Accept or discard the change below.";
      let displayed = "";
      for (let i = 0; i < reply.length; i++) {
        displayed += reply[i];
        const snap = displayed;
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: snap } : m));
        await new Promise(r => setTimeout(r, 10));
      }
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, streaming: false } : m));
    } finally {
      clearTimeout(timeout);
      setChatLoading(false);
    }
  };

  const applyChange = async () => {
    // No HTML sent from client — server applies its stored proposal
    try {
      const res = await csrfFetch("/api/sites/change-request/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { site: Site };
      setSite(data.site);
      setProposedHtml(null);
      setChangeInput("");
      setPreviewKey(k => k + 1);
    } catch {
      setChangeError("Failed to apply change. Please try again.");
    }
  };

  const discardChange = async () => {
    setProposedHtml(null);
    // Clear server-side proposal
    csrfFetch("/api/sites/my/proposal", { method: "DELETE", credentials: "include" }).catch(() => {});
    setPreviewKey(k => k + 1);
  };

  const saveSchedule = async () => {
    setScheduleSaving(true);
    setScheduleMessage(null);
    try {
      const res = await csrfFetch("/api/sites/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          frequency: scheduleForm.frequency,
          dayOfWeek: scheduleForm.frequency === "weekly" ? scheduleForm.dayOfWeek : undefined,
          updateItems: scheduleForm.updateItems,
          customInstructions: scheduleForm.customInstructions || null,
          isActive: scheduleForm.isActive,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { schedule: Schedule };
      setSchedule(data.schedule);
      setScheduleMessage("Schedule saved.");
    } catch {
      setScheduleMessage("Failed to save. Please try again.");
    } finally {
      setScheduleSaving(false);
    }
  };

  const runScheduleNow = async () => {
    setScheduleRunning(true);
    setScheduleMessage(null);
    try {
      const res = await csrfFetch("/api/sites/schedule/run", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { html: string; lastRunAt: string; nextRunAt: string | null };
      setSite(prev => prev ? { ...prev, generatedHtml: data.html, updatedAt: new Date().toISOString() } : null);
      setPreviewKey(k => k + 1);
      setSchedule(prev => prev ? { ...prev, lastRunAt: data.lastRunAt, nextRunAt: data.nextRunAt } : null);
      setScheduleMessage("Site updated successfully.");
    } catch {
      setScheduleMessage("Update failed. Please try again.");
    } finally {
      setScheduleRunning(false);
    }
  };

  const deleteSchedule = async () => {
    if (!confirm("Delete this schedule? Auto-updates will stop.")) return;
    await csrfFetch("/api/sites/schedule", { method: "DELETE", credentials: "include" });
    setSchedule(null);
    setScheduleMessage("Schedule deleted.");
  };

  const toggleUpdateItem = (item: string) => {
    setScheduleForm(prev => ({
      ...prev,
      updateItems: prev.updateItems.includes(item) ? prev.updateItems.filter(i => i !== item) : [...prev.updateItems, item],
    }));
  };

  if (siteLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── */}
      <div className="px-6 py-3.5 border-b border-white/8 flex items-center justify-between bg-[hsl(224,40%,10%)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">AI Site Builder</h1>
            <p className="text-xs text-muted-foreground">
              {mode === "preview"
                ? site?.status === "published" ? "Live on the web" : "Draft — not yet published"
                : mode === "generating" ? "Building your site…"
                : `Interview · Step ${interviewProgress}/8`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {mode === "preview" && (
            <Button variant="ghost" size="sm" onClick={() => { setMode("interview"); setMessages([]); setProposedHtml(null); }} className="h-8 text-xs text-slate-400 hover:text-white">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Rebuild
            </Button>
          )}
          {usage && (
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className={`text-xs font-medium tabular-nums ${usageColor}`}>{usage.remaining}/{usage.limit}</p>
                <p className="text-[10px] text-muted-foreground">msgs left</p>
              </div>
              <div className="w-10 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${usageBarColor}`} style={{ width: `${Math.min(usagePercent, 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Generating ── */}
      {mode === "generating" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Globe className="w-10 h-10 text-primary" />
            </div>
            <div className="absolute -right-1 -top-1 w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-white mb-2">Building your site…</h2>
            <p className="text-sm text-muted-foreground max-w-xs">Analyzing your answers and generating a complete, branded website. This takes about 20–30 seconds.</p>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />)}
          </div>
        </div>
      )}

      {/* ── Preview mode — two-panel layout ── */}
      {mode === "preview" && site?.generatedHtml && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden sm:flex-row">

          {/* ── Mobile panel toggle (chat vs preview) ── */}
          <div className="sm:hidden flex-shrink-0 flex border-b border-white/8 bg-[hsl(224,40%,9%)]">
            <button
              onClick={() => setMobilePanel("preview")}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${mobilePanel === "preview" ? "border-primary text-white" : "border-transparent text-slate-400"}`}
            >
              Preview
            </button>
            <button
              onClick={() => setMobilePanel("chat")}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${mobilePanel === "chat" ? "border-primary text-white" : "border-transparent text-slate-400"}`}
            >
              Edit &amp; Chat
            </button>
          </div>

          {/* ── LEFT: Site chat panel ── */}
          <div className={`${mobilePanel === "chat" ? "flex" : "hidden"} sm:flex w-full sm:w-72 flex-shrink-0 border-r border-white/8 flex-col min-h-0 bg-[hsl(224,40%,9%)]`}>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-xl text-xs leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-white/8 text-slate-200 rounded-tl-sm border border-white/8"}`}>
                    {msg.images && msg.images.length > 0 && (
                      <div className={`flex gap-1.5 flex-wrap p-2 ${msg.content ? "pb-1" : "pb-2"}`}>
                        {msg.images.map((url, i) => (
                          <img key={i} src={url} alt="attachment" className="h-16 w-16 object-cover rounded-lg border border-white/15" />
                        ))}
                      </div>
                    )}
                    {msg.content ? (
                      <p className={`whitespace-pre-wrap px-3 py-2.5 ${msg.images && msg.images.length > 0 ? "pt-0" : ""}`}>{msg.content}</p>
                    ) : msg.streaming ? (
                      <div className="flex gap-1 px-3 py-2.5">
                        {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                      </div>
                    ) : null}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-slate-300" />
                    </div>
                  )}
                </div>
              ))}
              {/* Accept / Discard when a proposal is pending */}
              {proposedHtml && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={applyChange} className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-500">
                    <Check className="w-3 h-3 mr-1" /> Accept
                  </Button>
                  <Button size="sm" onClick={discardChange} variant="ghost" className="flex-1 h-7 text-xs text-slate-400 hover:text-white border border-white/10">
                    <X className="w-3 h-3 mr-1" /> Discard
                  </Button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div className="border-t border-white/8 px-3 py-3 flex-shrink-0 space-y-2">
              {/* Attached image previews */}
              {editPanelImages.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {editPanelImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img src={img.url} alt={img.name} className="h-12 w-12 object-cover rounded-lg border border-white/15" />
                      <button
                        onClick={() => setEditPanelImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-700 border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5 items-end">
                {/* Hidden file input */}
                <input
                  ref={editPanelFileInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES}
                  multiple
                  className="hidden"
                  onChange={handleEditPanelImageUpload}
                />
                {/* Upload button */}
                <button
                  onClick={() => editPanelFileInputRef.current?.click()}
                  disabled={chatLoading || editPanelUploading || editPanelImages.length >= 4}
                  title="Attach images"
                  className="w-8 h-8 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-white/12 transition-colors"
                >
                  {editPanelUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" /> : <ImagePlus className="w-3.5 h-3.5 text-slate-400" />}
                </button>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSiteEditSend(); } }}
                  placeholder="Ask me to change anything…"
                  disabled={chatLoading}
                  rows={1}
                  className="flex-1 resize-none bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[34px] max-h-[80px]"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
                <button
                  onClick={() => void handleSiteEditSend()}
                  disabled={(!input.trim() && editPanelImages.length === 0) || chatLoading}
                  className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-primary/80 transition-colors"
                >
                  {chatLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : <Send className="w-3.5 h-3.5 text-white" />}
                </button>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Site preview ── */}
          <div className={`${mobilePanel === "preview" ? "flex" : "hidden"} sm:flex flex-1 overflow-hidden flex-col min-h-0`}>

          {/* Status bar */}
          <div className="px-4 py-2 border-b border-white/8 bg-[hsl(224,40%,9%)] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${site.status === "published" ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span className="text-xs text-slate-300">
                {site.status === "published" ? "Live" : "Draft"} · Updated {formatRelativeTime(site.updatedAt)}
              </span>
              {site.status === "published" && publicUrl && (
                <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                  <ExternalLink className="w-3 h-3" /> View live
                </a>
              )}
            </div>
            <Button data-tour="publish-site-btn" size="sm" onClick={handlePublishClick} disabled={publishing} className={`h-7 text-xs ${site.status === "published" ? "bg-slate-600 hover:bg-slate-500" : "bg-emerald-600 hover:bg-emerald-500"}`}>
              {publishing ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : site.status === "published" ? <EyeOff className="w-3 h-3 mr-1.5" /> : <CheckCircle2 className="w-3 h-3 mr-1.5" />}
              {site.status === "published" ? "Unpublish" : "Publish"}
            </Button>
          </div>

          {/* Tabs */}
          <div className="px-4 border-b border-white/8 bg-[hsl(224,40%,9%)] flex items-center gap-1 flex-shrink-0">
            {[
              { id: "preview", label: "Preview", icon: Eye },
              { id: "edit", label: "Edit", icon: Edit3, locked: !tierAllowsChanges(tier) },
              ...(tierAllowsSchedule(tier) ? [{ id: "schedule", label: "Auto-Update", icon: Zap, locked: false }] : []),
              { id: "shop", label: "Shop", icon: ShoppingBag, locked: false, dot: !!shopEmbedCode },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs border-b-2 transition-colors ${activeTab === tab.id ? "border-primary text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === "schedule" && schedule?.isActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />}
                {"dot" in tab && tab.dot && <div className="w-1.5 h-1.5 rounded-full bg-primary ml-0.5" />}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {/* Preview tab — real compiled site in isolated iframe */}
            {activeTab === "preview" && (
              <div className="flex flex-col h-full min-h-0 bg-[#080c18]">

                {/* ── Browser chrome ───────────────────────────────────────── */}
                <div className="flex-shrink-0 bg-[#0d1525] border-b border-white/[0.07]">
                  {/* Top row: window dots + address bar + viewport + actions */}
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    {/* macOS-style window dots */}
                    <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                      <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                      <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                    </div>

                    {/* Address bar */}
                    <div className="flex-1 flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.09] transition-colors rounded-lg px-3 py-1.5 min-w-0 border border-white/[0.06]">
                      <svg className="w-3 h-3 flex-shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      {slugEditing ? (
                        <div className="flex-1 flex flex-col gap-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={slugInput}
                              onChange={e => { setSlugInput(e.target.value); setSlugError(null); }}
                              onKeyDown={e => { if (e.key === "Enter") handleSaveSlug(); if (e.key === "Escape") { setSlugEditing(false); setSlugError(null); } }}
                              className="flex-1 bg-white/10 rounded px-2 py-0.5 text-[11px] font-mono text-white outline-none border border-primary/50 focus:border-primary min-w-0"
                              placeholder={orgSlug ?? "your-org"}
                            />
                            <span className="text-[11px] text-slate-400 flex-shrink-0">.mypillar.co</span>
                            <button onClick={handleSaveSlug} disabled={slugSaving} className="p-1 rounded text-emerald-400 hover:bg-emerald-400/10 flex-shrink-0">
                              {slugSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            </button>
                            <button onClick={() => { setSlugEditing(false); setSlugError(null); }} className="p-1 rounded text-slate-400 hover:bg-white/10 flex-shrink-0">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          {slugError && <p className="text-[10px] text-red-400 leading-tight">{slugError}</p>}
                        </div>
                      ) : (
                        <>
                          <span className="text-[11.5px] font-medium tracking-tight truncate" style={{ color: "#c8d0e0" }}>
                            {site?.status === "published" && orgSlug
                              ? `${orgSlug}.mypillar.co`
                              : "preview.mypillar.co — draft"}
                          </span>
                          {site?.status === "published" && orgSlug && (
                            <button
                              title="Edit URL"
                              onClick={() => { setSlugInput(orgSlug); setSlugEditing(true); setSlugError(null); }}
                              className="flex-shrink-0 p-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-white/10 transition-colors"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                          )}
                          {site?.status === "published"
                            ? <span className="ml-auto flex-shrink-0 text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">Live</span>
                            : <span className="ml-auto flex-shrink-0 text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">Draft</span>
                          }
                        </>
                      )}
                    </div>

                    {/* Viewport segmented control */}
                    <div className="flex items-center bg-white/[0.06] rounded-lg p-0.5 border border-white/[0.06] flex-shrink-0">
                      {([
                        { id: "mobile" as const, icon: Smartphone, w: "390px" },
                        { id: "tablet" as const, icon: Tablet, w: "768px" },
                        { id: "desktop" as const, icon: Monitor, w: "full" },
                      ]).map(vp => (
                        <button
                          key={vp.id}
                          onClick={() => setPreviewViewport(vp.id)}
                          title={`${vp.id.charAt(0).toUpperCase() + vp.id.slice(1)} (${vp.w})`}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                            previewViewport === vp.id
                              ? "bg-primary text-white shadow-sm"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          <vp.icon className="w-3.5 h-3.5" />
                          <span className="hidden lg:inline capitalize">{vp.id}</span>
                        </button>
                      ))}
                    </div>

                    {/* Reload */}
                    <button
                      onClick={() => setPreviewKey(k => k + 1)}
                      title="Reload preview"
                      className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-white/8 transition-all flex-shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>

                    {/* Open live */}
                    {site?.status === "published" && publicUrl && (
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open live site"
                        className="p-1.5 rounded-md text-primary hover:text-primary/80 hover:bg-primary/10 transition-all flex-shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {/* Section nav — underline tabs */}
                  <div className="flex items-center gap-1 px-4 overflow-x-auto">
                    {[
                      { label: "Home", hash: "" },
                      { label: "About", hash: "#about" },
                      { label: "Programs", hash: "#programs" },
                      { label: "Events", hash: "#events" },
                      { label: "Contact", hash: "#contact" },
                    ].map(s => (
                      <button
                        key={s.hash}
                        onClick={() => navigatePreviewTo(s.hash)}
                        className={`relative px-3 py-2 text-[11.5px] font-medium transition-colors whitespace-nowrap ${
                          previewSection === s.hash
                            ? "text-white"
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        {s.label}
                        {previewSection === s.hash && (
                          <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-primary rounded-full" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Viewport stage ───────────────────────────────────────── */}
                <div className="flex-1 min-h-0 overflow-auto flex justify-center items-start py-5 px-4"
                  style={{ background: "radial-gradient(ellipse at 50% 0%, #111827 0%, #080c18 70%)" }}
                >
                  {previewViewport === "desktop" ? (
                    /* Desktop — full width, simple shadow */
                    <div className="w-full h-full min-h-[600px] rounded-t-lg overflow-hidden shadow-2xl shadow-black/60 border border-white/[0.07]">
                      <iframe
                        key={previewKey}
                        ref={iframeRef}
                        src={`/api/sites/preview-html${previewSection}`}
                        style={{ width: "100%", height: "100%", border: "none", display: "block", background: "#fff", minHeight: "600px" }}
                        sandbox="allow-scripts allow-forms allow-popups"
                        title="Site Preview"
                      />
                    </div>
                  ) : previewViewport === "tablet" ? (
                    /* Tablet — centered with device frame */
                    <div className="flex flex-col items-center gap-0 flex-shrink-0" style={{ width: 800 }}>
                      <div className="w-full rounded-[16px] overflow-hidden shadow-2xl shadow-black/70 border-[6px] border-[#1e2a3a]"
                        style={{ width: 784 }}>
                        <iframe
                          key={previewKey}
                          ref={iframeRef}
                          src={`/api/sites/preview-html${previewSection}`}
                          style={{ width: "100%", minHeight: "580px", height: "70vh", border: "none", display: "block", background: "#fff" }}
                          sandbox="allow-scripts allow-forms allow-popups"
                          title="Site Preview"
                        />
                      </div>
                      <div className="mt-3 text-[10px] text-slate-600 font-medium tracking-widest uppercase">Tablet · 768px</div>
                    </div>
                  ) : (
                    /* Mobile — phone frame */
                    <div className="flex flex-col items-center gap-0 flex-shrink-0">
                      {/* Phone shell */}
                      <div className="relative rounded-[36px] border-[8px] border-[#1a2035] shadow-2xl shadow-black/80 overflow-hidden bg-white"
                        style={{ width: 390 }}>
                        {/* Notch bar */}
                        <div className="flex items-center justify-between px-6 py-2 bg-white border-b border-gray-100">
                          <span className="text-[10px] font-semibold text-gray-400">9:41</span>
                          <div className="flex items-center gap-1">
                            <div className="w-3.5 h-3.5 rounded-full bg-[#1a2035]" />
                            <div className="w-7 h-3.5 rounded-sm bg-[#1a2035]" />
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-1 h-2.5 rounded-sm bg-gray-400" />
                            <div className="w-1 h-2.5 rounded-sm bg-gray-400" />
                            <div className="w-1 h-2.5 rounded-sm bg-gray-400" />
                            <div className="w-4 h-2.5 rounded-sm border border-gray-400 ml-0.5">
                              <div className="w-3 h-full bg-gray-400 rounded-sm" />
                            </div>
                          </div>
                        </div>
                        <iframe
                          key={previewKey}
                          ref={iframeRef}
                          src={`/api/sites/preview-html${previewSection}`}
                          style={{ width: "100%", minHeight: "680px", border: "none", display: "block", background: "#fff" }}
                          sandbox="allow-scripts allow-forms allow-popups"
                          title="Site Preview"
                        />
                        {/* Home bar */}
                        <div className="flex items-center justify-center py-2 bg-white border-t border-gray-100">
                          <div className="w-24 h-1 rounded-full bg-gray-300" />
                        </div>
                      </div>
                      <div className="mt-3 text-[10px] text-slate-600 font-medium tracking-widest uppercase">Mobile · 390px</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Edit tab */}
            {activeTab === "edit" && (
              <div className="h-full overflow-y-auto p-6 space-y-5">
                {!tierAllowsChanges(tier) ? (
                  <div className="flex flex-col items-center gap-4 py-10 text-center">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Edit3 className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white mb-1">Upgrade to edit your site</h3>
                      <p className="text-sm text-muted-foreground max-w-xs">Change requests are available on the Starter plan and above.</p>
                    </div>
                    <Link href="/billing"><Button>Upgrade Plan</Button></Link>
                  </div>
                ) : (
                  <>
                    {/* Sync Events */}
                    <div className="p-4 rounded-xl border border-white/8 bg-white/3 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <CalendarClock className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-white mb-0.5">Sync Events to Site</h3>
                          <p className="text-xs text-muted-foreground">Automatically update your site's events section with events from your Events dashboard.</p>
                        </div>
                      </div>
                      {syncMessage && (
                        <div className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${syncMessage.toLowerCase().includes("fail") || syncMessage.toLowerCase().includes("error") ? "bg-red-500/10 border-red-500/20 text-red-300" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"}`}>
                          {syncMessage.toLowerCase().includes("fail") || syncMessage.toLowerCase().includes("error")
                            ? <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            : <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
                          <span>{syncMessage}</span>
                        </div>
                      )}
                      <Button onClick={syncEvents} disabled={syncingEvents || isLimitReached} size="sm" variant="outline" className="w-full border-white/15 text-white hover:bg-white/8">
                        {syncingEvents ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Syncing Events…</> : <><CalendarClock className="w-3.5 h-3.5 mr-1.5" /> Sync Events to Site</>}
                      </Button>
                    </div>

                    <div>
                      <h2 className="text-base font-semibold text-white mb-1">Request a change</h2>
                      <p className="text-xs text-muted-foreground mb-4">
                        Describe what you'd like to update. The AI will generate a preview — you confirm before it goes live.
                      </p>

                      {changeError && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-3">
                          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                          <p className="text-sm text-red-300">{changeError}</p>
                        </div>
                      )}

                      <Textarea
                        value={changeInput}
                        onChange={e => setChangeInput(e.target.value)}
                        placeholder='e.g. "Update our meeting time to Tuesdays at 7pm" or "Add a donate button to the hero section"'
                        rows={3}
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none mb-3"
                        disabled={changePending}
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Generates a preview for your approval before saving</p>
                        <Button onClick={proposeChange} disabled={!changeInput.trim() || changePending || isLimitReached} size="sm" className="bg-primary hover:bg-primary/90">
                          {changePending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating…</> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Preview Change</>}
                        </Button>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/8">
                      <h3 className="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wide">Quick examples</h3>
                      <div className="grid gap-2">
                        {[
                          "Update our meeting time to the first Thursday of each month at 6:30pm",
                          "Add a membership sign-up call-to-action to the hero section",
                          "Change the contact email to info@myorg.org",
                          "Add an upcoming annual gala event to the events section",
                        ].map((ex, i) => (
                          <button key={i} onClick={() => setChangeInput(ex)} className="text-left p-3 rounded-lg border border-white/8 bg-white/3 hover:bg-white/6 transition-colors text-xs text-slate-300 flex items-center gap-2">
                            <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                            {ex}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/8 space-y-2">
                      <h3 className="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wide">Rebuild site</h3>
                      <button
                        onClick={() => {
                          setMessages([]);
                          setImportData(null);
                          setEditableImportData(null);
                          setImportError(null);
                          setImportUrl("");
                          setShowImportForm(true);
                          setShowSetup(false);
                          setMode("interview");
                        }}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-white/10 bg-white/3 hover:bg-white/6 hover:border-white/20 transition-all text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Link2 className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white">Import from existing website</p>
                          <p className="text-xs text-slate-500">Paste your URL — Pillar reads your site and rebuilds from your real content</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors flex-shrink-0" />
                      </button>
                      <button
                        onClick={() => {
                          setMessages([]);
                          setImportData(null);
                          setEditableImportData(null);
                          setShowImportForm(false);
                          setShowSetup(true);
                          setMode("interview");
                        }}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-white/10 bg-white/3 hover:bg-white/6 hover:border-white/20 transition-all text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white">Start fresh interview</p>
                          <p className="text-xs text-slate-500">Answer a few questions and generate a completely new version</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors flex-shrink-0" />
                      </button>

                      <button
                        onClick={resetSite}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/30 transition-all text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-red-300">Delete site & start over</p>
                          <p className="text-xs text-red-500/70">Permanently removes the current site so you can build fresh</p>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Schedule tab */}
            {activeTab === "schedule" && tierAllowsSchedule(tier) && (
              <div className="h-full overflow-y-auto p-6 space-y-6">
                {scheduleMessage && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg border ${scheduleMessage.includes("ailed") ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
                    <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${scheduleMessage.includes("ailed") ? "text-red-400" : "text-emerald-400"}`} />
                    <p className={`text-sm ${scheduleMessage.includes("ailed") ? "text-red-300" : "text-emerald-300"}`}>{scheduleMessage}</p>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-base font-semibold text-white">Auto-Update Schedule</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Active</span>
                      <button onClick={() => setScheduleForm(prev => ({ ...prev, isActive: !prev.isActive }))} className={`w-9 h-5 rounded-full transition-colors relative ${scheduleForm.isActive ? "bg-primary" : "bg-white/20"}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scheduleForm.isActive ? "left-4" : "left-0.5"}`} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">The AI automatically updates your site on schedule — no action needed.</p>
                </div>

                {schedule?.lastRunAt && (
                  <div className="flex gap-6 p-3 rounded-lg bg-white/5 border border-white/8">
                    <div>
                      <p className="text-xs text-slate-400">Last run</p>
                      <p className="text-sm text-white mt-0.5">{formatRelativeTime(schedule.lastRunAt)}</p>
                    </div>
                    {schedule.nextRunAt && (
                      <div>
                        <p className="text-xs text-slate-400">Next run</p>
                        <p className="text-sm text-white mt-0.5">{new Date(schedule.nextRunAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-slate-300 mb-3">Frequency</p>
                  <div className="grid grid-cols-3 gap-2">
                    {["daily", "weekly", "monthly"].map(freq => (
                      <button key={freq} onClick={() => setScheduleForm(prev => ({ ...prev, frequency: freq }))} className={`p-2.5 rounded-lg border text-xs font-medium capitalize transition-colors ${scheduleForm.frequency === freq ? "border-primary bg-primary/10 text-primary" : "border-white/10 text-slate-400 hover:border-white/20 hover:text-white"}`}>
                        {freq}
                      </button>
                    ))}
                  </div>
                  {scheduleForm.frequency === "weekly" && (
                    <div className="mt-3">
                      <p className="text-xs text-slate-400 mb-2">Run on</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {DAYS_OF_WEEK.map(day => (
                          <button key={day} onClick={() => setScheduleForm(prev => ({ ...prev, dayOfWeek: day }))} className={`px-2.5 py-1 rounded text-xs transition-colors ${scheduleForm.dayOfWeek === day ? "bg-primary text-white" : "bg-white/8 text-slate-400 hover:bg-white/12 hover:text-white"}`}>
                            {day.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-300 mb-3">What to update</p>
                  <div className="space-y-2">
                    {UPDATE_ITEMS.map(item => (
                      <label key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-white/8 cursor-pointer hover:bg-white/3 transition-colors">
                        <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${scheduleForm.updateItems.includes(item.id) ? "bg-primary border-primary" : "border-white/20"}`} onClick={() => toggleUpdateItem(item.id)}>
                          {scheduleForm.updateItems.includes(item.id) && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div onClick={() => toggleUpdateItem(item.id)}>
                          <p className="text-sm text-white">{item.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-300 mb-2">Custom instructions (optional)</p>
                  <Textarea value={scheduleForm.customInstructions} onChange={e => setScheduleForm(prev => ({ ...prev, customInstructions: e.target.value }))} placeholder='e.g. "Always keep a banner about our monthly charity drive visible"' rows={2} className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none text-sm" />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button onClick={saveSchedule} disabled={scheduleSaving} className="flex-1 bg-primary hover:bg-primary/90">
                    {scheduleSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Schedule
                  </Button>
                  {schedule && (
                    <Button onClick={runScheduleNow} disabled={scheduleRunning} variant="outline" className="border-white/10 text-slate-300 hover:text-white">
                      {scheduleRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                      Run Now
                    </Button>
                  )}
                  {schedule && (
                    <Button onClick={deleteSchedule} variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Shop tab */}
            {activeTab === "shop" && (
              <div className="h-full overflow-y-auto p-6 space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingBag className="w-4 h-4 text-primary" />
                    <h2 className="text-base font-semibold text-white">Embed Your Shop</h2>
                  </div>
                  <p className="text-xs text-muted-foreground">Paste an embed snippet from Shopify, Square, Gumroad, PayHip, Ko-fi, or any other platform. It will appear as a "Shop" section on your public site after you rebuild.</p>
                </div>

                {/* Platform pills */}
                <div className="flex flex-wrap gap-2">
                  {["Shopify Buy Button", "Gumroad", "Square", "PayHip", "Ko-fi", "Stripe Payment Link"].map(p => (
                    <span key={p} className="px-2.5 py-1 rounded-full text-xs border border-white/10 text-slate-400 bg-white/3">{p}</span>
                  ))}
                </div>

                {/* Embed code textarea */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">Embed Code</label>
                  <Textarea
                    value={shopEmbedCode}
                    onChange={e => setShopEmbedCode(e.target.value)}
                    placeholder={'Paste your embed code here, e.g.:\n<div id="product-component-..."></div>\n<script type="text/javascript">...</script>'}
                    rows={8}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 resize-none text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">Inline event handlers (onclick, etc.) are stripped for security. Scripts from external CDNs are allowed.</p>
                </div>

                {shopMessage && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${shopMessage.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-300" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"}`}>
                    {shopMessage.type === "error" ? <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
                    <span>{shopMessage.text}</span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button onClick={handleShopSave} disabled={shopSaving} className="flex-1 bg-primary hover:bg-primary/90">
                    {shopSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Embed Code
                  </Button>
                  {shopEmbedCode && (
                    <Button
                      onClick={async () => { setShopEmbedCode(""); await csrfFetch("/api/sites/embed-code", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embedCode: "" }) }); setShopMessage({ type: "success", text: "Embed code removed." }); }}
                      variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="p-4 rounded-xl border border-white/8 bg-white/3 space-y-2">
                  <p className="text-xs font-medium text-white">How it works</p>
                  <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                    <li>Get your embed snippet from your store platform (Shopify → Buy Button, Gumroad → Share, etc.)</li>
                    <li>Paste it above and click Save</li>
                    <li>Rebuild your site — a "Shop" section will appear between your events and contact sections</li>
                    <li>Publish — visitors can browse and buy without leaving your site</li>
                  </ol>
                </div>
              </div>
            )}
          </div>

          </div>
        </div>
      )}

      {/* ── Interview mode ── */}
      {mode === "interview" && (
        <>
          {/* Progress bar */}
          <div className="px-6 py-2 border-b border-white/8 bg-[hsl(224,40%,9%)] flex items-center gap-3 flex-shrink-0">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(interviewProgress / 8) * 100}%` }} />
            </div>
            <span className="text-xs text-slate-400 flex-shrink-0">{interviewProgress}/8 questions</span>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.length === 0 ? (
              <div className={`flex flex-col items-center text-center px-4 space-y-5 max-w-lg mx-auto w-full ${(importData || showSetup || showImportForm) ? "py-6" : "justify-center h-full py-6"}`}>
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Globe className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">Build your public website</h2>
                  <p className="text-sm text-muted-foreground">The AI will walk you through a few questions about your organization, then build a complete, branded website ready to publish.</p>
                </div>

                {isLimitReached ? (
                  <div className="flex flex-col items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/5 w-full max-w-sm">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <p className="text-sm text-red-300">You've used all {usage?.limit} AI messages this month.</p>
                    <Link href="/billing"><Button size="sm">Upgrade Plan</Button></Link>
                  </div>
                ) : importData && editableImportData ? (
                  /* ── Review & edit card ── */
                  <div className="w-full rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-left overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-emerald-500/15">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">Here's what I found — does this look right?</p>
                        <p className="text-xs text-emerald-400/80 truncate">{importedFromUrl}</p>
                      </div>
                      <button onClick={() => { setImportData(null); setEditableImportData(null); setImportError(null); }} className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="px-4 py-3 space-y-3">
                      {([
                        { key: "name", label: "Organization name", multiline: false },
                        { key: "mission", label: "Mission / purpose", multiline: true },
                        { key: "services", label: "Programs & services", multiline: true },
                        { key: "location", label: "Location", multiline: false },
                        { key: "schedule", label: "Meeting schedule", multiline: false },
                        { key: "events", label: "Upcoming events (future only)", multiline: true },
                        { key: "contact", label: "Contact info (email & phone)", multiline: false },
                        { key: "social", label: "Social media links", multiline: true },
                        { key: "leadership", label: "Leadership / board members", multiline: true },
                        { key: "audience", label: "Audience", multiline: false },
                        { key: "style", label: "Visual style & colors", multiline: false },
                        { key: "extra", label: "Other highlights", multiline: true },
                      ] as { key: "name"|"mission"|"services"|"location"|"schedule"|"events"|"contact"|"social"|"leadership"|"audience"|"style"|"extra"; label: string; multiline: boolean }[]).map(field => (
                        <div key={field.key} className="space-y-1">
                          <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{field.label}</label>
                          {field.multiline ? (
                            <textarea
                              value={editableImportData[field.key]}
                              onChange={e => setEditableImportData(prev => prev ? { ...prev, [field.key]: e.target.value } : null)}
                              rows={2}
                              className="w-full px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-slate-200 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50 placeholder:text-slate-600"
                              placeholder={`No ${field.label.toLowerCase()} found`}
                            />
                          ) : (
                            <input
                              type="text"
                              value={editableImportData[field.key]}
                              onChange={e => setEditableImportData(prev => prev ? { ...prev, [field.key]: e.target.value } : null)}
                              className="w-full px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500/50 placeholder:text-slate-600"
                              placeholder={`No ${field.label.toLowerCase()} found`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-3 border-t border-emerald-500/15">
                      <Button onClick={confirmImport} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm h-9">
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate My Site with This Content
                      </Button>
                    </div>
                  </div>
                ) : showImportForm ? (
                  /* ── URL input form ── */
                  <div className="w-full rounded-xl border border-white/10 bg-white/3 text-left overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
                      <Link2 className="w-4 h-4 text-primary flex-shrink-0" />
                      <p className="text-sm font-semibold text-white flex-1">Import from your existing website</p>
                      <button onClick={() => { setShowImportForm(false); setImportError(null); setImportUrl(""); }} className="text-slate-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4 space-y-3">
                      <p className="text-xs text-muted-foreground">Paste your current website URL. Pillar will read the page and extract your organization's information so you can skip straight to generating.</p>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={importUrl}
                          onChange={e => { setImportUrl(e.target.value); setImportError(null); }}
                          onKeyDown={e => { if (e.key === "Enter") void handleImportUrl(); }}
                          placeholder="https://www.myclub.org"
                          className="flex-1 h-9 px-3 rounded-md bg-white/5 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-primary/60"
                          disabled={importing}
                        />
                        <Button onClick={handleImportUrl} disabled={!importUrl.trim() || importing} size="sm" className="h-9 gap-1.5 flex-shrink-0">
                          {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          {importing ? "Importing…" : "Import"}
                        </Button>
                      </div>
                      {importing && (
                        <p className="text-xs text-muted-foreground animate-pulse">Reading your site and extracting content — this takes a few seconds…</p>
                      )}
                      {importError && (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-red-300">{importError}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : showSetup ? (
                  /* ── Setup wizard ── */
                  <div className="w-full rounded-xl border border-white/10 bg-white/3 text-left overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
                      <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                      <p className="text-sm font-semibold text-white flex-1">Customize your site</p>
                      <button onClick={() => setShowSetup(false)} className="text-slate-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4 space-y-5">

                      {/* Style preset */}
                      <div>
                        <p className="text-xs font-semibold text-slate-300 mb-2.5 uppercase tracking-wide">Choose a style</p>
                        <div className="grid grid-cols-2 gap-2">
                          {SITE_STYLES.map(style => (
                            <button
                              key={style.id}
                              onClick={() => setSelectedStyle(style.id)}
                              className={`relative p-3 rounded-lg border text-left transition-all ${selectedStyle === style.id ? "border-primary bg-primary/10" : "border-white/8 hover:border-white/20 hover:bg-white/3"}`}
                            >
                              {selectedStyle === style.id && (
                                <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                  <Check className="w-2.5 h-2.5 text-black" />
                                </div>
                              )}
                              <div className="flex gap-1 mb-2">
                                {style.swatches.map((c, i) => (
                                  <div key={i} className="w-4 h-4 rounded-sm flex-shrink-0 border border-white/10" style={{ backgroundColor: c }} />
                                ))}
                              </div>
                              <p className="text-xs font-semibold text-white leading-tight">{style.label}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{style.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Color theme */}
                      <div>
                        <p className="text-xs font-semibold text-slate-300 mb-2.5 uppercase tracking-wide">Color theme</p>
                        <div className="flex flex-wrap gap-2">
                          {COLOR_THEMES.map(theme => (
                            <button
                              key={theme.id}
                              onClick={() => setSelectedColorTheme(theme.id)}
                              title={theme.label}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-all ${selectedColorTheme === theme.id ? "border-primary text-white" : "border-white/10 text-slate-400 hover:border-white/25"}`}
                            >
                              <span className="w-3 h-3 rounded-full flex-shrink-0 border border-white/15" style={{ backgroundColor: theme.bg }} />
                              <span className="w-3 h-3 rounded-full flex-shrink-0 border border-white/15" style={{ backgroundColor: theme.accent }} />
                              {theme.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Section picker */}
                      <div>
                        <p className="text-xs font-semibold text-slate-300 mb-2.5 uppercase tracking-wide">Sections to include</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {SITE_SECTIONS.map(section => {
                            const required = "required" in section && section.required;
                            const selected = selectedSections.includes(section.id);
                            return (
                              <button
                                key={section.id}
                                onClick={() => toggleSection(section.id)}
                                disabled={required}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all text-xs ${selected ? "border-primary/40 bg-primary/8 text-white" : "border-white/8 text-slate-400 hover:border-white/20 hover:text-slate-300"} ${required ? "opacity-60 cursor-default" : ""}`}
                              >
                                <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${selected ? "border-primary bg-primary" : "border-white/20"}`}>
                                  {selected && <Check className="w-2.5 h-2.5 text-black" />}
                                </div>
                                <span>{section.emoji} {section.label}</span>
                                {required && <span className="ml-auto text-[10px] text-slate-500">required</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="px-4 py-3 border-t border-white/8">
                      <Button onClick={startWithSetup} disabled={chatLoading} className="w-full bg-primary hover:bg-primary/90">
                        <Sparkles className="w-4 h-4 mr-1.5" /> Start Interview
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ── Start options ── */
                  <div className="w-full space-y-3">
                    <Button onClick={() => setShowSetup(true)} disabled={chatLoading} className="w-full bg-primary hover:bg-primary/90">
                      <Sparkles className="w-4 h-4 mr-2" /> Start from Scratch
                    </Button>
                    <Button variant="outline" onClick={() => setShowImportForm(true)} className="w-full border-white/10 hover:bg-white/5 text-slate-300">
                      <Link2 className="w-4 h-4 mr-2" /> Import from my existing website
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {messages.map(msg => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-white/8 text-slate-200 rounded-tl-sm border border-white/8"}`}>
                      {msg.content ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div className="flex gap-1">
                          {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                        </div>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User className="w-4 h-4 text-slate-300" />
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />
          <input
            ref={photoInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            multiple
            className="hidden"
            onChange={handlePhotoUpload}
          />

          {/* Input bar */}
          <div className="px-6 py-4 border-t border-white/8 bg-[hsl(224,40%,10%)] flex-shrink-0 space-y-3">
            {/* Logo preview strip */}
            {logoDataUrl && (
              <div className="flex items-center gap-3 p-2.5 rounded-lg border border-primary/20 bg-primary/5">
                <img src={logoDataUrl} alt="Logo preview" className="h-10 w-auto max-w-[80px] object-contain rounded" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{logoFileName}</p>
                  <p className="text-xs text-muted-foreground">Logo will be added to your site</p>
                </div>
                <button onClick={() => { setLogoDataUrl(null); setLogoFileName(null); }} className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Photo preview strip */}
            {uploadedPhotos.length > 0 && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
                    <Images className="w-3.5 h-3.5" /> {uploadedPhotos.length} photo{uploadedPhotos.length !== 1 ? "s" : ""} added to site
                  </p>
                  {uploadedPhotos.length < 6 && (
                    <button onClick={() => photoInputRef.current?.click()} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                      + Add more
                    </button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {uploadedPhotos.map((photo, i) => (
                    <div key={i} className="relative group">
                      <img src={photo.url} alt={photo.name} className="h-14 w-14 object-cover rounded-md border border-white/10" />
                      <button
                        onClick={() => setUploadedPhotos(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {canGenerate && (
              <Button onClick={generateSite} disabled={generating} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white">
                {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Building your site…</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate My Site</>}
              </Button>
            )}

            {isLimitReached ? (
              <div className="flex items-center justify-between p-3 rounded-xl border border-red-500/20 bg-red-500/5">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-300">Monthly limit reached</p>
                </div>
                <Link href="/billing"><Button size="sm" variant="outline" className="border-red-500/30 text-red-300 h-8 text-xs">Upgrade</Button></Link>
              </div>
            ) : messages.length > 0 ? (
              <div className="flex gap-2 items-end">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload logo"
                  className="h-10 w-10 flex-shrink-0 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center text-slate-400 hover:text-white"
                >
                  <ImagePlus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading || uploadedPhotos.length >= 6}
                  title="Upload site photos (up to 6)"
                  className="h-10 w-10 flex-shrink-0 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {photoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Images className="w-4 h-4" />}
                </button>
                <Textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                  placeholder="Type your answer…"
                  rows={2}
                  className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none"
                  disabled={chatLoading}
                />
                <Button onClick={() => send(input)} disabled={!input.trim() || chatLoading} size="icon" className="h-10 w-10 flex-shrink-0">
                  {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}

      {showPublishDisclaimer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Before you publish</h2>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Your site was built using AI and may contain inaccuracies. Please review all content — including your organization name, contact details,
              meeting times, and any other information — before making it live.
            </p>
            <ul className="text-sm text-slate-400 space-y-1.5 pl-4">
              <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">•</span> Verify all facts, dates, and contact info are correct</li>
              <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">•</span> Ensure you have rights to any photos or content used</li>
              <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">•</span> AI-generated text may not reflect your organization exactly</li>
            </ul>
            <label className="flex items-start gap-3 cursor-pointer group pt-1">
              <input
                type="checkbox"
                checked={disclaimerAccepted}
                onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-primary shrink-0"
              />
              <span className="text-sm text-muted-foreground group-hover:text-slate-300 transition-colors leading-relaxed">
                I have reviewed the content and understand that I am responsible for all published material.
              </span>
            </label>
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                className="flex-1 border-white/20 text-white hover:bg-white/5"
                onClick={() => setShowPublishDisclaimer(false)}
              >
                Go back and review
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                disabled={!disclaimerAccepted}
                onClick={confirmPublish}
              >
                Publish site
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
