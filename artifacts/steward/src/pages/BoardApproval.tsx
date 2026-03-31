import React, { useState, useEffect } from "react";
import { useParams } from "wouter";
import { motion } from "framer-motion";
import {
  CheckCircle2, HelpCircle, XCircle, Shield, Globe, Calendar,
  Share2, Bot, ArrowRight, Loader2, AlertCircle, ThumbsUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";

interface BoardLink {
  id: string;
  orgName: string | null;
  orgType: string | null;
  message: string | null;
  viewCount: number;
  expiresAt: string | null;
}

type VoteOption = "approve" | "question" | "decline";

const VOTE_OPTIONS: { value: VoteOption; label: string; sublabel: string; icon: React.ReactNode; color: string; bg: string; border: string }[] = [
  {
    value: "approve",
    label: "Our board approves",
    sublabel: "We're ready to move forward with Pillar",
    icon: <ThumbsUp className="w-6 h-6" />,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  {
    value: "question",
    label: "We have questions",
    sublabel: "Interested but need more information first",
    icon: <HelpCircle className="w-6 h-6" />,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  {
    value: "decline",
    label: "Not the right fit",
    sublabel: "This doesn't meet our organization's needs",
    icon: <XCircle className="w-6 h-6" />,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
];

const FEATURES = [
  { icon: <Globe className="w-5 h-5 text-primary" />, title: "AI-built website", body: "Professional organization website built in minutes from a short interview. No designer needed." },
  { icon: <Calendar className="w-5 h-5 text-primary" />, title: "Events & ticketing", body: "Create events, sell tickets, track RSVPs, and send automated attendee communications." },
  { icon: <Share2 className="w-5 h-5 text-primary" />, title: "Social media on autopilot", body: "Posts go out to Facebook, Instagram, and X automatically — no social media manager needed." },
  { icon: <Bot className="w-5 h-5 text-primary" />, title: "Always up to date", body: "Your website updates itself when things change. Just tell Pillar in plain language — done." },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export default function BoardApproval() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [link, setLink] = useState<BoardLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedVote, setSelectedVote] = useState<VoteOption | null>(null);
  const [voterName, setVoterName] = useState("");
  const [voterEmail, setVoterEmail] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/board-links/view/${token}`)
      .then(r => r.json())
      .then((data: { link?: BoardLink; error?: string }) => {
        if (data.error) setError(data.error);
        else if (data.link) setLink(data.link);
      })
      .catch(() => setError("Could not load this presentation"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!selectedVote || !voterName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/board-links/view/${token}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterName, voterEmail, vote: selectedVote, comment }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to submit"); return; }
      setSubmitted(true);
    } catch {
      setError("Failed to submit your response. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <AlertCircle className="w-12 h-12 text-amber-400 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Link unavailable</h1>
        <p className="text-muted-foreground mb-6">{error}</p>
        <Link href="/">
          <Button variant="outline" className="border-white/20 text-white hover:bg-white/5">Go to Pillar.app</Button>
        </Link>
      </div>
    );
  }

  if (submitted) {
    const chosen = VOTE_OPTIONS.find(v => v.value === selectedVote);
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="max-w-md w-full">
          <div className={`w-16 h-16 rounded-2xl ${chosen?.bg} border ${chosen?.border} flex items-center justify-center mx-auto mb-6 ${chosen?.color}`}>
            {chosen?.icon}
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Response recorded</h1>
          <p className="text-muted-foreground mb-2">
            Thank you, <strong className="text-white">{voterName}</strong>. Your response has been sent to{" "}
            <strong className="text-white">{link?.orgName ?? "your organization"}</strong>'s administrator.
          </p>
          {selectedVote === "approve" && (
            <p className="text-emerald-400 text-sm mt-4 font-medium">Excited to see {link?.orgName ?? "your organization"} on Pillar!</p>
          )}
          {comment && (
            <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10 text-left">
              <p className="text-xs text-muted-foreground mb-1">Your comment</p>
              <p className="text-sm text-slate-300">"{comment}"</p>
            </div>
          )}
          <div className="mt-8">
            <Link href="/">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/5">
                Learn more about Pillar
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  const orgName = link?.orgName ?? "Your Organization";

  return (
    <div className="min-h-screen bg-background text-white">
      {/* Header */}
      <header className="border-b border-white/10 py-4 px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg text-white">Pillar</span>
          </Link>
          <span className="text-xs text-muted-foreground">Board Approval Request</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-16">

        {/* Intro */}
        <motion.section initial="hidden" animate="visible" variants={fadeUp} className="text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-5">
            Review request from {orgName}
          </span>
          <h1 className="text-4xl font-bold mb-4">Should {orgName} use Pillar?</h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto leading-relaxed">
            Your organization's leadership is evaluating Pillar — an AI platform that builds and maintains your
            digital presence automatically. Review the information below and cast your vote.
          </p>
          {link?.message && (
            <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/20 text-left max-w-xl mx-auto">
              <p className="text-xs text-primary font-semibold mb-1">Message from your administrator</p>
              <p className="text-sm text-slate-300 leading-relaxed italic">"{link.message}"</p>
            </div>
          )}
        </motion.section>

        {/* What is Pillar */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <h2 className="text-2xl font-bold mb-6">What does Pillar do?</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex gap-4 p-5 rounded-2xl border border-white/10 bg-white/[0.03]">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {f.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1 text-sm">{f.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Cost comparison */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <h2 className="text-2xl font-bold mb-6">The cost case</h2>
          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-3 bg-white/5 px-5 py-3 text-xs font-semibold text-muted-foreground">
              <span>What you need</span>
              <span className="text-center">Typical cost</span>
              <span className="text-center text-primary">With Pillar</span>
            </div>
            {[
              ["Professional website", "$2,000 – $5,000 setup", "Included"],
              ["Monthly website updates", "$200 – $500/mo", "Included"],
              ["Social media management", "$500 – $2,000/mo", "Included"],
              ["Event ticketing platform", "$50 – $300/mo", "Included"],
              ["Custom domain + hosting", "$100 – $200/yr", "Included"],
            ].map(([task, without, withPillar], i) => (
              <div key={i} className={`grid grid-cols-3 px-5 py-3 text-sm border-t border-white/5 ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}>
                <span className="text-slate-300">{task}</span>
                <span className="text-center text-red-400/80 text-xs">{without}</span>
                <span className="text-center text-emerald-400 font-medium text-xs">{withPillar}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Starting at <span className="text-white font-semibold">$59/month</span> · Replaces $30,000+/year in agency costs
          </p>
        </motion.section>

        {/* Vote */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <h2 className="text-2xl font-bold mb-2">Cast your vote</h2>
          <p className="text-muted-foreground text-sm mb-6">Your response goes directly to {orgName}'s administrator.</p>

          <div className="space-y-3 mb-6">
            {VOTE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelectedVote(opt.value)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                  selectedVote === opt.value
                    ? `${opt.bg} ${opt.border} ${opt.color}`
                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/5"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${selectedVote === opt.value ? opt.bg : "bg-white/10"}`}>
                  {opt.icon}
                </div>
                <div>
                  <p className="font-semibold text-sm">{opt.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{opt.sublabel}</p>
                </div>
                {selectedVote === opt.value && <CheckCircle2 className="w-5 h-5 ml-auto flex-shrink-0" />}
              </button>
            ))}
          </div>

          {selectedVote && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
              <h3 className="font-semibold text-white text-sm">Your information</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Your name <span className="text-red-400">*</span></label>
                  <Input
                    value={voterName}
                    onChange={e => setVoterName(e.target.value)}
                    placeholder="Jane Smith"
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Email (optional)</label>
                  <Input
                    type="email"
                    value={voterEmail}
                    onChange={e => setVoterEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Comment or question (optional)</label>
                <Textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder={
                    selectedVote === "approve" ? "Any specific features or timing notes for the administrator..." :
                    selectedVote === "question" ? "What would you like to know more about?" :
                    "What concerns or alternatives should the board consider?"
                  }
                  rows={3}
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none"
                />
              </div>
              <Button
                onClick={handleSubmit}
                disabled={!voterName.trim() || submitting}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Submit my response <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>
          )}
        </motion.section>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pb-8">
          Powered by <Link href="/" className="text-primary hover:underline">Pillar</Link> — AI for civic organizations.
          Your response is shared only with {orgName}'s administrator.
        </div>
      </main>
    </div>
  );
}
