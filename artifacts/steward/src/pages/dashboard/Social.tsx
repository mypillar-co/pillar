import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Share2, Facebook, Instagram, Twitter, Plus, Loader2, Trash2, Zap,
  Calendar, Clock, CheckCircle, AlertCircle, Edit2, X, Send, Sparkles,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Settings2, Lock, Pencil, ImagePlus, Image,
} from "lucide-react";
import { uploadImage, ACCEPTED_IMAGE_TYPES, MAX_IMAGE_SIZE_MB } from "@/lib/uploadImage";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetSubscription } from "@workspace/api-client-react";
import { api, type SocialAccount, type SocialPost, type AutomationRule, type ContentStrategy } from "@/lib/api";

const PLATFORM_META: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  buffer_facebook:   { label: "Facebook",    color: "text-blue-400",  bgColor: "bg-blue-500/15",  icon: Facebook },
  buffer_instagram:  { label: "Instagram",   color: "text-pink-400",  bgColor: "bg-pink-500/15",  icon: Instagram },
  buffer_twitter:    { label: "X (Twitter)", color: "text-sky-400",   bgColor: "bg-sky-500/15",   icon: Twitter },
  buffer_linkedin:   { label: "LinkedIn",    color: "text-blue-300",  bgColor: "bg-blue-400/10",  icon: Share2 },
  buffer_pinterest:  { label: "Pinterest",   color: "text-red-400",   bgColor: "bg-red-500/15",   icon: Share2 },
};

const TIER_ALLOWS_SOCIAL = new Set(["tier1a", "tier2", "tier3"]);
const TIER_ALLOWS_STRATEGY = new Set(["tier3"]);

/**
 * Convert a stored UTC ISO string to the YYYY-MM-DDTHH:MM format that
 * datetime-local inputs expect, expressed in the user's LOCAL timezone.
 * (Using .toISOString() gives UTC which shows the wrong time in the UI.)
 */
function toLocalDatetimeInput(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PlatformBadge({ platform }: { platform: string }) {
  const meta = PLATFORM_META[platform];
  if (!meta) return <Badge variant="outline">{platform}</Badge>;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${meta.bgColor} ${meta.color} border border-current/20`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: "Draft", color: "text-slate-400", icon: Edit2 },
  scheduled: { label: "Scheduled", color: "text-amber-400", icon: Clock },
  published: { label: "Published", color: "text-emerald-400", icon: CheckCircle },
  failed: { label: "Failed", color: "text-red-400", icon: AlertCircle },
  cancelled: { label: "Cancelled", color: "text-slate-500", icon: X },
};

interface BufferProfile {
  id: string;
  service: string;
  service_username: string;
  formatted_username: string;
  avatar_https?: string;
}

const BUFFER_SERVICE_ICONS: Record<string, React.ElementType> = {
  twitter: Twitter,
  facebook: Facebook,
  instagram: Instagram,
  linkedin: Share2,
  pinterest: Share2,
};

function ConnectAccountDialog({
  open, onClose, onConnected, connectedAccounts,
}: {
  open: boolean; onClose: () => void; onConnected: () => void; connectedAccounts: SocialAccount[];
}) {
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [profiles, setProfiles] = useState<BufferProfile[] | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectedProfileIds = new Set(
    connectedAccounts.filter(a => a.isConnected && a.accountId).map(a => a.accountId!),
  );

  const handleClose = () => { setError(null); setProfiles(null); onClose(); };

  const loadProfiles = async () => {
    setLoadingProfiles(true);
    setError(null);
    try {
      const res = await fetch("/api/social/buffer/profiles", { credentials: "include" });
      const data = await res.json() as { profiles?: BufferProfile[]; error?: string };
      if (!res.ok || !data.profiles) throw new Error(data.error ?? "Could not load Buffer channels");
      setProfiles(data.profiles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load channels");
    } finally {
      setLoadingProfiles(false);
    }
  };

  const handleConnect = async (profile: BufferProfile) => {
    setConnectingId(profile.id);
    setError(null);
    try {
      const res = await fetch("/api/social/buffer/connect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id, profileName: profile.formatted_username || profile.service_username, service: profile.service }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Connect failed");
      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = async (profile: BufferProfile) => {
    setDisconnectingId(profile.id);
    setError(null);
    try {
      const res = await fetch(`/api/social/buffer/connect/${encodeURIComponent(profile.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Disconnect failed");
      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setDisconnectingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="bg-card border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Social Accounts</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Buffer section */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Connect via Buffer</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Posts to X, Facebook, Instagram, LinkedIn & more through your Buffer account.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-white/15 text-slate-300 hover:text-white hover:border-white/30 h-8 text-xs shrink-0"
                onClick={loadProfiles}
                disabled={loadingProfiles}
              >
                {loadingProfiles ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Load channels"}
              </Button>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {profiles !== null && profiles.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">
                No channels found. Add social accounts to your Buffer account first.
              </p>
            )}

            {profiles !== null && profiles.length > 0 && (
              <div className="space-y-2">
                {profiles.map(profile => {
                  const isConnected = connectedProfileIds.has(profile.id);
                  const isConnecting = connectingId === profile.id;
                  const isDisconnecting = disconnectingId === profile.id;
                  const Icon = BUFFER_SERVICE_ICONS[profile.service] ?? Share2;
                  const meta = PLATFORM_META[`buffer_${profile.service}`];
                  return (
                    <div key={profile.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta?.bgColor ?? "bg-white/10"}`}>
                          <Icon className={`w-3.5 h-3.5 ${meta?.color ?? "text-white"}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {profile.formatted_username || profile.service_username}
                          </p>
                          <p className="text-xs text-slate-500 capitalize">{profile.service}</p>
                        </div>
                      </div>
                      {isConnected ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 shrink-0"
                          onClick={() => handleDisconnect(profile)}
                          disabled={isDisconnecting}
                        >
                          {isDisconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Disconnect"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-primary hover:bg-primary/90 shrink-0"
                          onClick={() => handleConnect(profile)}
                          disabled={isConnecting}
                        >
                          {isConnecting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                          {isConnecting ? "Connecting…" : "Connect"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {profiles === null && !loadingProfiles && (
              <p className="text-xs text-slate-500 text-center py-1">
                Click "Load channels" to see your Buffer-connected social accounts.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} className="text-slate-400 hover:text-white">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ComposePostDialog({
  open, onClose, onCreated, accounts,
}: {
  open: boolean; onClose: () => void; onCreated: () => void; accounts: SocialAccount[];
}) {
  const connectedPlatforms = accounts.filter(a => a.isConnected).map(a => a.platform);
  const defaultPlatforms = connectedPlatforms.length > 0 ? [connectedPlatforms[0]] : [Object.keys(PLATFORM_META)[0]];

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(defaultPlatforms);
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [topic, setTopic] = useState("");
  const [activePlatformForGen, setActivePlatformForGen] = useState(connectedPlatforms[0] ?? "buffer_facebook");
  const [imagePromptSuggestion, setImagePromptSuggestion] = useState("");
  const imageFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const connected = accounts.filter(a => a.isConnected).map(a => a.platform);
      setSelectedPlatforms(connected.length > 0 ? [connected[0]] : [Object.keys(PLATFORM_META)[0]]);
      setActivePlatformForGen(connected[0] ?? "buffer_facebook");
      setContent(""); setMediaUrl(""); setScheduledAt(""); setImagePromptSuggestion(""); setTopic("");
      setImageUploading(false);
    }
  }, [open, accounts]);

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      toast.error(`Image must be under ${MAX_IMAGE_SIZE_MB}MB`);
      return;
    }
    setImageUploading(true);
    try {
      const url = await uploadImage(file);
      setMediaUrl(url);
      toast.success("Image uploaded");
    } catch {
      toast.error("Failed to upload image. Try pasting a URL instead.");
    } finally {
      setImageUploading(false);
      if (imageFileRef.current) imageFileRef.current.value = "";
    }
  };

  const needsMedia = selectedPlatforms.includes("buffer_instagram");

  const togglePlatform = (p: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await api.social.posts.generate({ platform: activePlatformForGen, topic: topic || undefined });
      setContent(result.content);
      if (result.imagePrompt) {
        setImagePromptSuggestion(result.imagePrompt);
      }
      toast.success("Post content generated");
    } catch {
      toast.error("Failed to generate content");
    } finally {
      setGenerating(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedPlatforms.length) { toast.error("Select at least one platform"); return; }
    if (!content.trim()) { toast.error("Post content is required"); return; }
    if (needsMedia && !mediaUrl.trim()) { toast.error("An image URL is required for Instagram posts"); return; }
    setLoading(true);
    try {
      // datetime-local gives "2025-04-02T15:30" with no timezone — convert to
      // a full UTC ISO string so the server validates against the user's real time.
      const scheduledAtIso = scheduledAt ? new Date(scheduledAt).toISOString() : undefined;
      await api.social.posts.create({
        platforms: selectedPlatforms,
        content,
        mediaUrl: mediaUrl.trim() || undefined,
        scheduledAt: scheduledAtIso,
      });
      toast.success(scheduledAt ? "Post scheduled" : "Post saved as draft");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setLoading(false);
    }
  };

  const charCount = content.length;
  const twitterLimit = selectedPlatforms.includes("buffer_twitter") && charCount > 280;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Compose Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-slate-300 text-sm mb-2 block">Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PLATFORM_META).map(([key, meta]) => {
                const Icon = meta.icon;
                const isConnected = connectedPlatforms.includes(key);
                const isSelected = selectedPlatforms.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => togglePlatform(key)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
                      isSelected
                        ? `${meta.bgColor} ${meta.color} border-current/30`
                        : "border-white/10 text-slate-400 hover:border-white/20"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {meta.label}
                    {!isConnected && <span className="opacity-50 ml-1">•</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300 text-sm">Content</Label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${twitterLimit ? "text-red-400" : "text-slate-500"}`}>{charCount} chars</span>
              </div>
            </div>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write your post here..."
              rows={5}
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none"
            />
            {twitterLimit && (
              <p className="text-xs text-red-400">⚠ Exceeds Twitter's 280 character limit</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-slate-300 text-sm block">
              Image
              {needsMedia
                ? <span className="text-pink-400 ml-1 font-medium">* required for Instagram</span>
                : <span className="text-slate-500 ml-1">(optional)</span>
              }
            </Label>
            <input
              ref={imageFileRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="hidden"
              onChange={handleImageFileSelect}
            />
            {mediaUrl ? (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <Image className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-xs text-slate-300 truncate flex-1">{mediaUrl.split("/").pop()}</span>
                <button onClick={() => setMediaUrl("")} className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => imageFileRef.current?.click()}
                  disabled={imageUploading}
                  className="border-white/10 text-slate-300 hover:text-white hover:bg-white/10 h-9 text-xs flex-shrink-0"
                >
                  {imageUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <ImagePlus className="w-3.5 h-3.5 mr-1.5" />}
                  {imageUploading ? "Uploading..." : "Upload Photo"}
                </Button>
                <Input
                  value={mediaUrl}
                  onChange={e => setMediaUrl(e.target.value)}
                  placeholder="or paste image URL..."
                  className={`bg-white/5 text-white placeholder:text-slate-500 text-sm h-9 ${needsMedia && !mediaUrl.trim() ? "border-pink-500/50" : "border-white/10"}`}
                />
              </div>
            )}
            {imagePromptSuggestion && (
              <div className="rounded-md bg-pink-500/10 border border-pink-500/20 p-2.5">
                <p className="text-xs text-pink-300 font-medium mb-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> AI image prompt suggestion
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">{imagePromptSuggestion}</p>
              </div>
            )}
          </div>

          <div className="border border-white/10 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-slate-300 font-medium">AI Generate</span>
            </div>
            <div className="flex gap-2">
              <Select value={activePlatformForGen} onValueChange={setActivePlatformForGen}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white text-xs h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  {Object.entries(PLATFORM_META).map(([k, m]) => (
                    <SelectItem key={k} value={k} className="text-white text-xs hover:bg-white/10">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Topic or event to post about..."
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 text-xs h-8 flex-1"
              />
              <Button onClick={handleGenerate} disabled={generating} size="sm" className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 h-8">
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-slate-300 text-sm mb-1.5 block">Schedule (optional)</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="bg-white/5 border-white/10 text-white text-sm"
            />
            <div className="flex items-start gap-1.5 mt-1.5">
              <Clock className="w-3 h-3 text-primary/70 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-500 leading-relaxed">
                <span className="text-slate-400 font-medium">Best times for civic orgs:</span> Tue–Thu 10 am–12 pm or 7–9 pm. Leave blank to save as draft.
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">Cancel</Button>
          <Button onClick={handleCreate} disabled={loading} className="bg-primary hover:bg-primary/90">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            {scheduledAt ? "Schedule Post" : "Save Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPostDialog({
  open, onClose, onSaved, post,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  post: SocialPost;
}) {
  const [content, setContent] = useState(post.content);
  const [mediaUrl, setMediaUrl] = useState(post.mediaUrl ?? "");
  const [scheduledAt, setScheduledAt] = useState(
    post.scheduledAt ? toLocalDatetimeInput(post.scheduledAt) : ""
  );
  const [loading, setLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const editImageFileRef = useRef<HTMLInputElement>(null);

  const needsMedia = post.platforms.includes("buffer_instagram");

  useEffect(() => {
    setContent(post.content);
    setMediaUrl(post.mediaUrl ?? "");
    // Show the stored UTC time in the user's local timezone for the input
    setScheduledAt(post.scheduledAt ? toLocalDatetimeInput(post.scheduledAt) : "");
  }, [post]);

  const handleEditImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      toast.error(`Image must be under ${MAX_IMAGE_SIZE_MB}MB`);
      return;
    }
    setImageUploading(true);
    try {
      const url = await uploadImage(file);
      setMediaUrl(url);
      toast.success("Image uploaded");
    } catch {
      toast.error("Failed to upload image. Try pasting a URL instead.");
    } finally {
      setImageUploading(false);
      if (editImageFileRef.current) editImageFileRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!content.trim()) { toast.error("Post content is required"); return; }
    if (needsMedia && !mediaUrl.trim()) { toast.error("An image URL is required for Instagram posts"); return; }
    setLoading(true);
    try {
      const newStatus = scheduledAt ? "scheduled" : "draft";
      // Convert datetime-local value to full UTC ISO string before sending
      const scheduledAtIso = scheduledAt ? new Date(scheduledAt).toISOString() : undefined;
      await api.social.posts.update(post.id, {
        content,
        mediaUrl: mediaUrl.trim() || undefined,
        scheduledAt: scheduledAtIso,
        status: newStatus,
      });
      toast.success("Post updated");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update post");
    } finally {
      setLoading(false);
    }
  };

  const charCount = content.length;
  const twitterLimit = post.platforms.includes("buffer_twitter") && charCount > 280;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {post.platforms.map(p => <PlatformBadge key={p} platform={p} />)}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300 text-sm">Content</Label>
              <span className={`text-xs ${twitterLimit ? "text-red-400" : "text-slate-500"}`}>{charCount} chars</span>
            </div>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={5}
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none"
            />
            {twitterLimit && <p className="text-xs text-red-400">Exceeds Twitter's 280 character limit</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-sm block">
              Image
              {needsMedia
                ? <span className="text-pink-400 ml-1 font-medium">* required for Instagram</span>
                : <span className="text-slate-500 ml-1">(optional)</span>
              }
            </Label>
            <input
              ref={editImageFileRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="hidden"
              onChange={handleEditImageFileSelect}
            />
            {mediaUrl ? (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <Image className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-xs text-slate-300 truncate flex-1">{mediaUrl.split("/").pop()}</span>
                <button onClick={() => setMediaUrl("")} className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => editImageFileRef.current?.click()}
                  disabled={imageUploading}
                  className="border-white/10 text-slate-300 hover:text-white hover:bg-white/10 h-9 text-xs flex-shrink-0"
                >
                  {imageUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <ImagePlus className="w-3.5 h-3.5 mr-1.5" />}
                  {imageUploading ? "Uploading..." : "Upload Photo"}
                </Button>
                <Input
                  value={mediaUrl}
                  onChange={e => setMediaUrl(e.target.value)}
                  placeholder="or paste image URL..."
                  className={`bg-white/5 text-white placeholder:text-slate-500 text-sm h-9 ${needsMedia && !mediaUrl.trim() ? "border-pink-500/50" : "border-white/10"}`}
                />
              </div>
            )}
          </div>
          <div>
            <Label className="text-slate-300 text-sm mb-1.5 block">Schedule Date/Time (optional)</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">Cancel</Button>
          <Button onClick={handleSave} disabled={loading} className="bg-primary hover:bg-primary/90">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AutomationRuleDialog({
  open, onClose, onSaved, editingRule, accounts,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  editingRule?: AutomationRule; accounts: SocialAccount[];
}) {
  const [name, setName] = useState(editingRule?.name ?? "");
  const [platforms, setPlatforms] = useState<string[]>(editingRule?.platforms ?? ["facebook"]);
  const [frequency, setFrequency] = useState(editingRule?.frequency ?? "weekly");
  const [dayOfWeek, setDayOfWeek] = useState(editingRule?.dayOfWeek ?? "monday");
  const [timeOfDay, setTimeOfDay] = useState(editingRule?.timeOfDay ?? "09:00");
  const [contentType, setContentType] = useState(editingRule?.contentType ?? "events");
  const [customPrompt, setCustomPrompt] = useState(editingRule?.customPrompt ?? "");
  const [loading, setLoading] = useState(false);

  const connectedPlatforms = accounts.filter(a => a.isConnected).map(a => a.platform);
  const togglePlatform = (p: string) => {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const handleSave = async () => {
    if (!name) { toast.error("Rule name is required"); return; }
    if (!platforms.length) { toast.error("Select at least one platform"); return; }
    setLoading(true);
    try {
      if (editingRule) {
        await api.social.rules.update(editingRule.id, { name, platforms, frequency, dayOfWeek: dayOfWeek || undefined, timeOfDay, contentType, customPrompt: customPrompt || undefined });
        toast.success("Automation rule updated");
      } else {
        await api.social.rules.create({ name, platforms, frequency, dayOfWeek: dayOfWeek || undefined, timeOfDay, contentType, customPrompt: customPrompt || undefined });
        toast.success("Automation rule created");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save rule");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>{editingRule ? "Edit Automation Rule" : "Create Automation Rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-slate-300 text-sm mb-1.5 block">Rule Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekly Events Post" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
          </div>
          <div>
            <Label className="text-slate-300 text-sm mb-2 block">Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PLATFORM_META).filter(([key]) => key !== "instagram").map(([key, meta]) => {
                const Icon = meta.icon;
                const isConnected = connectedPlatforms.includes(key);
                const isSelected = platforms.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => togglePlatform(key)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
                      isSelected
                        ? `${meta.bgColor} ${meta.color} border-current/30`
                        : "border-white/10 text-slate-400 hover:border-white/20"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {meta.label}
                    {!isConnected && <span className="opacity-50 ml-1">•</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">Instagram requires a media URL per post and is not available for automation. Post to Instagram manually from the Posts tab.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300 text-sm mb-1.5 block">Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  <SelectItem value="daily" className="text-white hover:bg-white/10">Daily</SelectItem>
                  <SelectItem value="weekly" className="text-white hover:bg-white/10">Weekly</SelectItem>
                  <SelectItem value="monthly" className="text-white hover:bg-white/10">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {frequency === "weekly" && (
              <div>
                <Label className="text-slate-300 text-sm mb-1.5 block">Day of Week</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-white/10">
                    {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(d => (
                      <SelectItem key={d} value={d} className="text-white hover:bg-white/10 capitalize">{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-slate-300 text-sm mb-1.5 block">Time</Label>
              <Input type="time" value={timeOfDay} onChange={e => setTimeOfDay(e.target.value)} className="bg-white/5 border-white/10 text-white text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-slate-300 text-sm mb-1.5 block">Content Type</Label>
            <Select value={contentType} onValueChange={setContentType}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="events" className="text-white hover:bg-white/10">Upcoming Events</SelectItem>
                <SelectItem value="announcements" className="text-white hover:bg-white/10">Weekly Announcements</SelectItem>
                <SelectItem value="general" className="text-white hover:bg-white/10">General Updates</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-slate-300 text-sm mb-1.5 block">Custom Instructions (optional)</Label>
            <Textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="e.g. Focus on community impact. Always mention our mission statement."
              rows={3}
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">Cancel</Button>
          <Button onClick={handleSave} disabled={loading} className="bg-primary hover:bg-primary/90">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {editingRule ? "Save Changes" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountsSection({ accounts, onRefresh }: { accounts: SocialAccount[]; onRefresh: () => void }) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const handleDisconnect = async (id: string) => {
    setDisconnecting(id);
    try {
      await api.social.accounts.disconnect(id);
      toast.success("Account disconnected");
      onRefresh();
    } catch {
      toast.error("Failed to disconnect account");
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-medium">Connected Accounts</h3>
          <p className="text-xs text-slate-400 mt-0.5">Connect your social media accounts to start posting</p>
        </div>
        <Button onClick={() => setConnectOpen(true)} size="sm" className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-1.5" /> Connect Account
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.entries(PLATFORM_META).map(([platform, meta]) => {
          const account = accounts.find(a => a.platform === platform && a.isConnected);
          const Icon = meta.icon;
          return (
            <Card key={platform} className={`border-white/10 ${account ? "bg-card/60" : "bg-card/30"}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${account ? meta.bgColor : "bg-white/5"}`}>
                    <Icon className={`w-5 h-5 ${account ? meta.color : "text-slate-500"}`} />
                  </div>
                  {account
                    ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-xs">Connected</Badge>
                    : <Badge className="bg-white/5 text-slate-500 border-white/10 text-xs">Not connected</Badge>
                  }
                </div>
                <p className="text-sm font-medium text-white mb-0.5">{meta.label}</p>
                {account
                  ? <p className="text-xs text-slate-400 truncate">{account.accountName}</p>
                  : <p className="text-xs text-slate-500">Click Connect to add</p>
                }
                {account && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDisconnect(account.id)}
                    disabled={disconnecting === account.id}
                    className="mt-3 w-full text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 h-7"
                  >
                    {disconnecting === account.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
                    Disconnect
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ConnectAccountDialog open={connectOpen} onClose={() => setConnectOpen(false)} onConnected={onRefresh} connectedAccounts={accounts} />
    </div>
  );
}

function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const { data: scheduledPosts = [] } = useQuery({
    queryKey: ["social-posts-calendar-scheduled"],
    queryFn: () => api.social.posts.list("scheduled"),
  });

  const postsByDay = useMemo(() => {
    const map: Record<number, SocialPost[]> = {};
    for (const post of scheduledPosts) {
      if (!post.scheduledAt) continue;
      const d = new Date(post.scheduledAt);
      if (d.getFullYear() === currentMonth.year && d.getMonth() === currentMonth.month) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(post);
      }
    }
    return map;
  }, [scheduledPosts, currentMonth]);

  const daysInMonth = new Date(currentMonth.year, currentMonth.month + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentMonth.year, currentMonth.month, 1).getDay();
  const monthName = new Date(currentMonth.year, currentMonth.month, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const today = new Date();

  const prevMonth = () => setCurrentMonth(m => {
    const d = new Date(m.year, m.month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const nextMonth = () => setCurrentMonth(m => {
    const d = new Date(m.year, m.month + 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth} className="h-7 w-7 text-slate-400 hover:text-white">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium text-white">{monthName}</span>
        <Button variant="ghost" size="icon" onClick={nextMonth} className="h-7 w-7 text-slate-400 hover:text-white">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} className="text-xs text-slate-500 font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = today.getFullYear() === currentMonth.year && today.getMonth() === currentMonth.month && today.getDate() === day;
          const hasPosts = !!postsByDay[day]?.length;
          const isSelected = selectedDay === day;
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              className={`relative h-10 rounded-lg text-xs flex flex-col items-center justify-center gap-0.5 transition-colors
                ${isSelected ? "bg-primary/20 text-primary border border-primary/30" : isToday ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
            >
              <span className={isToday ? "font-semibold" : ""}>{day}</span>
              {hasPosts && (
                <div className="flex gap-0.5">
                  {postsByDay[day].slice(0, 3).map((_, pi) => (
                    <div key={pi} className="w-1 h-1 rounded-full bg-primary" />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay !== null && (
        <div className="border-t border-white/10 pt-3 space-y-2">
          <p className="text-xs text-slate-400 font-medium">
            {postsByDay[selectedDay]?.length
              ? `${postsByDay[selectedDay].length} post${postsByDay[selectedDay].length > 1 ? "s" : ""} scheduled on ${new Date(currentMonth.year, currentMonth.month, selectedDay).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
              : `No posts scheduled for ${new Date(currentMonth.year, currentMonth.month, selectedDay).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
            }
          </p>
          {(postsByDay[selectedDay] ?? []).map(post => (
            <Card key={post.id} className="border-white/10 bg-card/40">
              <CardContent className="pt-2.5 pb-2.5 px-3">
                <p className="text-sm text-white line-clamp-2">{post.content}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {post.platforms.map(p => <PlatformBadge key={p} platform={p} />)}
                  {post.scheduledAt && (
                    <span className="text-xs text-slate-400">
                      {new Date(post.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PostsSection({ accounts }: { accounts: SocialAccount[] }) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [tab, setTab] = useState("scheduled");
  const queryClient = useQueryClient();

  const { data: posts, isLoading } = useQuery({
    queryKey: ["social-posts", tab],
    queryFn: () => api.social.posts.list(tab === "all" ? undefined : tab),
    enabled: tab !== "calendar",
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.social.posts.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success("Post removed");
    },
    onError: () => toast.error("Failed to remove post"),
  });

  const formatDate = (dt: string | null | undefined) => {
    if (!dt) return "—";
    return new Date(dt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-medium">Posts</h3>
          <p className="text-xs text-slate-400 mt-0.5">Compose, schedule, and track your social media posts</p>
        </div>
        <Button onClick={() => setComposeOpen(true)} size="sm" className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-1.5" /> Compose Post
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white/5 border border-white/10 h-8">
          {["scheduled", "published", "draft", "failed", "all"].map(t => (
            <TabsTrigger key={t} value={t} className="text-xs capitalize data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400 h-7">
              {t}
            </TabsTrigger>
          ))}
          <TabsTrigger value="calendar" className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400 h-7 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Calendar
          </TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="mt-3">
          <CalendarView />
        </TabsContent>
        <TabsContent value={tab === "calendar" ? "__none__" : tab} className="mt-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : !posts?.length ? (
            <div className="text-center py-10 text-slate-500">
              <Share2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No {tab === "all" ? "" : tab} posts yet</p>
              <p className="text-xs mt-1">Compose your first post to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {posts.map(post => {
                const statusMeta = STATUS_META[post.status] ?? STATUS_META.draft;
                const StatusIcon = statusMeta.icon;
                return (
                  <Card key={post.id} className="border-white/10 bg-card/40">
                    <CardContent className="pt-3 pb-3 px-4">
                      <div className="flex items-start gap-3">
                        <StatusIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${statusMeta.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white leading-snug line-clamp-2">{post.content}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {post.platforms.map(p => <PlatformBadge key={p} platform={p} />)}
                            {post.scheduledAt && (
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> {formatDate(post.scheduledAt)}
                              </span>
                            )}
                            {post.publishedAt && (
                              <span className="text-xs text-emerald-400 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> {formatDate(post.publishedAt)}
                              </span>
                            )}
                            {post.errorMessage && (
                              <span className="text-xs text-red-400 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {post.errorMessage}
                              </span>
                            )}
                            {post.automationRuleId && (
                              <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">Auto</Badge>
                            )}
                          </div>
                        </div>
                        {post.status !== "published" && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-500 hover:text-primary hover:bg-primary/10"
                              onClick={() => setEditingPost(post)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                              onClick={() => deleteMutation.mutate(post.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ComposePostDialog open={composeOpen} onClose={() => setComposeOpen(false)} onCreated={() => queryClient.invalidateQueries({ queryKey: ["social-posts"] })} accounts={accounts} />
      {editingPost && (
        <EditPostDialog
          open={!!editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={() => { setEditingPost(null); queryClient.invalidateQueries({ queryKey: ["social-posts"] }); }}
          post={editingPost}
        />
      )}
    </div>
  );
}

function AutomationSection({ accounts }: { accounts: SocialAccount[] }) {
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | undefined>();
  const queryClient = useQueryClient();

  const { data: rules, isLoading } = useQuery({
    queryKey: ["social-rules"],
    queryFn: () => api.social.rules.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.social.rules.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-rules"] });
      toast.success("Rule deleted");
    },
    onError: () => toast.error("Failed to delete rule"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.social.rules.update(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["social-rules"] }),
    onError: () => toast.error("Failed to update rule"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-medium">Automation Rules</h3>
          <p className="text-xs text-slate-400 mt-0.5">Set recurring posting schedules — the AI generates and publishes automatically</p>
        </div>
        <Button onClick={() => { setEditingRule(undefined); setRuleDialogOpen(true); }} size="sm" className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-1.5" /> Add Rule
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !rules?.length ? (
        <Card className="border-white/10 bg-card/30">
          <CardContent className="py-10 text-center text-slate-500">
            <Zap className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No automation rules yet</p>
            <p className="text-xs mt-1">Create a rule to post automatically on a schedule</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <Card key={rule.id} className="border-white/10 bg-card/40">
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-white">{rule.name}</p>
                      {!rule.isActive && <Badge className="bg-white/5 text-slate-500 border-white/10 text-xs">Paused</Badge>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {rule.platforms.map(p => <PlatformBadge key={p} platform={p} />)}
                      <span className="text-xs text-slate-400 capitalize">
                        {rule.frequency}{rule.dayOfWeek ? ` on ${rule.dayOfWeek}` : ""} at {rule.timeOfDay ?? "09:00"}
                      </span>
                      <Badge className="bg-white/5 text-slate-400 border-white/10 text-xs capitalize">{rule.contentType ?? "events"}</Badge>
                    </div>
                    {rule.nextRunAt && (
                      <p className="text-xs text-slate-500 mt-1">
                        Next run: {new Date(rule.nextRunAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })}
                      className="text-slate-400 hover:text-white p-1"
                    >
                      {rule.isActive ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-slate-500 hover:text-white hover:bg-white/5"
                      onClick={() => { setEditingRule(rule); setRuleDialogOpen(true); }}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => deleteMutation.mutate(rule.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AutomationRuleDialog
        open={ruleDialogOpen}
        onClose={() => setRuleDialogOpen(false)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["social-rules"] })}
        editingRule={editingRule}
        accounts={accounts}
      />
    </div>
  );
}

function ContentStrategySection() {
  const queryClient = useQueryClient();
  const { data: strategy, isLoading } = useQuery({
    queryKey: ["social-strategy"],
    queryFn: () => api.social.strategy.get(),
  });

  const [tone, setTone] = useState("");
  const [postingFrequency, setPostingFrequency] = useState("weekly");
  const [topicsInput, setTopicsInput] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [isAutonomous, setIsAutonomous] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (strategy && !initialized) {
      setTone(strategy.tone ?? "professional");
      setPostingFrequency(strategy.postingFrequency ?? "weekly");
      setTopicsInput((strategy.topics ?? []).join(", "));
      setPlatforms(strategy.platforms ?? []);
      setIsAutonomous(strategy.isAutonomous ?? false);
      setInitialized(true);
    } else if (strategy === null && !initialized) {
      setTone("professional");
      setInitialized(true);
    }
  }, [strategy, initialized]);

  const togglePlatform = (p: string) => {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const topics = topicsInput.split(",").map(t => t.trim()).filter(Boolean);
      await api.social.strategy.update({ tone, postingFrequency, topics, platforms, isAutonomous });
      queryClient.invalidateQueries({ queryKey: ["social-strategy"] });
      toast.success("Content strategy saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save strategy");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-white font-medium">Content Strategy</h3>
        <p className="text-xs text-slate-400 mt-0.5">Configure your AI-driven content strategy. The AI will run fully autonomous social campaigns based on these preferences.</p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-white">Fully Autonomous Mode</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">When enabled, the AI generates and publishes posts automatically without any user interaction.</p>
          <div className="flex items-center gap-2">
            <Switch checked={isAutonomous} onCheckedChange={setIsAutonomous} />
            <span className="text-sm text-slate-300">{isAutonomous ? "Autonomous posting enabled" : "Autonomous posting disabled"}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-slate-300 text-sm mb-1.5 block">Tone</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Select tone" />
            </SelectTrigger>
            <SelectContent className="bg-card border-white/10">
              <SelectItem value="professional" className="text-white hover:bg-white/10">Professional</SelectItem>
              <SelectItem value="casual" className="text-white hover:bg-white/10">Casual & Friendly</SelectItem>
              <SelectItem value="formal" className="text-white hover:bg-white/10">Formal</SelectItem>
              <SelectItem value="inspiring" className="text-white hover:bg-white/10">Inspiring</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-slate-300 text-sm mb-1.5 block">Posting Frequency</Label>
          <Select value={postingFrequency} onValueChange={setPostingFrequency}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-white/10">
              <SelectItem value="daily" className="text-white hover:bg-white/10">Daily</SelectItem>
              <SelectItem value="twice-weekly" className="text-white hover:bg-white/10">Twice a week</SelectItem>
              <SelectItem value="weekly" className="text-white hover:bg-white/10">Once a week</SelectItem>
              <SelectItem value="biweekly" className="text-white hover:bg-white/10">Every two weeks</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-slate-300 text-sm mb-1.5 block">Priority Topics</Label>
        <Input
          value={topicsInput}
          onChange={e => setTopicsInput(e.target.value)}
          placeholder="e.g. community events, fundraising, volunteer opportunities"
          className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
        />
        <p className="text-xs text-slate-500 mt-1">Comma-separated topics the AI should prioritize</p>
      </div>

      <div>
        <Label className="text-slate-300 text-sm mb-2 block">Target Platforms</Label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PLATFORM_META).filter(([key]) => key !== "instagram").map(([key, meta]) => {
            const Icon = meta.icon;
            const isSelected = platforms.includes(key);
            return (
              <button
                key={key}
                onClick={() => togglePlatform(key)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
                  isSelected
                    ? `${meta.bgColor} ${meta.color} border-current/30`
                    : "border-white/10 text-slate-400 hover:border-white/20"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {meta.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 mt-1.5">Instagram is excluded from autonomous posting as it requires a media URL per post. Post to Instagram manually.</p>
      </div>

      <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Settings2 className="w-4 h-4 mr-2" />}
        Save Strategy
      </Button>
    </div>
  );
}

export default function Social() {
  const { data: subscriptionData, isLoading: subscriptionLoading } = useGetSubscription();
  const tier = subscriptionData?.tierId ?? null;
  const hasSocial = TIER_ALLOWS_SOCIAL.has(tier ?? "");
  const hasStrategy = TIER_ALLOWS_STRATEGY.has(tier ?? "");
  const [tab, setTab] = useState("accounts");
  const queryClient = useQueryClient();

  const { data: accounts = [], refetch: refetchAccounts } = useQuery({
    queryKey: ["social-accounts"],
    queryFn: () => api.social.accounts.list(),
    enabled: hasSocial,
  });

  const { data: failedPosts = [] } = useQuery({
    queryKey: ["social-posts-failed-banner"],
    queryFn: () => api.social.posts.list("failed"),
    enabled: hasSocial,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");
    if (success) {
      toast.success(decodeURIComponent(success));
      queryClient.invalidateQueries({ queryKey: ["social-accounts"] });
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      window.history.replaceState({}, "", url.toString());
    }
    if (error) {
      toast.error(decodeURIComponent(error));
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [queryClient]);

  if (subscriptionLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasSocial) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary/15 rounded-xl flex items-center justify-center">
            <Share2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Social Media</h1>
            <p className="text-sm text-slate-400">Automate your social media presence</p>
          </div>
        </div>
        <Card className="border-white/10 bg-card/40">
          <CardContent className="py-12 text-center">
            <Lock className="w-10 h-10 text-slate-500 mx-auto mb-3" />
            <h2 className="text-white font-semibold mb-2">Upgrade to unlock Social Media</h2>
            <p className="text-sm text-slate-400 max-w-sm mx-auto mb-4">
              Social media automation is available on the Autopilot plan ($59/mo) and above. Connect Facebook, Instagram, and X to start posting automatically.
            </p>
            <Button asChild className="bg-primary hover:bg-primary/90">
              <a href="/billing">View Plans</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary/15 rounded-xl flex items-center justify-center">
          <Share2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Social Media</h1>
          <p className="text-sm text-slate-400">Connect accounts, compose posts, and automate your presence</p>
        </div>
      </div>

      {failedPosts.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300 flex-1">
            {failedPosts.length} post{failedPosts.length > 1 ? "s" : ""} failed to publish.
            {" "}<button
              onClick={() => setTab("posts")}
              className="underline hover:text-red-200 transition-colors"
            >
              Review in Posts
            </button>
          </p>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white/5 border border-white/10 mb-6 h-9">
          <TabsTrigger data-tour="accounts-tab" value="accounts" className="text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400 h-8">
            Accounts
          </TabsTrigger>
          <TabsTrigger value="posts" className="text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400 h-8">
            Posts
          </TabsTrigger>
          <TabsTrigger value="automation" className="text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400 h-8">
            Automation
          </TabsTrigger>
          {hasStrategy && (
            <TabsTrigger value="strategy" className="text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400 h-8 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Strategy
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="accounts">
          <AccountsSection accounts={accounts} onRefresh={refetchAccounts} />
        </TabsContent>
        <TabsContent value="posts">
          <PostsSection accounts={accounts} />
        </TabsContent>
        <TabsContent value="automation">
          <AutomationSection accounts={accounts} />
        </TabsContent>
        {hasStrategy && (
          <TabsContent value="strategy">
            <ContentStrategySection />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
