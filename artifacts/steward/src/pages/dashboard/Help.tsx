import { useState, useRef, useEffect } from "react";
import { Send, Loader2, HelpCircle, Bug, ChevronDown, ChevronRight, MessageSquare, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

type ChatMessage = { role: "user" | "assistant"; content: string };

const FAQ_ITEMS = [
  {
    q: "Why is the Social Media page showing an upgrade gate?",
    a: "Social Media features are available on the Autopilot plan ($59/mo) and above. Go to Billing to upgrade — you'll get a 14-day free trial on any paid plan.",
  },
  {
    q: "How do I connect my Facebook, Instagram, or X account?",
    a: "Go to Social Media → Accounts tab. Click Connect next to each platform. You'll be redirected to authorize Steward. Once authorized, your account will appear as connected.",
  },
  {
    q: "My site isn't showing up publicly. What do I do?",
    a: "Make sure you've clicked Publish Site in the Site Builder. You should see a confirmation message and a public URL. If you have a custom domain, DNS changes can take 24–48 hours.",
  },
  {
    q: "How do I accept payments / sell event tickets?",
    a: "Go to the Payments page and click Connect with Stripe to set up your account. Once connected, ticket sales and donation payments are processed automatically through Stripe.",
  },
  {
    q: "Can I cancel my subscription?",
    a: "Yes — you can cancel anytime with no penalties. Go to Billing and click Manage Billing. This opens your Stripe billing portal where you can cancel or change your plan.",
  },
  {
    q: "What is Board Approval and how does it work?",
    a: "Board Approval lets you generate a unique voting link that you share with board members. They can vote yes/no on items without needing a Steward account. Votes are tallied automatically.",
  },
  {
    q: "How does the 14-day free trial work?",
    a: "When you subscribe to any paid plan, you get 14 days free — no charge upfront. If you cancel before the 14 days are up, you won't be charged at all.",
  },
  {
    q: "How do I add or import contacts?",
    a: "Go to Contacts in the sidebar. You can add contacts manually one by one, or use the import feature to upload a CSV file. Each contact can be tagged, given notes, and linked to events.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "border border-white/10 rounded-xl transition-colors cursor-pointer",
        open ? "bg-white/5" : "bg-white/[0.02] hover:bg-white/[0.04]"
      )}
      onClick={() => setOpen(v => !v)}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <span className="text-sm text-slate-200 font-medium">{q}</span>
        {open
          ? <ChevronDown className="w-4 h-4 text-primary flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
        }
      </div>
      {open && (
        <div className="px-4 pb-4 text-sm text-slate-400 leading-relaxed border-t border-white/10 pt-3">
          {a}
        </div>
      )}
    </div>
  );
}

function AiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! I'm the Steward support assistant. Ask me anything about using the platform — connecting accounts, billing, publishing your site, or anything else." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const history = messages.slice(-6);
      const { reply } = await apiFetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't connect right now. Please try again or submit a bug report below." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-white/10 bg-card/40 flex flex-col h-[480px]">
      <CardHeader className="pb-3 border-b border-white/10 flex-shrink-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          AI Support Chat
        </CardTitle>
        <p className="text-xs text-slate-400">Instant answers about Steward — no waiting</p>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0 p-4 gap-3">
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-2.5", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] text-sm rounded-2xl px-3.5 py-2.5 leading-relaxed",
                  m.role === "user"
                    ? "bg-primary text-black font-medium rounded-br-md"
                    : "bg-white/8 text-slate-200 rounded-bl-md"
                )}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="bg-white/8 rounded-2xl rounded-bl-md px-3.5 py-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Ask anything about Steward..."
            className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 text-sm"
            disabled={loading}
          />
          <Button
            onClick={send}
            disabled={loading || !input.trim()}
            className="bg-primary hover:bg-primary/90 flex-shrink-0"
            size="icon"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BugReportForm() {
  const [form, setForm] = useState({ subject: "", description: "", severity: "normal" });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error("Subject and description are required");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="border-white/10 bg-card/40">
        <CardContent className="py-10 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <h3 className="text-white font-semibold mb-1">Report submitted!</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto mb-4">
            We've received your report. We'll look into it and follow up if we need more information.
          </p>
          <Button variant="ghost" onClick={() => { setSubmitted(false); setForm({ subject: "", description: "", severity: "normal" }); }} className="text-slate-400 hover:text-white text-sm">
            Submit another report
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-white/10 bg-card/40">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base flex items-center gap-2">
          <Bug className="w-4 h-4 text-red-400" />
          Report a Bug or Issue
        </CardTitle>
        <p className="text-xs text-slate-400">Can't figure something out? Something broken? Let us know.</p>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-sm">Subject</Label>
          <Input
            value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            placeholder="Brief description of the issue..."
            className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-sm">Description</Label>
          <Textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="What were you trying to do? What happened instead? Steps to reproduce..."
            rows={5}
            className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-300 text-sm">Severity</Label>
          <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-white/10">
              <SelectItem value="low" className="text-white hover:bg-white/10">Low — minor inconvenience</SelectItem>
              <SelectItem value="normal" className="text-white hover:bg-white/10">Normal — something's broken</SelectItem>
              <SelectItem value="high" className="text-white hover:bg-white/10">High — blocking my work</SelectItem>
              <SelectItem value="critical" className="text-white hover:bg-white/10">Critical — data loss risk</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={submit} disabled={loading} className="bg-primary hover:bg-primary/90 w-full">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
          Submit Report
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Help() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary/15 rounded-xl flex items-center justify-center">
          <HelpCircle className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Help & Support</h1>
          <p className="text-sm text-slate-400">AI-powered answers, FAQs, and a direct line to report issues</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <AiChat />

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-400 leading-relaxed">
              The AI assistant knows Steward inside and out. If it can't resolve your issue, use the form to the right to send us a report — we read every one.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <BugReportForm />

          <Card className="border-white/10 bg-card/40">
            <CardHeader className="pb-3 border-b border-white/10">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                Frequently Asked Questions
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-2">
              {FAQ_ITEMS.map((item, i) => (
                <FaqItem key={i} q={item.q} a={item.a} />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
