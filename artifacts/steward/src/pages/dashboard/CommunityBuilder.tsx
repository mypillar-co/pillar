import React, { useState, useRef, useEffect } from "react";
import {
  Send, Bot, User, Loader2, AlertCircle, CheckCircle2,
  Settings, Globe, Rocket, ExternalLink, ChevronDown, ChevronUp,
  Plug, PlugZap,
} from "lucide-react";
import { useGetOrganization } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
type TargetConfig = { url: string | null; hasKey: boolean };

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

function PayloadRow({ label, value }: { label: string; value: unknown }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2 text-sm py-1 border-b border-white/5">
      <span className="text-[#7a9cbf] min-w-[140px] flex-shrink-0">{label}</span>
      <span className="text-[#c8d8e8] break-all">
        {typeof value === "object" ? JSON.stringify(value) : String(value)}
      </span>
    </div>
  );
}

function PayloadPreview({ payload }: { payload: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-[#d4a017]/30 bg-[#0f1a2e] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#d4a017] hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Setup payload ready — {String(payload.orgName ?? "")}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-0.5 max-h-64 overflow-y-auto">
          <PayloadRow label="Org Name" value={payload.orgName} />
          <PayloadRow label="Short Name" value={payload.shortName} />
          <PayloadRow label="Org Type" value={payload.orgType} />
          <PayloadRow label="Tagline" value={payload.tagline} />
          <PayloadRow label="Location" value={payload.location} />
          <PayloadRow label="Primary Color" value={payload.primaryColor} />
          <PayloadRow label="Accent Color" value={payload.accentColor} />
          <PayloadRow label="Contact Email" value={payload.contactEmail} />
          <PayloadRow label="Contact Phone" value={payload.contactPhone} />
          <PayloadRow label="Facebook" value={payload.socialFacebook} />
          <PayloadRow label="Meeting" value={payload.meetingDay && payload.meetingTime ? `${payload.meetingDay} ${payload.meetingTime}` : null} />
          <PayloadRow label="Partners" value={Array.isArray(payload.partners) ? `${(payload.partners as unknown[]).length} partner(s)` : null} />
          <PayloadRow label="Stats" value={Array.isArray(payload.stats) ? `${(payload.stats as unknown[]).length} stat(s)` : null} />
        </div>
      )}
    </div>
  );
}

function ConnectionPanel({
  config,
  onSaved,
}: {
  config: TargetConfig;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(!config.url);
  const [url, setUrl] = useState(config.url ?? "");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!url.trim()) { setError("URL is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/community-site/target", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), key: key.trim() || undefined }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Save failed");
        return;
      }
      setEditing(false);
      onSaved();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-[#1e3a5f] bg-[#0a1628] text-sm">
        <div className="flex items-center gap-2 text-[#7a9cbf]">
          <PlugZap className="w-4 h-4 text-green-400" />
          <span>Connected to</span>
          <a
            href={config.url ?? ""}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#d4a017] hover:underline flex items-center gap-1"
          >
            {config.url}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-[#7a9cbf] hover:text-white transition-colors flex items-center gap-1"
        >
          <Settings className="w-3 h-3" />
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-[#1e3a5f] bg-[#0a1628] space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-[#c8d8e8]">
        <Plug className="w-4 h-4 text-[#d4a017]" />
        Connect your community site
      </div>
      <p className="text-xs text-[#7a9cbf]">
        Enter the URL of the deployed community platform and the PILLAR_SERVICE_KEY from its environment.
      </p>
      <div className="space-y-2">
        <Input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://myorg.mypillar.co"
          className="bg-[#1a2d44] border-[#1e3a5f] text-[#c8d8e8] placeholder:text-[#4a6a8a] h-9 text-sm"
        />
        <Input
          type="password"
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="PILLAR_SERVICE_KEY (leave blank to keep existing)"
          className="bg-[#1a2d44] border-[#1e3a5f] text-[#c8d8e8] placeholder:text-[#4a6a8a] h-9 text-sm"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={save}
          disabled={saving}
          className="bg-[#d4a017] hover:bg-[#b88a14] text-black font-medium h-8"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          Save Connection
        </Button>
        {config.url && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
            className="text-[#7a9cbf] hover:text-white h-8"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  const displayContent = message.content.includes("[PAYLOAD_READY]")
    ? message.content.slice(0, message.content.indexOf("[PAYLOAD_READY]")).trim() ||
      "I have everything I need! Review the payload below and click **Launch Site** to provision your community platform."
    : message.content;

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
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-[#1e3a5f] text-[#c8d8e8] rounded-tr-sm"
            : "bg-[#0f1a2e] border border-[#1e3a5f] text-[#c8d8e8] rounded-tl-sm"
        }`}
      >
        {displayContent.split("\n").map((line, i) => {
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
        })}
      </div>
    </div>
  );
}

export default function CommunityBuilder() {
  const { data: orgData } = useGetOrganization();
  const org = orgData?.organization;

  const [config, setConfig] = useState<TargetConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{ ok: boolean; siteUrl?: string; error?: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadConfig() {
    try {
      const res = await fetch("/api/community-site/target", { credentials: "include" });
      if (res.ok) {
        const d = await res.json() as TargetConfig;
        setConfig(d);
      } else {
        setConfig({ url: null, hasKey: false });
      }
    } catch {
      setConfig({ url: null, hasKey: false });
    }
  }

  const readyPayload = messages
    .filter(m => m.role === "assistant")
    .reduce<Record<string, unknown> | null>((found, m) => found ?? extractPayload(m.content), null);

  const isInterviewComplete = readyPayload !== null;

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const history = newMessages.slice(-20).map(m => ({ role: m.role, content: m.content }));

      const res = await csrfFetch("/api/community-site/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: history.slice(0, -1),
        }),
      });

      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Request failed");
        return;
      }

      const d = await res.json() as { reply: string };
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: d.reply,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setError("Network error — please try again");
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
        setProvisionResult({ ok: false, error: d.error ?? "Provision failed" });
        return;
      }

      setProvisionResult({ ok: true, siteUrl: d.siteUrl ?? config?.url ?? "" });
    } catch {
      setProvisionResult({ ok: false, error: "Network error during provisioning" });
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

  function startFresh() {
    setMessages([]);
    setProvisionResult(null);
    setError(null);
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#060f1e] text-[#c8d8e8]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#1e3a5f] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#d4a017]" />
              Community Site Setup
            </h1>
            <p className="text-sm text-[#7a9cbf] mt-0.5">
              AI-guided interview to configure and launch your community platform
            </p>
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={startFresh}
              className="text-[#7a9cbf] hover:text-white text-xs"
            >
              Start over
            </Button>
          )}
        </div>

        {/* Connection panel */}
        <div className="mt-4">
          {config === null ? (
            <div className="flex items-center gap-2 text-sm text-[#7a9cbf]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading connection…
            </div>
          ) : (
            <ConnectionPanel config={config} onSaved={loadConfig} />
          )}
        </div>
      </div>

      {/* Provision success banner */}
      {provisionResult?.ok && (
        <div className="flex-shrink-0 mx-6 mt-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-300">Site provisioned successfully!</p>
            <p className="text-xs text-green-400/70 mt-1">
              Your community platform is now live at{" "}
              <a
                href={provisionResult.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {provisionResult.siteUrl}
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Provision error */}
      {provisionResult && !provisionResult.ok && (
        <div className="flex-shrink-0 mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {provisionResult.error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-[#d4a017]/10 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-[#d4a017]" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">
              Let's set up {org?.name ?? "your community site"}
            </h2>
            <p className="text-sm text-[#7a9cbf] max-w-sm">
              I'll walk you through 24 quick questions to configure your community platform —
              colors, contact info, features, and more. Ready when you are.
            </p>
            <Button
              className="mt-6 bg-[#d4a017] hover:bg-[#b88a14] text-black font-semibold"
              onClick={() => {
                setInput("Let's get started!");
                setTimeout(() => textareaRef.current?.focus(), 100);
              }}
            >
              Start the interview
            </Button>
          </div>
        ) : (
          messages.map(m => <ChatMessage key={m.id} message={m} />)
        )}

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

        <div ref={messagesEndRef} />
      </div>

      {/* Payload preview + launch button */}
      {isInterviewComplete && !provisionResult?.ok && (
        <div className="flex-shrink-0 px-6 pb-4 space-y-3">
          <PayloadPreview payload={readyPayload!} />
          {config?.url && config.hasKey ? (
            <Button
              className="w-full bg-[#d4a017] hover:bg-[#b88a14] text-black font-semibold h-11 text-base"
              onClick={provision}
              disabled={provisioning}
            >
              {provisioning ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Provisioning…</>
              ) : (
                <><Rocket className="w-4 h-4 mr-2" /> Launch Site</>
              )}
            </Button>
          ) : (
            <div className="p-3 rounded-lg border border-[#d4a017]/30 bg-[#0f1a2e] text-sm text-[#7a9cbf] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#d4a017] flex-shrink-0" />
              Connect your community site above (URL + service key) to launch.
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex-shrink-0 mx-6 mb-2 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Input */}
      {!isInterviewComplete && !provisionResult?.ok && (
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
              onClick={sendMessage}
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
          <p className="text-xs text-[#4a6a8a] mt-1.5 px-1">Press Enter to send · Shift+Enter for new line</p>
        </div>
      )}
    </div>
  );
}
