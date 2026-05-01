import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles, Send, Loader2, Bot, User, RefreshCw,
  Calendar, Trophy, FileText, BarChart2, Mail,
  MessageSquare, Building2, Image, ChevronRight, Lock,
  ImagePlus, Plus, X, CheckCircle2, FolderOpen, AlertCircle,
  Upload,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useGetSubscription } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { uploadImage, isImageFile } from "@/lib/uploadImage";

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

interface PhotoAlbum {
  id: string;
  title: string;
  description: string | null;
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

// ── Gallery Upload Panel ───────────────────────────────────────────────────────

function GalleryUploadPanel({ onDone }: { onDone?: () => void }) {
  const [albums, setAlbums] = useState<PhotoAlbum[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(true);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>("");
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    csrfFetch("/api/photo-albums")
      .then(r => r.json())
      .then((data: PhotoAlbum[]) => {
        setAlbums(data);
        if (data.length > 0) setSelectedAlbumId(data[0].id);
        else setCreatingAlbum(true);
      })
      .catch(() => setError("Could not load albums"))
      .finally(() => setAlbumsLoading(false));
  }, []);

  function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter(isImageFile);
    if (!files.length) return;
    setPendingFiles(prev => [...prev, ...files]);
    const newPreviews = files.map(f => URL.createObjectURL(f));
    setPreviews(prev => [...prev, ...newPreviews]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeFile(idx: number) {
    URL.revokeObjectURL(previews[idx]);
    setPendingFiles(p => p.filter((_, i) => i !== idx));
    setPreviews(p => p.filter((_, i) => i !== idx));
  }

  async function handleUpload() {
    setError(null);
    if (!pendingFiles.length) { setError("Select at least one photo."); return; }
    let albumId = selectedAlbumId;

    setUploading(true);
    try {
      // Create album if needed
      if (creatingAlbum) {
        if (!newAlbumTitle.trim()) { setError("Enter an album name."); setUploading(false); return; }
        const res = await csrfFetch("/api/photo-albums", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newAlbumTitle.trim() }),
        });
        if (!res.ok) throw new Error("Failed to create album");
        const album = await res.json() as PhotoAlbum;
        albumId = album.id;
      }

      // Upload photos one by one
      const uploaded: { url: string }[] = [];
      for (let i = 0; i < pendingFiles.length; i++) {
        const url = await uploadImage(pendingFiles[i]);
        uploaded.push({ url });
        setUploadCount(i + 1);
      }

      // Save to album
      const res = await csrfFetch(`/api/photo-albums/${albumId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: uploaded }),
      });
      if (!res.ok) throw new Error("Failed to save photos");

      setDone(true);
      previews.forEach(p => URL.revokeObjectURL(p));
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (done) {
    return (
      <div className="px-4 pb-4 pt-2 flex items-center gap-2 text-sm text-green-400">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        Photos added to album!
      </div>
    );
  }

  if (albumsLoading) {
    return (
      <div className="px-4 pb-4 pt-2 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading albums…
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-1 space-y-3">
      {/* Album selector */}
      {!creatingAlbum && albums.length > 0 ? (
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400">Album</label>
          <div className="flex gap-2">
            <select
              value={selectedAlbumId}
              onChange={e => setSelectedAlbumId(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors"
            >
              {albums.map(a => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
            <button
              onClick={() => { setCreatingAlbum(true); setSelectedAlbumId(""); }}
              className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 px-2 py-1.5 rounded-lg border border-teal-500/20 hover:bg-teal-500/10 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3 h-3" />
              New
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-xs text-slate-400">New album name</label>
          <div className="flex gap-2">
            <input
              value={newAlbumTitle}
              onChange={e => setNewAlbumTitle(e.target.value)}
              placeholder="e.g. Spring Gala 2025"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500/50 transition-colors"
            />
            {albums.length > 0 && (
              <button
                onClick={() => { setCreatingAlbum(false); setSelectedAlbumId(albums[0].id); }}
                className="text-xs text-slate-400 hover:text-white px-2 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Photo previews */}
      {previews.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {previews.map((src, i) => (
            <div key={i} className="relative aspect-square rounded-md overflow-hidden group">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeFile(i)}
                disabled={uploading}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="aspect-square rounded-md border-2 border-dashed border-white/15 flex items-center justify-center hover:border-teal-500/40 hover:bg-teal-500/5 transition-colors"
          >
            <Plus className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/8 text-xs text-slate-300 font-medium transition-colors disabled:opacity-50"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          {previews.length > 0 ? "Add more" : "Select photos"}
        </button>
        {pendingFiles.length > 0 && (
          <button
            onClick={() => void handleUpload()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/15 border border-teal-500/30 hover:bg-teal-500/25 text-xs text-teal-300 font-semibold transition-colors disabled:opacity-60"
          >
            {uploading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {uploadCount}/{pendingFiles.length}</>
              : <><Upload className="w-3.5 h-3.5" /> Upload {pendingFiles.length} photo{pendingFiles.length !== 1 ? "s" : ""}</>
            }
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFilesChange}
      />
    </div>
  );
}

// ── Sponsor Logo Panel ─────────────────────────────────────────────────────────

function SponsorLogoPanel({ onDone }: { onDone?: () => void }) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isImageFile(file)) { setError("Please select an image file."); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSave() {
    setError(null);
    if (!name.trim()) { setError("Sponsor name is required."); return; }
    setSaving(true);
    try {
      let logoUrl: string | undefined;
      if (logoFile) {
        logoUrl = await uploadImage(logoFile);
      }
      const res = await csrfFetch("/api/sponsors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          website: website.trim() || undefined,
          logoUrl,
        }),
      });
      if (!res.ok) throw new Error("Failed to save sponsor");
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setDone(true);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="px-4 pb-4 pt-2 flex items-center gap-2 text-sm text-green-400">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        Sponsor added!
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-1 space-y-3">
      {/* Logo upload */}
      <div className="flex items-center gap-3">
        <div
          onClick={() => fileRef.current?.click()}
          className="w-16 h-16 rounded-xl border-2 border-dashed border-white/15 hover:border-amber-500/40 hover:bg-amber-500/5 flex items-center justify-center cursor-pointer transition-colors flex-shrink-0 overflow-hidden"
        >
          {logoPreview
            ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
            : <ImagePlus className="w-5 h-5 text-slate-500" />
          }
        </div>
        <div className="flex-1 space-y-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Sponsor name *"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors"
          />
          <input
            value={website}
            onChange={e => setWebsite(e.target.value)}
            placeholder="Website URL (optional)"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors"
          />
        </div>
      </div>

      {logoPreview && (
        <button
          onClick={() => fileRef.current?.click()}
          className="text-xs text-slate-400 hover:text-amber-400 transition-colors"
        >
          Change logo image
        </button>
      )}

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
        </p>
      )}

      <button
        onClick={() => void handleSave()}
        disabled={saving || !name.trim()}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 text-xs text-amber-300 font-semibold transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {saving ? "Saving…" : "Add sponsor"}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLogoChange}
      />
    </div>
  );
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
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [sponsorOpen, setSponsorOpen] = useState(false);
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
