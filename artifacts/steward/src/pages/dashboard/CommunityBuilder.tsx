import React, { useState, useRef, useEffect } from "react";
import {
  Send, Bot, User, Loader2, AlertCircle, CheckCircle2,
  Globe, Rocket, ExternalLink, ChevronDown, ChevronUp,
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

type Message = { id: string; role: "user" | "assistant"; content: string };

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

const ORG_TYPE_OPTIONS = [
  "Main Street / Downtown Association",
  "Chamber of Commerce",
  "Rotary Club",
  "Lions Club",
  "VFW / American Legion",
  "PTA / PTO",
  "Community Foundation",
  "Neighborhood Association",
  "Arts Council",
  "Other",
];

function extractOptions(text: string): { cleanText: string; options: string[] } {
  const t = text;

  // ── 1. Explicit [OPTIONS: A | B | C] marker ─────────────────────────────────
  const markerMatch = t.match(/\[OPTIONS:\s*([^\]]+)\]/);
  if (markerMatch) {
    const options = markerMatch[1].split("|").map(s => s.trim()).filter(Boolean);
    return { cleanText: t.replace(markerMatch[0], "").trim(), options };
  }

  // ── 2. Org type — detect by ≥3 known org-type names ────────────────────────
  const orgHits = ORG_TYPE_OPTIONS.filter(o => t.includes(o));
  if (orgHits.length >= 3) {
    const cleaned = t
      .split("\n")
      .filter(line => !ORG_TYPE_OPTIONS.some(o => line.includes(o)))
      .join("\n")
      .replace(/Options?:?\s*$/im, "")
      .replace(/\|\s*$/, "")
      .trim();
    return { cleanText: cleaned, options: ORG_TYPE_OPTIONS };
  }

  // ── 3. Yes / No questions ────────────────────────────────────────────────────
  if (/\(yes\/no\)/i.test(t) || /\byes or no\b/i.test(t)) {
    return {
      cleanText: t.replace(/\s*\(yes\/no\)/gi, "").trim(),
      options: ["Yes", "No"],
    };
  }

  // ── 4. Mailing address ───────────────────────────────────────────────────────
  if (/mailing address/i.test(t)) {
    return { cleanText: t, options: ["Same as my physical address"] };
  }

  // ── 5. Logo badge / initials ─────────────────────────────────────────────────
  if (/logo badge/i.test(t) || /logo.*initial/i.test(t) || /abbreviation.*logo/i.test(t)) {
    return { cleanText: t, options: ["Same as my short name"] };
  }

  // ── 6. Separate events / inquiry email ──────────────────────────────────────
  if (/event.*email/i.test(t) || /inquiry.*email/i.test(t) || /separate email/i.test(t)) {
    return { cleanText: t, options: ["Same as my main email"] };
  }

  // ── 7. Facebook URL ──────────────────────────────────────────────────────────
  if (/facebook/i.test(t) && /(url|page|optional|link)/i.test(t)) {
    return { cleanText: t, options: ["Skip — no Facebook page"] };
  }

  // ── 8. Instagram URL ─────────────────────────────────────────────────────────
  if (/instagram/i.test(t) && /(url|optional|link)/i.test(t)) {
    return { cleanText: t, options: ["Skip — no Instagram"] };
  }

  // ── 9. Community partners ────────────────────────────────────────────────────
  if (/community partner/i.test(t)) {
    return { cleanText: t, options: ["No partners to list"] };
  }

  // ── 10. Meeting schedule ─────────────────────────────────────────────────────
  if (/meeting schedule/i.test(t) || /regular meeting/i.test(t)) {
    return { cleanText: t, options: ["No regular meetings"] };
  }

  // ── 11. Event categories ─────────────────────────────────────────────────────
  if (/event categor/i.test(t) || /categor.*event/i.test(t)) {
    return {
      cleanText: t,
      options: ["Festival", "Fundraiser", "Community", "Social", "Meeting", "Holiday", "Workshop", "Use defaults"],
    };
  }

  return { cleanText: t, options: [] };
}

function PayloadPreview({ payload }: { payload: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);

  const rows: { label: string; value: unknown }[] = [
    { label: "Org Name", value: payload.orgName },
    { label: "Short Name", value: payload.shortName },
    { label: "Type", value: payload.orgType },
    { label: "Tagline", value: payload.tagline },
    { label: "Location", value: payload.location },
    { label: "Primary Color", value: payload.primaryColor },
    { label: "Accent Color", value: payload.accentColor },
    { label: "Email", value: payload.contactEmail },
    { label: "Phone", value: payload.contactPhone },
    { label: "Facebook", value: payload.socialFacebook },
    {
      label: "Meeting",
      value: payload.meetingDay && payload.meetingTime
        ? `${payload.meetingDay} · ${payload.meetingTime}`
        : null,
    },
    {
      label: "Partners",
      value: Array.isArray(payload.partners) && payload.partners.length > 0
        ? `${(payload.partners as unknown[]).length} listed`
        : null,
    },
  ];

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
        <div className="px-4 pb-4 space-y-0 max-h-56 overflow-y-auto">
          {rows.map(({ label, value }) =>
            value ? (
              <div key={label} className="flex gap-2 text-sm py-1 border-b border-white/5">
                <span className="text-[#7a9cbf] min-w-[120px] flex-shrink-0">{label}</span>
                <span className="text-[#c8d8e8] break-all">{String(value)}</span>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

function ChatMessage({
  message,
  onOptionSelect,
  optionsDisabled,
}: {
  message: Message;
  onOptionSelect?: (option: string) => void;
  optionsDisabled?: boolean;
}) {
  const isUser = message.role === "user";

  const rawContent = message.content.includes("[PAYLOAD_READY]")
    ? message.content.slice(0, message.content.indexOf("[PAYLOAD_READY]")).trim() ||
      "I have everything I need! Click **Launch Site** below to go live."
    : message.content;

  const { cleanText, options } = extractOptions(rawContent);

  const renderText = (text: string) =>
    text.split("\n").map((line, i) => {
      const formatted = line
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, '<code class="bg-white/10 px-1 rounded text-xs">$1</code>');
      return (
        <p
          key={i}
          className={i > 0 ? "mt-1" : ""}
          dangerouslySetInnerHTML={{ __html: formatted }}
        />
      );
    });

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
          isUser ? "bg-[#1e3a5f]" : "bg-[#d4a017]/20"
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-[#7a9cbf]" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-[#d4a017]" />
        )}
      </div>
      <div className={`max-w-[85%] flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-[#1e3a5f] text-[#c8d8e8] rounded-tr-sm"
              : "bg-[#0f1a2e] border border-[#1e3a5f] text-[#c8d8e8] rounded-tl-sm"
          }`}
        >
          {renderText(cleanText)}
        </div>
        {!isUser && options.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-1">
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => onOptionSelect?.(opt)}
                disabled={optionsDisabled}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#d4a017]/40 text-[#d4a017] bg-[#d4a017]/8 hover:bg-[#d4a017]/20 hover:border-[#d4a017]/70 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommunityBuilder() {
  const { data: orgData } = useGetOrganization();
  const org = orgData?.organization;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{
    ok: boolean;
    siteUrl?: string;
    error?: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const readyPayload = messages
    .filter(m => m.role === "assistant")
    .reduce<Record<string, unknown> | null>(
      (found, m) => found ?? extractPayload(m.content),
      null,
    );

  const isInterviewComplete = readyPayload !== null;

  async function callInterview(
    userText: string,
    currentMessages: Message[],
  ): Promise<string | null> {
    const history = currentMessages
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }));

    const res = await csrfFetch("/api/community-site/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText, history }),
    });

    if (!res.ok) {
      const d = await res.json() as { error?: string };
      throw new Error(d.error ?? "Request failed");
    }

    const d = await res.json() as { reply: string };
    return d.reply ?? null;
  }

  async function startInterview() {
    if (loading) return;
    setStarted(true);
    setLoading(true);
    setError(null);

    try {
      const reply = await callInterview("Let's get started!", []);
      if (reply) {
        setMessages([{ id: Date.now().toString(), role: "assistant", content: reply }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — please try again");
      setStarted(false);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const reply = await callInterview(text, newMessages);
      if (reply) {
        setMessages(prev => [
          ...prev,
          { id: (Date.now() + 1).toString(), role: "assistant", content: reply },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  async function provision() {
    if (!readyPayload) return;
    setProvisioning(true);
    setError(null);

    try {
      const res = await csrfFetch("/api/community-site/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: readyPayload }),
      });

      const d = await res.json() as { ok?: boolean; siteUrl?: string; error?: string };

      if (!res.ok || !d.ok) {
        setProvisionResult({ ok: false, error: d.error ?? "Launch failed" });
        return;
      }

      setProvisionResult({ ok: true, siteUrl: d.siteUrl });
    } catch {
      setProvisionResult({ ok: false, error: "Network error during launch" });
    } finally {
      setProvisioning(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const lastMsgIndex = messages.length - 1;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#060f1e] text-[#c8d8e8]">

      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#1e3a5f] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#d4a017]" />
            Website Setup
          </h1>
          <p className="text-sm text-[#7a9cbf] mt-0.5">
            AI-guided interview to configure and launch your site
          </p>
        </div>
        {messages.length > 0 && !provisionResult?.ok && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setMessages([]); setStarted(false); setProvisionResult(null); setError(null); }}
            className="text-[#7a9cbf] hover:text-white text-xs"
          >
            Start over
          </Button>
        )}
      </div>

      {/* Success banner */}
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

      {/* Launch error */}
      {provisionResult && !provisionResult.ok && (
        <div className="flex-shrink-0 mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {provisionResult.error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {!started ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-[#d4a017]/10 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-[#d4a017]" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">
              Let's set up {org?.name ?? "your website"}
            </h2>
            <p className="text-sm text-[#7a9cbf] max-w-sm">
              I'll ask you a few questions about your organization — name, location,
              contact info, and how you'd like your site to look. Takes about 5 minutes.
            </p>
            <Button
              className="mt-6 bg-[#d4a017] hover:bg-[#b88a14] text-black font-semibold px-6"
              onClick={startInterview}
              disabled={loading}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Starting…</>
              ) : (
                "Let's get started"
              )}
            </Button>
          </div>
        ) : (
          <>
            {messages.map((m, idx) => (
              <ChatMessage
                key={m.id}
                message={m}
                onOptionSelect={sendMessage}
                optionsDisabled={loading || idx !== lastMsgIndex}
              />
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-[#d4a017]/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-[#d4a017]" />
                </div>
                <div className="bg-[#0f1a2e] border border-[#1e3a5f] rounded-2xl rounded-tl-sm px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d4a017] animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d4a017] animate-bounce [animation-delay:0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d4a017] animate-bounce [animation-delay:0.3s]" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Payload preview + Launch button */}
      {isInterviewComplete && !provisionResult?.ok && (
        <div className="flex-shrink-0 px-6 pb-4 space-y-3">
          <PayloadPreview payload={readyPayload!} />
          <Button
            className="w-full bg-[#d4a017] hover:bg-[#b88a14] text-black font-semibold h-11 text-base"
            onClick={provision}
            disabled={provisioning}
          >
            {provisioning ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Launching…</>
            ) : (
              <><Rocket className="w-4 h-4 mr-2" />Launch Site</>
            )}
          </Button>
        </div>
      )}

      {/* General error */}
      {error && (
        <div className="flex-shrink-0 mx-6 mb-2 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Input */}
      {started && !isInterviewComplete && !provisionResult?.ok && (
        <div className="flex-shrink-0 border-t border-[#1e3a5f] px-4 py-3">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your answer…"
              rows={1}
              className="flex-1 min-h-[40px] max-h-32 resize-none bg-[#0f1a2e] border-[#1e3a5f] text-[#c8d8e8] placeholder:text-[#4a6a8a] rounded-xl text-sm focus:ring-[#d4a017]/50"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="bg-[#d4a017] hover:bg-[#b88a14] text-black h-10 w-10 p-0 flex-shrink-0 rounded-xl"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-[#4a6a8a] mt-1.5 px-1">Enter to send · Shift+Enter for new line</p>
        </div>
      )}
    </div>
  );
}
