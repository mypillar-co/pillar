import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles, Send, Loader2, Bot, User, RefreshCw,
  Calendar, Trophy, BarChart2, Mail,
  ChevronRight, Lock,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useGetSubscription } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Suggestion {
  icon: React.ElementType;
  label: string;
  prompt: string;
  color: string;
}

// ── Suggestion prompts ────────────────────────────────────────────────────────

const SUGGESTION_GROUPS: { title: string; icon: React.ElementType; color: string; suggestions: Suggestion[] }[] = [
  {
    title: "Event operations",
    icon: Calendar,
    color: "text-blue-400",
    suggestions: [
      { icon: Calendar, label: "Upcoming events", prompt: "Show me upcoming events.", color: "text-blue-400" },
      { icon: Calendar, label: "Ticket sales", prompt: "Give me a summary of all ticket sales.", color: "text-blue-400" },
      { icon: Calendar, label: "Needs attention", prompt: "What needs attention this week?", color: "text-blue-400" },
    ],
  },
  {
    title: "Follow-up queues",
    icon: Trophy,
    color: "text-amber-400",
    suggestions: [
      { icon: Trophy, label: "Pending sponsors", prompt: "Show me pending sponsor applications.", color: "text-amber-400" },
      { icon: Trophy, label: "Unpaid vendors", prompt: "Show me unpaid vendors.", color: "text-amber-400" },
    ],
  },
  {
    title: "Draft communications",
    icon: Mail,
    color: "text-green-400",
    suggestions: [
      { icon: Mail, label: "Vendor reminder", prompt: "Draft a reminder for unpaid vendors.", color: "text-green-400" },
      { icon: Mail, label: "Sponsor thank-you", prompt: "Draft a thank-you note for sponsors.", color: "text-green-400" },
      { icon: Mail, label: "Event announcement", prompt: "Draft an event announcement.", color: "text-green-400" },
    ],
  },
  {
    title: "Reports",
    icon: BarChart2,
    color: "text-purple-400",
    suggestions: [
      { icon: BarChart2, label: "Board report", prompt: "Generate a board report summary.", color: "text-purple-400" },
      { icon: BarChart2, label: "Autopilot status", prompt: "Which autopilot items are active or available?", color: "text-purple-400" },
    ],
  },
  {
    title: "Members",
    icon: Bot,
    color: "text-rose-400",
    suggestions: [
      { icon: Bot, label: "Member stats", prompt: "How many members do we have?", color: "text-rose-400" },
      { icon: Bot, label: "Renewals", prompt: "Which member renewals are coming up?", color: "text-rose-400" },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

type BriefingItem = { label: string; detail: string; date?: string; href?: string };
type DashboardBriefing = {
  metrics: {
    upcomingEvents: number;
    pendingRegistrations: number;
    pendingSponsors: number;
    unpaidItems: number;
    newContacts: number;
    newMembers: number;
  };
  needsAttention: BriefingItem[];
  upcoming: BriefingItem[];
};
type BoardReport = {
  period: { month: string };
  sections: {
    executiveSummary: string[];
    needsAttention: BriefingItem[];
    events: BriefingItem[];
    revenue: BriefingItem[];
    members: BriefingItem[];
    communications: BriefingItem[];
  };
};
type EmailDraft = {
  subject: string;
  body: string;
  recipientsPreview: string;
  recipientCount: number;
  status: "draft";
};

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return data as T;
}

function bullets(items: BriefingItem[], empty: string): string {
  if (!items.length) return `  • ${empty}`;
  return items
    .slice(0, 6)
    .map((item) => `  • ${item.label}${item.date ? ` — ${item.date}` : ""}${item.detail ? `\n    ${item.detail}` : ""}`)
    .join("\n");
}

function formatEmailDraft(intentLabel: string, draft: EmailDraft): string {
  return [
    `${intentLabel} draft prepared. Nothing has been sent.`,
    "",
    `Recipients: ${draft.recipientsPreview} (${draft.recipientCount})`,
    `Subject: ${draft.subject}`,
    "",
    draft.body,
  ].join("\n");
}

function detectDraftIntent(lower: string): { intent: string; label: string } | null {
  if ((lower.includes("vendor") || lower.includes("unpaid")) && (lower.includes("draft") || lower.includes("remind") || lower.includes("reminder"))) {
    return { intent: "unpaid_vendor_reminder", label: "Vendor reminder" };
  }
  if (lower.includes("sponsor") && (lower.includes("thank") || lower.includes("draft"))) {
    return { intent: "sponsor_thank_you", label: "Sponsor thank-you" };
  }
  if (lower.includes("volunteer") && (lower.includes("draft") || lower.includes("remind") || lower.includes("reminder"))) {
    return { intent: "volunteer_reminder", label: "Volunteer reminder" };
  }
  if (lower.includes("renewal") && (lower.includes("member") || lower.includes("membership"))) {
    return { intent: "member_renewal", label: "Member renewal reminder" };
  }
  if (lower.includes("announcement") && lower.includes("event")) {
    return { intent: "event_announcement", label: "Event announcement" };
  }
  return null;
}

async function runDeterministicAutopilotIntent(message: string): Promise<string | null> {
  const lower = message.toLowerCase();
  const draftIntent = detectDraftIntent(lower);
  if (draftIntent) {
    const res = await csrfFetch("/api/operations/email-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: draftIntent.intent }),
    });
    const draft = await parseJsonResponse<EmailDraft>(res);
    return formatEmailDraft(draftIntent.label, draft);
  }

  if (lower.includes("board report") || lower.includes("board summary")) {
    const res = await csrfFetch("/api/reports/board-monthly");
    const report = await parseJsonResponse<BoardReport>(res);
    return [
      `Board report generated for ${report.period.month}.`,
      "",
      "Executive Summary:",
      ...report.sections.executiveSummary.map((line) => `  • ${line}`),
      "",
      "Needs Attention:",
      bullets(report.sections.needsAttention, "No urgent items for this period."),
      "",
      "Upcoming:",
      bullets(report.sections.events, "No upcoming events listed."),
    ].join("\n");
  }

  if (
    lower.includes("pending sponsor") ||
    lower.includes("unpaid vendor") ||
    lower.includes("upcoming event") ||
    lower.includes("needs attention") ||
    lower.includes("autopilot status")
  ) {
    const res = await csrfFetch("/api/dashboard/briefing");
    const briefing = await parseJsonResponse<DashboardBriefing>(res);

    if (lower.includes("pending sponsor")) {
      return `Pending sponsors: ${briefing.metrics.pendingSponsors}\n\n${bullets(
        briefing.needsAttention.filter((item) => item.label.toLowerCase().includes("sponsor")),
        "No sponsor applications need attention right now.",
      )}`;
    }

    if (lower.includes("unpaid vendor")) {
      return `Open revenue items: ${briefing.metrics.unpaidItems}\n\n${bullets(
        briefing.needsAttention.filter((item) => item.label.toLowerCase().includes("revenue") || item.detail.toLowerCase().includes("payment")),
        "No unpaid vendor or payment items are waiting right now.",
      )}`;
    }

    if (lower.includes("upcoming event")) {
      return `Upcoming events: ${briefing.metrics.upcomingEvents}\n\n${bullets(
        briefing.upcoming,
        "No upcoming events are currently scheduled.",
      )}`;
    }

    if (lower.includes("needs attention")) {
      return `Needs your attention:\n${bullets(briefing.needsAttention, "Nothing urgent is waiting right now.")}`;
    }

    return [
      "Pillar Autopilot status:",
      `  • Upcoming events tracked: ${briefing.metrics.upcomingEvents}`,
      `  • Pending registrations: ${briefing.metrics.pendingRegistrations}`,
      `  • Pending sponsors: ${briefing.metrics.pendingSponsors}`,
      `  • Open revenue items: ${briefing.metrics.unpaidItems}`,
      `  • New contacts this week: ${briefing.metrics.newContacts}`,
      `  • New members this week: ${briefing.metrics.newMembers}`,
      "",
      "Automation remains in safe mode: drafts and summaries are available; sending, publishing, deleting, approvals, invites, and payments require confirmation.",
    ].join("\n");
  }

  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

const AUTOPILOT_TIERS = new Set(["tier1a", "tier2", "tier3"]);

export default function Management() {
  const { data: subscription } = useGetSubscription();
  const tier = subscription?.tierId;
  const hasAccess = AUTOPILOT_TIERS.has(tier ?? "");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const deterministicReply = await runDeterministicAutopilotIntent(msg);
      if (deterministicReply) {
        setMessages([...newMessages, { role: "assistant", content: deterministicReply }]);
        void qc.invalidateQueries({ queryKey: ["dashboard-briefing"] });
        return;
      }

      const res = await csrfFetch("/api/management/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: messages,
        }),
      });

      const data = await res.json() as { reply?: string; error?: string };

      if (!res.ok) throw new Error(data.error ?? "Request failed");

      setMessages([...newMessages, { role: "assistant", content: data.reply ?? "" }]);

      void qc.invalidateQueries({ queryKey: ["events"] });
      void qc.invalidateQueries({ queryKey: ["event-metrics"] });
      void qc.invalidateQueries({ queryKey: ["sponsors"] });

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
      setMessages(newMessages);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [messages, loading, qc]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  function handleSuggestion(prompt: string) {
    void sendMessage(prompt);
  }

  function handleReset() {
    setMessages([]);
    setInput("");
  }

  const showSuggestions = messages.length === 0;

  // ── Tier gate ───────────────────────────────────────────────────────────────
  if (subscription !== undefined && !hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5">
          <Lock className="w-7 h-7 text-amber-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Autopilot requires the Autopilot plan</h2>
        <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
          Upgrade to the Autopilot plan ($59/mo) to manage your entire organization with plain English —
          events, sponsors, newsletters, messages, and more.
        </p>
        <Link href="/billing">
          <Button className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-6">
            Upgrade to Autopilot
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)]">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Autopilot</h1>
            <p className="text-xs text-muted-foreground">Automation status, operational drafts, and safe follow-up queues</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5"
          >
            <RefreshCw className="w-3 h-3" />
            New chat
          </button>
        )}
      </div>

      {/* Messages or suggestions */}
      <div className="flex-1 overflow-y-auto">
        {showSuggestions ? (
          <div className="px-6 py-6 space-y-6">
            {/* Welcome */}
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-1">What would you like to manage?</h2>
              <p className="text-sm text-muted-foreground">
                Ask for summaries and drafts. Sending, publishing, deleting, and approvals require explicit confirmation.
              </p>
            </div>

            {/* Operational suggestion grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {SUGGESTION_GROUPS.map((group) => (
                <div
                  key={group.title}
                  className="rounded-xl border border-white/8 bg-white/3 overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/6">
                    <group.icon className={`w-3.5 h-3.5 ${group.color}`} />
                    <span className="text-xs font-medium text-slate-300">{group.title}</span>
                  </div>
                  <div className="p-2 space-y-1">
                    {group.suggestions.map((s) => (
                      <button
                        key={s.prompt}
                        onClick={() => handleSuggestion(s.prompt)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm text-slate-300 hover:bg-white/6 hover:text-white transition-colors group"
                      >
                        <span>{s.label}</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-6 py-4 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-white rounded-br-sm"
                      : "bg-white/6 text-slate-200 rounded-bl-sm border border-white/10"
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 text-slate-300" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white/6 border border-white/10">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-6 pb-6 pt-3 border-t border-white/8">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus-within:border-primary/40 transition-colors"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Try: "show unpaid vendors" or "draft a sponsor thank-you"'
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-8 h-8 rounded-xl bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-all flex items-center justify-center"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Send className="w-3.5 h-3.5" />
            }
          </button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-2">
          Draft and summary actions are safe. Sending, publishing, deleting, approvals, invites, and payments require server-side confirmation.
        </p>
      </div>
    </div>
  );
}
