import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Globe, Sparkles, Bot, User, Loader2, AlertCircle,
  Eye, CheckCircle2, ExternalLink, RefreshCw, EyeOff,
  Edit3, Play, Save, Trash2, Zap, ChevronRight,
  X, Check,
} from "lucide-react";
import { useGetOrganization } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";

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

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
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
  const [activeTab, setActiveTab] = useState<"preview" | "edit" | "schedule">("preview");

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

  const bottomRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    Promise.all([
      fetch("/api/sites/builder/usage", { credentials: "include" }).then(r => r.json()),
      fetch("/api/sites/my", { credentials: "include" }).then(r => r.json()),
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

  const send = async (text: string) => {
    if (!text.trim() || chatLoading || isLimitReached) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text };
    const trimmedHistory = messages.slice(-(CONTEXT_TURNS * 2)).map(m => ({ role: m.role, content: m.content }));
    const assistantMsgId = (Date.now() + 1).toString();

    setMessages(prev => [...prev, userMsg, { id: assistantMsgId, role: "assistant", content: "", streaming: true }]);
    setInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/sites/builder", {
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

      if (!res.ok || !res.body) {
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: "Connection error. Please try again.", streaming: false } : m));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const dataStr = part.slice(6).trim();
          if (!dataStr) continue;
          try {
            const event = JSON.parse(dataStr) as { content?: string; done?: boolean; used?: number; limit?: number; remaining?: number; error?: string };
            if (event.content) {
              fullContent += event.content;
              setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: fullContent } : m));
            }
            if (event.done) {
              setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, streaming: false } : m));
              if (event.used !== undefined) {
                setUsage({ used: event.used, limit: event.limit!, remaining: event.remaining!, tier: usage?.tier ?? null });
              }
            }
            if (event.error) {
              setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: event.error!, streaming: false } : m));
            }
          } catch { /* skip malformed events */ }
        }
      }

      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, streaming: false } : m));
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
      const res = await fetch("/api/sites/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ history, orgName: org?.name, orgType: org?.type }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json() as { site: Site; orgSlug: string };
      setSite(data.site);
      setOrgSlug(data.orgSlug);
      setMode("preview");
      setActiveTab("preview");
    } catch {
      setMode("interview");
      alert("Site generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const togglePublish = async () => {
    if (!site) return;
    setPublishing(true);
    try {
      const publish = site.status !== "published";
      const res = await fetch("/api/sites/my/publish", {
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
    try {
      const res = await fetch("/api/sites/change-request/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ changeRequest: changeInput }),
      });
      if (res.status === 403) {
        setChangeError("Change requests require a paid plan (Tier 1 or higher).");
        return;
      }
      if (res.status === 429) {
        setChangeError("Monthly AI limit reached. Upgrade to continue.");
        return;
      }
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setChangeError(d.error ?? "Proposal failed. Please try again.");
        return;
      }
      const data = await res.json() as { proposalReady: boolean; used: number; limit: number; remaining: number };
      setUsage(prev => prev ? { ...prev, used: data.used, remaining: data.remaining } : null);

      // Fetch the proposal HTML from the server (server-stored, never client-supplied)
      const previewRes = await fetch("/api/sites/my/proposal-preview", { credentials: "include" });
      if (!previewRes.ok) {
        setChangeError("Failed to load preview. Please try again.");
        return;
      }
      const previewData = await previewRes.json() as { proposedHtml: string };
      setProposedHtml(previewData.proposedHtml);
      loadHtmlIntoIframe(previewData.proposedHtml);
      setActiveTab("preview");
    } catch {
      setChangeError("Connection error. Please try again.");
    } finally {
      setChangePending(false);
    }
  };

  const applyChange = async () => {
    // No HTML sent from client — server applies its stored proposal
    try {
      const res = await fetch("/api/sites/change-request/apply", {
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
    fetch("/api/sites/my/proposal", { method: "DELETE", credentials: "include" }).catch(() => {});
    if (site?.generatedHtml) loadHtmlIntoIframe(site.generatedHtml);
  };

  const saveSchedule = async () => {
    setScheduleSaving(true);
    setScheduleMessage(null);
    try {
      const res = await fetch("/api/sites/schedule", {
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
      const res = await fetch("/api/sites/schedule/run", { method: "POST", credentials: "include" });
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
    await fetch("/api/sites/schedule", { method: "DELETE", credentials: "include" });
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
            <Button size="sm" onClick={togglePublish} disabled={publishing} className={`h-7 text-xs ${site.status === "published" ? "bg-slate-600 hover:bg-slate-500" : "bg-emerald-600 hover:bg-emerald-500"}`}>
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
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs border-b-2 transition-colors ${activeTab === tab.id ? "border-primary text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === "schedule" && schedule?.isActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />}
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
                      <p className="text-sm text-muted-foreground max-w-xs">Change requests are available on Tier 1 and higher plans.</p>
                    </div>
                    <Link href="/billing"><Button>Upgrade Plan</Button></Link>
                  </div>
                ) : (
                  <>
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
              <div className="flex flex-col items-center justify-center h-full text-center py-10 space-y-5">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Globe className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">Build your public website</h2>
                  <p className="text-sm text-muted-foreground max-w-sm">The AI will walk you through 8 short questions about your organization, then build a complete, branded website ready to publish.</p>
                </div>
                {isLimitReached ? (
                  <div className="flex flex-col items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/5 max-w-sm">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <p className="text-sm text-red-300">You've used all {usage?.limit} AI messages this month.</p>
                    <Link href="/billing"><Button size="sm">Upgrade Plan</Button></Link>
                  </div>
                ) : (
                  <Button onClick={() => send("Let's build my website.")} disabled={chatLoading} className="bg-primary hover:bg-primary/90 px-6">
                    <Sparkles className="w-4 h-4 mr-2" /> Start the Interview
                  </Button>
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

          {/* Input bar */}
          <div className="px-6 py-4 border-t border-white/8 bg-[hsl(224,40%,10%)] flex-shrink-0 space-y-3">
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
              <div className="flex gap-3 items-end">
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
    </div>
  );
}
