import React, { useState, useRef, useEffect } from "react";
import {
  Send, Globe, Sparkles, Bot, User, Loader2, AlertCircle,
  Eye, CheckCircle2, ExternalLink, RefreshCw, EyeOff,
} from "lucide-react";
import { useGetOrganization } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

const CONTEXT_TURNS = 8;

type Message = { id: string; role: "user" | "assistant"; content: string; timestamp: Date };
type Usage = { used: number; limit: number; remaining: number; tier: string | null };
type Site = {
  id: string;
  status: string;
  generatedHtml: string | null;
  orgSlug: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

const STARTERS = [
  "Create a homepage for our civic association with a welcome section and upcoming events",
  "Build a simple site with our mission, contact info, and a sponsors section",
  "Design a fundraiser landing page with a hero banner, event schedule, and sponsor grid",
  "Set up a public site for our nonprofit with a donation CTA and volunteer sign-up",
];

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
  const [view, setView] = useState<"chat" | "preview">("chat");
  const [siteLoading, setSiteLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    Promise.all([
      fetch("/api/sites/builder/usage", { credentials: "include" }).then(r => r.json()),
      fetch("/api/sites/my", { credentials: "include" }).then(r => r.json()),
    ]).then(([usageData, siteData]: [Usage, { site: Site | null; orgSlug: string | null }]) => {
      setUsage(usageData);
      setSite(siteData.site);
      setOrgSlug(siteData.orgSlug);
      if (siteData.site?.generatedHtml) setView("preview");
    }).catch(() => null).finally(() => setSiteLoading(false));
  }, []);

  const isLimitReached = usage !== null && usage.remaining <= 0;
  const canGenerate = messages.length >= 2 && !generating;
  const publicUrl = orgSlug ? `/sites/${orgSlug}` : null;

  const send = async (text: string) => {
    if (!text.trim() || chatLoading || isLimitReached) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text, timestamp: new Date() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setChatLoading(true);

    const trimmedHistory = messages.slice(-(CONTEXT_TURNS * 2)).map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/sites/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text, history: trimmedHistory, orgName: org?.name, orgType: org?.type }),
      });

      if (res.status === 429) {
        const data = await res.json() as { error: string; used: number; limit: number };
        setUsage({ used: data.used, limit: data.limit, remaining: 0, tier: null });
        setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: "You've reached your monthly AI message limit. Upgrade your plan to continue.", timestamp: new Date() }]);
        return;
      }

      const data = await res.json() as { reply?: string; used?: number; limit?: number; remaining?: number };
      if (data.used !== undefined) setUsage({ used: data.used!, limit: data.limit!, remaining: data.remaining!, tier: usage?.tier ?? null });
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: data.reply ?? "I couldn't process that. Please try again.", timestamp: new Date() }]);
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: "Connection error. Please try again.", timestamp: new Date() }]);
    } finally {
      setChatLoading(false);
    }
  };

  const generateSite = async () => {
    setGenerating(true);
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
      setView("preview");
    } catch {
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

  const usagePercent = usage ? Math.round((usage.used / usage.limit) * 100) : 0;
  const usageColor = usagePercent >= 90 ? "text-red-400" : usagePercent >= 70 ? "text-amber-400" : "text-emerald-400";

  if (siteLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between bg-[hsl(224,40%,10%)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">AI Site Builder</h1>
            <p className="text-xs text-muted-foreground">
              {view === "preview" ? "Your generated site" : "Chat to design your site, then generate"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab toggles */}
          {site?.generatedHtml && (
            <div className="flex rounded-lg border border-white/10 overflow-hidden mr-2">
              <button
                onClick={() => setView("chat")}
                className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${view === "chat" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
              >
                <Bot className="w-3.5 h-3.5" /> Chat
              </button>
              <button
                onClick={() => setView("preview")}
                className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${view === "preview" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
              >
                <Eye className="w-3.5 h-3.5" /> Preview
              </button>
            </div>
          )}

          {/* Usage meter */}
          {usage && (
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className={`text-xs font-medium tabular-nums ${usageColor}`}>{usage.remaining}/{usage.limit} left</p>
                <p className="text-[10px] text-muted-foreground">monthly</p>
              </div>
              <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${usagePercent >= 90 ? "bg-red-400" : usagePercent >= 70 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(usagePercent, 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Site status bar */}
      {site && (
        <div className="px-6 py-2.5 border-b border-white/8 bg-[hsl(224,40%,9%)] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${site.status === "published" ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span className="text-xs text-slate-300">
              {site.status === "published" ? "Live" : "Draft"} · Last updated {new Date(site.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            {site.status === "published" && publicUrl && (
              <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> View live
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setView("chat")}
              className="h-7 text-xs border-white/10 text-slate-300 hover:text-white"
            >
              <RefreshCw className="w-3 h-3 mr-1.5" /> Regenerate
            </Button>
            <Button
              size="sm"
              onClick={togglePublish}
              disabled={publishing}
              className={`h-7 text-xs ${site.status === "published" ? "bg-slate-600 hover:bg-slate-500" : "bg-emerald-600 hover:bg-emerald-500"}`}
            >
              {publishing ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : site.status === "published" ? <EyeOff className="w-3 h-3 mr-1.5" /> : <CheckCircle2 className="w-3 h-3 mr-1.5" />}
              {site.status === "published" ? "Unpublish" : "Publish"}
            </Button>
          </div>
        </div>
      )}

      {/* Main content area */}
      {view === "preview" && site?.generatedHtml ? (
        <div className="flex-1 overflow-hidden">
          <iframe
            srcDoc={site.generatedHtml}
            className="w-full h-full border-0"
            title="Site Preview"
            sandbox="allow-same-origin"
          />
        </div>
      ) : (
        <>
          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12 space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Globe className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">Build your public website</h2>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Describe your organization and what you want your site to say. After a couple of exchanges, click "Generate My Site" to create a real, live page.
                  </p>
                </div>
                {isLimitReached ? (
                  <div className="flex flex-col items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/5 max-w-sm">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <p className="text-sm text-red-300">You've used all {usage?.limit} AI messages this month.</p>
                    <Link href="/billing"><Button size="sm">Upgrade Plan</Button></Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                    {STARTERS.map((starter, i) => (
                      <button key={i} onClick={() => send(starter)} className="text-left p-3 rounded-lg border border-white/10 bg-card/40 hover:bg-white/5 hover:border-white/20 transition-all text-xs text-slate-300 leading-relaxed">
                        {starter}
                      </button>
                    ))}
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
                    <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-white/8 text-slate-200 rounded-tl-sm border border-white/8"}`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User className="w-4 h-4 text-slate-300" />
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white/8 border border-white/8">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Input + Generate button */}
          <div className="px-6 py-4 border-t border-white/8 bg-[hsl(224,40%,10%)] flex-shrink-0 space-y-3">
            {canGenerate && (
              <Button
                onClick={generateSite}
                disabled={generating}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {generating ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Building your site…</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Generate My Site</>
                )}
              </Button>
            )}

            {isLimitReached ? (
              <div className="flex items-center justify-between p-3 rounded-xl border border-red-500/20 bg-red-500/5">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-300">Monthly limit reached ({usage?.limit} messages)</p>
                </div>
                <Link href="/billing"><Button size="sm" variant="outline" className="border-red-500/30 text-red-300 hover:bg-red-500/10 h-8">Upgrade</Button></Link>
              </div>
            ) : (
              <>
                <div className="flex gap-3 items-end">
                  <Textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                    placeholder={messages.length === 0 ? "Describe your organization and what you want your site to include…" : "Continue the conversation or ask for changes…"}
                    rows={2}
                    className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none"
                    disabled={generating}
                  />
                  <Button onClick={() => send(input)} disabled={!input.trim() || chatLoading || generating} size="icon" className="h-10 w-10 flex-shrink-0">
                    {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                {messages.length > 0 && !canGenerate && (
                  <p className="text-xs text-muted-foreground">Keep chatting — after a couple exchanges the "Generate My Site" button will appear.</p>
                )}
                {messages.length === 0 && (
                  <p className="text-xs text-muted-foreground">Press Enter to send · Shift+Enter for new line</p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
