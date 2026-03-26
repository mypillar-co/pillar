import React, { useState, useRef, useEffect } from "react";
import { Send, Globe, Sparkles, Bot, User, Loader2, AlertCircle } from "lucide-react";
import { useGetOrganization } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

const CONTEXT_TURNS = 8;

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type Usage = {
  used: number;
  limit: number;
  remaining: number;
  tier: string | null;
};

const STARTERS = [
  "Create a homepage for our Masonic lodge with a welcome section and upcoming events",
  "Build a simple site with our mission, contact info, and a sponsors section",
  "Design a festival landing page with a hero banner, event schedule, and sponsor grid",
  "Set up a public site for our nonprofit with a donation CTA and volunteer sign-up",
];

export default function SiteBuilder() {
  const { data: orgData } = useGetOrganization();
  const org = orgData?.organization;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    fetch("/api/sites/builder/usage", { credentials: "include" })
      .then(r => r.json())
      .then((data: Usage) => setUsage(data))
      .catch(() => null);
  }, []);

  const isLimitReached = usage !== null && usage.remaining <= 0;

  const send = async (text: string) => {
    if (!text.trim() || loading || isLimitReached) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    const trimmedHistory = messages
      .slice(-(CONTEXT_TURNS * 2))
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/sites/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: text,
          history: trimmedHistory,
          orgName: org?.name,
          orgType: org?.type,
        }),
      });

      if (res.status === 429) {
        const data = await res.json() as { error: string; used: number; limit: number };
        setUsage({ used: data.used, limit: data.limit, remaining: 0, tier: null });
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "You've reached your monthly AI message limit. Upgrade your plan to continue building your site.",
          timestamp: new Date(),
        }]);
        setLoading(false);
        return;
      }

      const data = await res.json() as {
        reply?: string;
        error?: string;
        used?: number;
        limit?: number;
        remaining?: number;
      };

      if (data.used !== undefined && data.limit !== undefined && data.remaining !== undefined) {
        setUsage({ used: data.used, limit: data.limit, remaining: data.remaining, tier: usage?.tier ?? null });
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.reply ?? data.error ?? "I couldn't process that. Please try again.",
        timestamp: new Date(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "There was a connection error. Please try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const usagePercent = usage ? Math.round((usage.used / usage.limit) * 100) : 0;
  const usageColor =
    usagePercent >= 90 ? "text-red-400" :
    usagePercent >= 70 ? "text-amber-400" :
    "text-emerald-400";

  return (
    <div className="flex flex-col h-full max-h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between bg-[hsl(224,40%,10%)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">AI Site Builder</h1>
            <p className="text-xs text-muted-foreground">Describe your site and I'll build it for you</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {usage && (
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className={`text-xs font-medium tabular-nums ${usageColor}`}>
                  {usage.remaining} / {usage.limit} messages left
                </p>
                <p className="text-[10px] text-muted-foreground">resets monthly</p>
              </div>
              <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usagePercent >= 90 ? "bg-red-400" :
                    usagePercent >= 70 ? "bg-amber-400" :
                    "bg-emerald-400"
                  }`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
            </div>
          )}
          <Badge variant="outline" className="border-primary/30 text-primary text-xs">Beta</Badge>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Globe className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">Build your public website</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Describe what you want and I'll create a beautiful, customizable public website for your organization.
              </p>
            </div>
            {isLimitReached ? (
              <div className="flex flex-col items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/5 max-w-sm">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <p className="text-sm text-red-300">You've used all {usage?.limit} AI messages this month.</p>
                <Link href="/billing">
                  <Button size="sm" className="mt-1">Upgrade Plan</Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                {STARTERS.map((starter, i) => (
                  <button
                    key={i}
                    onClick={() => send(starter)}
                    className="text-left p-3 rounded-lg border border-white/10 bg-card/40 hover:bg-white/5 hover:border-white/20 transition-all text-xs text-slate-300 leading-relaxed"
                  >
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
                <div
                  className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-white/8 text-slate-200 rounded-tl-sm border border-white/8"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-slate-300" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
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

      {/* Input */}
      <div className="px-6 py-4 border-t border-white/8 bg-[hsl(224,40%,10%)]">
        {isLimitReached ? (
          <div className="flex items-center justify-between p-3 rounded-xl border border-red-500/20 bg-red-500/5">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">Monthly limit reached ({usage?.limit} messages)</p>
            </div>
            <Link href="/billing">
              <Button size="sm" variant="outline" className="border-red-500/30 text-red-300 hover:bg-red-500/10 h-8">
                Upgrade
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="flex gap-3 items-end">
              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your site or ask for changes... (Enter to send)"
                rows={2}
                className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none"
              />
              <Button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                size="icon"
                className="h-10 w-10 flex-shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Press Enter to send, Shift+Enter for new line</p>
          </>
        )}
      </div>
    </div>
  );
}
