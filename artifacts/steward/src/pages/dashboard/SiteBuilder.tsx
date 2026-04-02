import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Globe, Sparkles, Bot, User, Loader2, AlertCircle,
  Eye, CheckCircle2, ExternalLink, RefreshCw, EyeOff,
  Edit3, Play, Save, Trash2, Zap, ChevronRight,
  X, Check, ImagePlus, CalendarClock, Images, ShoppingBag,
  Download, Link2,
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

type Message = { id: string; role: "user" | "assistant"; content: string; streaming?: boolean };
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
  audience: string;
  style: string;
  extra: string;
  /** Logo/icon URL detected from the crawled site */
  logoUrl?: string;
  /** Hero image URL detected from the crawled site */
  heroUrl?: string;
  /** Additional image URLs from the crawled site */
  imageUrls?: string[];
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
  const [shopEmbedCode, setShopEmbedCode] = useState("");
  const [shopSaving, setShopSaving] = useState(false);
  const [shopMessage, setShopMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importData, setImportData] = useState<ImportedSiteData | null>(null);
  const [editableImportData, setEditableImportData] = useState<ImportedSiteData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedFromUrl, setImportedFromUrl] = useState<string | null>(null);
  const [importedLogoUrl, setImportedLogoUrl] = useState<string | null>(null);
  const [importedHeroUrl, setImportedHeroUrl] = useState<string | null>(null);
  const [importedImageUrls, setImportedImageUrls] = useState<string[]>([]);
  const [showImportForm, setShowImportForm] = useState(false);

  const [showSetup, setShowSetup] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>("classic");
  const [selectedSections, setSelectedSections] = useState<string[]>(DEFAULT_SECTIONS);
  const [selectedColorTheme, setSelectedColorTheme] = useState<string>("navy-gold");

  const bottomRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

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

  const loadHtmlIntoIframe = useCallback((html: string) => {
    if (!iframeRef.current) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    iframeRef.current.src = url;
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, []);

  useEffect(() => {
    if (site?.generatedHtml && iframeRef.current && activeTab === "preview") {
      loadHtmlIntoIframe(proposedHtml ?? site.generatedHtml);
    }
  }, [site?.generatedHtml, proposedHtml, activeTab, loadHtmlIntoIframe]);

  useEffect(() => {
    if (activeTab === "preview" && site?.generatedHtml) {
      loadHtmlIntoIframe(proposedHtml ?? site.generatedHtml);
    }
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
  const publicUrl = orgSlug ? `/sites/${orgSlug}` : null;

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
      // Capture discovered images from the crawled site
      setImportedLogoUrl(data.data?.logoUrl ?? null);
      setImportedHeroUrl(data.data?.heroUrl ?? null);
      setImportedImageUrls(data.data?.imageUrls ?? []);
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
    const qa: { q: string; a: string }[] = [
      { q: `Let's build ${orgName}'s website! What is your mission or main purpose?`, a: d.mission || `We are ${orgName}.` },
      { q: "What programs, services, or activities do you offer?", a: d.services || "Various community programs and services." },
      { q: "Where are you located? Include address and regular schedule.", a: [d.location, d.schedule].filter(Boolean).join(". ") || "Location and schedule available upon request." },
      { q: "Tell me about your events — any recurring gatherings or fundraisers?", a: d.events || "We host regular community events throughout the year." },
      { q: "How should visitors reach you? Share email, phone, and social media.", a: d.contact || "Contact information available on our website." },
      { q: "Who are you trying to reach?", a: d.audience || "Community members, volunteers, and supporters." },
      { q: "Any color or style preferences for your site?", a: d.style || "Keep it consistent with our existing branding." },
      { q: "Anything else to highlight? Founding history, announcements, calls to action?", a: (d.extra ? d.extra + " " : "") + `Content imported from ${importedFromUrl ?? "existing website"}.` },
    ];
    const syntheticMessages: Message[] = [];
    qa.forEach(({ q, a }, i) => {
      syntheticMessages.push({ id: `import-ai-${i}`, role: "assistant", content: q });
      syntheticMessages.push({ id: `import-user-${i}`, role: "user", content: a });
    });
    syntheticMessages.push({ id: "import-ai-final", role: "assistant", content: "I have everything I need! Click **Generate My Site** to build your website." });
    setMessages(syntheticMessages);
    setImportData(null);
    setEditableImportData(null);
    setImportUrl("");
    // NOTE: Do NOT clear importedFromUrl / importedLogoUrl / importedHeroUrl / importedImageUrls here.
    // generateSite reads them — they stay until the site is actually generated.
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
          loadHtmlIntoIframe(proposeData.proposedHtml);
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
          importedLogoUrl: importedLogoUrl ?? undefined,
          importedHeroUrl: importedHeroUrl ?? undefined,
          importedImageUrls: importedImageUrls.length > 0 ? importedImageUrls : undefined,
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
      const data = await res.json() as { site: Site; orgSlug: string; used?: number; limit?: number; remaining?: number };
      setSite(data.site);
      setOrgSlug(data.orgSlug);
      if (data.used !== undefined) {
        setUsage(prev => prev ? { ...prev, used: data.used!, limit: data.limit ?? prev.limit, remaining: data.remaining ?? 0 } : null);
      }
      setMode("preview");
      setActiveTab("preview");
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
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { site: Site };
      setSite(data.site);
    } catch {
      alert("Failed to update site status.");
    } finally {
      setPublishing(false);
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
      loadHtmlIntoIframe(previewData.proposedHtml);
      setActiveTab("preview");
    } finally {
      clearTimeout(timeout);
      setChangePending(false);
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
    } catch {
      setChangeError("Failed to apply change. Please try again.");
    }
  };

  const discardChange = async () => {
    setProposedHtml(null);
    // Clear server-side proposal
    csrfFetch("/api/sites/my/proposal", { method: "DELETE", credentials: "include" }).catch(() => {});
    if (site?.generatedHtml) loadHtmlIntoIframe(site.generatedHtml);
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
      loadHtmlIntoIframe(data.html);
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
    <div className="flex flex-col h-full max-h-screen">
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

      {/* ── Preview mode ── */}
      {mode === "preview" && site?.generatedHtml && (
        <>
          {/* Proposed-change confirmation bar */}
          {proposedHtml && (
            <div className="px-4 py-2.5 border-b border-amber-500/30 bg-amber-500/10 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-xs text-amber-200">Previewing proposed change — review and confirm or discard</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={discardChange} variant="ghost" className="h-7 text-xs text-slate-400 hover:text-white">
                  <X className="w-3.5 h-3.5 mr-1" /> Discard
                </Button>
                <Button size="sm" onClick={applyChange} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500">
                  <Check className="w-3.5 h-3.5 mr-1" /> Apply Change
                </Button>
              </div>
            </div>
          )}

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
          <div className="flex-1 overflow-hidden">
            {/* Preview tab */}
            {activeTab === "preview" && (
              <iframe ref={iframeRef} className="w-full h-full border-0" title="Site Preview" sandbox="allow-same-origin" />
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
        </>
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
              <div className="flex flex-col items-center justify-center h-full text-center py-6 px-4 space-y-5 max-w-lg mx-auto w-full">
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
                    <div className="px-4 py-3 space-y-3 max-h-[380px] overflow-y-auto">
                      {([ 
                        { key: "name", label: "Organization name", multiline: false },
                        { key: "mission", label: "Mission / purpose", multiline: true },
                        { key: "services", label: "Programs & services", multiline: true },
                        { key: "location", label: "Location", multiline: false },
                        { key: "schedule", label: "Meeting schedule", multiline: false },
                        { key: "events", label: "Events", multiline: true },
                        { key: "contact", label: "Contact info", multiline: false },
                        { key: "audience", label: "Audience", multiline: false },
                        { key: "style", label: "Visual style", multiline: false },
                        { key: "extra", label: "Other highlights", multiline: true },
                      ] as { key: keyof ImportedSiteData; label: string; multiline: boolean }[]).map(field => (
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
                    {(importedLogoUrl || importedHeroUrl || importedImageUrls.length > 0) && (
                      <div className="px-4 py-3 border-t border-emerald-500/15 space-y-2">
                        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Images detected from your site</p>
                        <div className="flex flex-wrap gap-2">
                          {importedLogoUrl && (
                            <div className="relative group">
                              <img
                                src={importedLogoUrl}
                                alt="Detected logo"
                                className="h-10 w-auto max-w-[80px] object-contain rounded bg-white/10 p-1 border border-white/15"
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                              <span className="absolute -bottom-4 left-0 text-[9px] text-emerald-400 whitespace-nowrap">Logo</span>
                            </div>
                          )}
                          {importedHeroUrl && (
                            <div className="relative group">
                              <img
                                src={importedHeroUrl}
                                alt="Detected hero image"
                                className="h-10 w-16 object-cover rounded border border-white/15"
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                              <span className="absolute -bottom-4 left-0 text-[9px] text-emerald-400 whitespace-nowrap">Hero</span>
                            </div>
                          )}
                          {importedImageUrls.slice(0, 3).map((url, i) => (
                            <div key={url} className="relative group">
                              <img
                                src={url}
                                alt={`Site image ${i + 1}`}
                                className="h-10 w-16 object-cover rounded border border-white/15"
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-3">These will be used in your generated site. Upload your own images after generation to replace them.</p>
                      </div>
                    )}
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
                    <div className="p-4 space-y-5 max-h-[420px] overflow-y-auto">

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
