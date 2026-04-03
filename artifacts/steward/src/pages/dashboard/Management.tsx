import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles, Send, Loader2, Bot, User, RefreshCw,
  Calendar, Trophy, FileText, BarChart2, Users, Mail,
  MessageSquare, Building2, Image, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

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
    title: "Events",
    icon: Calendar,
    color: "text-blue-400",
    suggestions: [
      { icon: Calendar, label: "What's coming up?", prompt: "What events do I have coming up?", color: "text-blue-400" },
      { icon: Calendar, label: "Add new event", prompt: "I want to add a new event. Can you help me?", color: "text-blue-400" },
      { icon: Calendar, label: "Ticket sales", prompt: "Give me a summary of all ticket sales.", color: "text-blue-400" },
    ],
  },
  {
    title: "Sponsors",
    icon: Trophy,
    color: "text-amber-400",
    suggestions: [
      { icon: Trophy, label: "Pending applications", prompt: "Any new sponsor applications waiting for approval?", color: "text-amber-400" },
    ],
  },
  {
    title: "Content",
    icon: FileText,
    color: "text-green-400",
    suggestions: [
      { icon: FileText, label: "View site content", prompt: "What text can I change on my site?", color: "text-green-400" },
      { icon: FileText, label: "Update tagline", prompt: "I want to update my homepage tagline.", color: "text-green-400" },
    ],
  },
  {
    title: "Analytics",
    icon: BarChart2,
    color: "text-purple-400",
    suggestions: [
      { icon: BarChart2, label: "Site overview", prompt: "Give me an overview of how the site is doing.", color: "text-purple-400" },
    ],
  },
  {
    title: "Newsletter",
    icon: Mail,
    color: "text-rose-400",
    suggestions: [
      { icon: Mail, label: "Subscriber count", prompt: "How many newsletter subscribers do I have?", color: "text-rose-400" },
      { icon: Mail, label: "Send newsletter", prompt: "I want to send a newsletter about upcoming events.", color: "text-rose-400" },
    ],
  },
  {
    title: "Messages",
    icon: MessageSquare,
    color: "text-sky-400",
    suggestions: [
      { icon: MessageSquare, label: "New messages", prompt: "Do I have any new contact form messages?", color: "text-sky-400" },
    ],
  },
  {
    title: "Directory",
    icon: Building2,
    color: "text-orange-400",
    suggestions: [
      { icon: Building2, label: "Add a business", prompt: "I want to add a business to the directory.", color: "text-orange-400" },
      { icon: Building2, label: "View directory", prompt: "Show me the businesses in my directory.", color: "text-orange-400" },
    ],
  },
  {
    title: "Gallery",
    icon: Image,
    color: "text-teal-400",
    suggestions: [
      { icon: Image, label: "Create album", prompt: "Create a new photo album.", color: "text-teal-400" },
      { icon: Image, label: "View albums", prompt: "Show me my photo albums.", color: "text-teal-400" },
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function Management() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
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

      // Refresh common queries that might have changed
      void qc.invalidateQueries({ queryKey: ["events"] });
      void qc.invalidateQueries({ queryKey: ["event-metrics"] });
      void qc.invalidateQueries({ queryKey: ["sponsors"] });

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
      setMessages(newMessages); // Remove user msg on failure
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

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
            <p className="text-xs text-muted-foreground">Manage your entire organization with plain English</p>
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
                Ask me anything — I can create events, check ticket sales, approve sponsors, send newsletters, and more.
              </p>
            </div>

            {/* Suggestion grid */}
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
            placeholder='Try: "How many tickets sold for the chili cookoff?" or "Add a spring gala on April 20"'
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
          Autopilot can create, update, and delete records — always confirm before destructive actions.
        </p>
      </div>
    </div>
  );
}
