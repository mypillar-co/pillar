import React, { useState, useEffect, useCallback } from "react";
import {
  Link2, Plus, Trash2, Eye, ThumbsUp, HelpCircle, XCircle,
  Loader2, Copy, CheckCircle2, ExternalLink, Share2, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Vote {
  id: string;
  voterName: string;
  voterEmail: string | null;
  vote: string;
  comment: string | null;
  createdAt: string;
}

interface BoardLink {
  id: string;
  token: string;
  orgName: string | null;
  message: string | null;
  viewCount: number;
  expiresAt: string | null;
  createdAt: string;
  votes: Vote[];
  voteCounts: { approve: number; question: number; decline: number };
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground hover:text-white hover:border-white/20 transition-all"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

function voteIcon(vote: string) {
  if (vote === "approve") return <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (vote === "question") return <HelpCircle className="w-3.5 h-3.5 text-amber-400" />;
  return <XCircle className="w-3.5 h-3.5 text-red-400" />;
}

function voteLabel(vote: string) {
  if (vote === "approve") return "Approves";
  if (vote === "question") return "Has questions";
  return "Declined";
}

function voteColor(vote: string) {
  if (vote === "approve") return "text-emerald-400";
  if (vote === "question") return "text-amber-400";
  return "text-red-400";
}

export default function BoardLinks() {
  const [links, setLinks] = useState<BoardLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadLinks = useCallback(() => {
    fetch("/api/board-links", { credentials: "include" })
      .then(r => r.json())
      .then((data: { links?: BoardLink[] }) => setLinks(data.links ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/board-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: message.trim() || undefined }),
      });
      const data = await res.json() as { link?: BoardLink; error?: string };
      if (!res.ok || !data.link) { toast.error(data.error ?? "Failed to create link"); return; }
      toast.success("Board approval link created");
      setMessage("");
      setShowCreate(false);
      loadLinks();
    } catch {
      toast.error("Failed to create link");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/board-links/${id}`, { method: "DELETE", credentials: "include" });
      setLinks(l => l.filter(link => link.id !== id));
      toast.success("Link deleted");
    } catch {
      toast.error("Failed to delete link");
    }
  };

  const getLinkUrl = (token: string) => `${window.location.origin}/board/${token}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Board Approval Links</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Generate a shareable link your board members can open — no login required. They review a Pillar pitch and cast a vote.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(v => !v)}
          className="gap-2 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          New link
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Create Board Approval Link</h3>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Personal message (optional)</label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Hey everyone — I've been looking at this platform for our chapter. Would love your input before we commit..."
              rows={3}
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">Displayed on the board review page above the pitch. Optional but recommended.</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleCreate} disabled={creating} className="gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Generate link
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-white/20 text-white hover:bg-white/5">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Links list */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : links.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center border border-dashed border-white/10 rounded-2xl">
          <Share2 className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-white">No board links yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create a link and share it with your board for a vote on adopting Pillar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map(link => {
            const totalVotes = link.voteCounts.approve + link.voteCounts.question + link.voteCounts.decline;
            const isExpanded = expandedId === link.id;

            return (
              <div key={link.id} className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="p-4">
                  {/* Link URL + actions */}
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-mono truncate">{getLinkUrl(link.token)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <CopyButton value={getLinkUrl(link.token)} />
                      <a
                        href={getLinkUrl(link.token)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground hover:text-white hover:border-white/20 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Preview
                      </a>
                      <button
                        onClick={() => handleDelete(link.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 hover:bg-red-500/20 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Eye className="w-3.5 h-3.5" />
                      {link.viewCount} view{link.viewCount !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <ThumbsUp className="w-3.5 h-3.5" />
                      {link.voteCounts.approve} approve
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-amber-400">
                      <HelpCircle className="w-3.5 h-3.5" />
                      {link.voteCounts.question} questions
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-red-400">
                      <XCircle className="w-3.5 h-3.5" />
                      {link.voteCounts.decline} declined
                    </span>
                    {link.expiresAt && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        Expires {new Date(link.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {/* Personal message preview */}
                  {link.message && (
                    <p className="mt-3 text-xs text-muted-foreground italic border-t border-white/5 pt-3">
                      "{link.message}"
                    </p>
                  )}

                  {/* Expand/collapse votes */}
                  {totalVotes > 0 && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : link.id)}
                      className="mt-3 text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {isExpanded ? "Hide" : "Show"} {totalVotes} response{totalVotes !== 1 ? "s" : ""}
                    </button>
                  )}
                </div>

                {/* Expanded votes */}
                {isExpanded && link.votes.length > 0 && (
                  <div className="border-t border-white/10 divide-y divide-white/5">
                    {link.votes.map(vote => (
                      <div key={vote.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="mt-0.5">{voteIcon(vote.vote)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-white">{vote.voterName}</span>
                            <span className={`text-xs font-medium ${voteColor(vote.vote)}`}>{voteLabel(vote.vote)}</span>
                            {vote.voterEmail && <span className="text-xs text-muted-foreground">{vote.voterEmail}</span>}
                          </div>
                          {vote.comment && (
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">"{vote.comment}"</p>
                          )}
                          <p className="text-[10px] text-muted-foreground/50 mt-1">{new Date(vote.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* How it works callout */}
      <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-2">
        <p className="text-xs font-semibold text-white">How board approval links work</p>
        <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal pl-4">
          <li>Create a link with an optional personal message</li>
          <li>Share it with your board — email, Slack, text message, however you communicate</li>
          <li>Board members open the link (no account required) and see a full Pillar pitch tailored to your org</li>
          <li>They cast their vote: Approve, Have questions, or Not the right fit — with optional comments</li>
          <li>You see all responses here in real time</li>
        </ol>
        <p className="text-xs text-muted-foreground">Links expire after 30 days.</p>
      </div>
    </div>
  );
}
