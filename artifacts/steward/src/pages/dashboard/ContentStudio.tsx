import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Sparkles, Copy, Check, ChevronRight, Loader2, Lock,
  ArrowLeft, Zap, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useGetSubscription } from "@workspace/api-client-react";

// ── Types ──────────────────────────────────────────────────────────────────
interface TaskInput {
  key: string;
  label: string;
  placeholder: string;
  multiline: boolean;
}

interface Task {
  id: string;
  label: string;
  description: string;
  category: string;
  emoji: string;
  inputs: TaskInput[];
}

// ── API helpers ────────────────────────────────────────────────────────────
async function fetchTasks(): Promise<{ tasks: Task[] }> {
  const res = await fetch("/api/content/tasks", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load tasks");
  return res.json();
}

async function generateContent(taskId: string, inputs: Record<string, string>) {
  const res = await fetch("/api/content/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, inputs }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Generation failed");
  return data as { content: string; used: number; limit: number; remaining: number };
}

// ── Category meta ──────────────────────────────────────────────────────────
const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  communications: { label: "Communications", color: "text-blue-300", bg: "bg-blue-500/10 border-blue-500/20" },
  events:         { label: "Events",          color: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/20" },
  social:         { label: "Social Media",    color: "text-pink-300",  bg: "bg-pink-500/10 border-pink-500/20" },
  admin:          { label: "Administration",  color: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20" },
};

const CATEGORY_ORDER = ["communications", "events", "social", "admin"];

// ── Task Card ──────────────────────────────────────────────────────────────
function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const meta = CATEGORY_META[task.category];
  return (
    <button
      onClick={onClick}
      className="text-left w-full p-4 rounded-xl border border-white/8 bg-card/40 hover:bg-card/70 hover:border-primary/30 transition-all group"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5">{task.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-semibold text-white group-hover:text-primary transition-colors">{task.label}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-primary transition-colors flex-shrink-0" />
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">{task.description}</p>
        </div>
      </div>
    </button>
  );
}

// ── Task Workspace ─────────────────────────────────────────────────────────
function TaskWorkspace({
  task,
  onBack,
}: {
  task: Task;
  onBack: () => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(task.inputs.map(i => [i.key, ""]))
  );
  const [output, setOutput] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);

  const mutation = useMutation({
    mutationFn: () => generateContent(task.id, inputs),
    onSuccess: (data) => {
      setOutput(data.content);
      setUsage({ used: data.used, limit: data.limit });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Copied to clipboard");
    });
  };

  const isValid = task.inputs
    .filter(i => !i.label.toLowerCase().includes("optional"))
    .every(i => inputs[i.key]?.trim());

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-400 hover:text-white h-8 px-2 -ml-2">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
      </div>

      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none">{task.emoji}</span>
        <div>
          <h2 className="text-lg font-bold text-white">{task.label}</h2>
          <p className="text-sm text-slate-400">{task.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inputs</h3>
          {task.inputs.map(inp => (
            <div key={inp.key} className="space-y-1.5">
              <Label className="text-slate-300 text-sm">{inp.label}</Label>
              {inp.multiline ? (
                <Textarea
                  value={inputs[inp.key] ?? ""}
                  onChange={e => setInputs(prev => ({ ...prev, [inp.key]: e.target.value }))}
                  placeholder={inp.placeholder}
                  rows={4}
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 resize-none text-sm"
                />
              ) : (
                <Input
                  value={inputs[inp.key] ?? ""}
                  onChange={e => setInputs(prev => ({ ...prev, [inp.key]: e.target.value }))}
                  placeholder={inp.placeholder}
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 text-sm"
                />
              )}
            </div>
          ))}

          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !isValid}
            className="w-full bg-primary hover:bg-primary/90 mt-2"
          >
            {mutation.isPending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
              : <><Sparkles className="w-4 h-4 mr-2" /> Generate</>
            }
          </Button>

          {usage && (
            <p className="text-xs text-slate-500 text-center">{usage.used} / {usage.limit} tasks used this month</p>
          )}
        </div>

        {/* Output */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Output</h3>
            {output && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7 text-xs text-slate-400 hover:text-white px-2"
              >
                {copied ? <><Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Copied</> : <><Copy className="w-3.5 h-3.5 mr-1" /> Copy</>}
              </Button>
            )}
          </div>
          <div className="min-h-[240px] rounded-xl border border-white/8 bg-white/3 p-4">
            {mutation.isPending ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm text-slate-500">Writing your content…</p>
              </div>
            ) : output ? (
              <pre className="text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">{output}</pre>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-600">
                <FileText className="w-8 h-8 opacity-30" />
                <p className="text-sm">Your generated content will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function ContentStudio() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: subscriptionData } = useGetSubscription();
  const tier = subscriptionData?.tierId ?? null;
  const isLocked = tier === null || tier === "tier0";

  const { data, isLoading } = useQuery({
    queryKey: ["content-tasks"],
    queryFn: fetchTasks,
  });

  const tasks = data?.tasks ?? [];

  const grouped = CATEGORY_ORDER.reduce<Record<string, Task[]>>((acc, cat) => {
    acc[cat] = tasks.filter(t => t.category === cat);
    return acc;
  }, {});

  const displayTasks = activeCategory
    ? tasks.filter(t => t.category === activeCategory)
    : tasks;

  if (selectedTask) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <TaskWorkspace task={selectedTask} onBack={() => setSelectedTask(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/15 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Content Studio</h1>
            <p className="text-sm text-slate-400">Purpose-built AI tasks for your organization</p>
          </div>
        </div>
        <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
          {tasks.length} tasks
        </Badge>
      </div>

      {isLocked && (
        <div className="flex items-start gap-3 px-5 py-4 bg-amber-500/8 border border-amber-500/20 rounded-xl mb-6">
          <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">Starter plan required</p>
            <p className="text-xs text-amber-400/70 mt-0.5">Content Studio is available on any paid plan. Upgrade to unlock all 15 tasks.</p>
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            activeCategory === null
              ? "bg-primary/20 text-primary border-primary/30"
              : "border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
          }`}
        >
          All ({tasks.length})
        </button>
        {CATEGORY_ORDER.map(cat => {
          const meta = CATEGORY_META[cat];
          const count = grouped[cat]?.length ?? 0;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                activeCategory === cat
                  ? `${meta.bg} ${meta.color}`
                  : "border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
              }`}
            >
              {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Tasks */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : activeCategory ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-4">
            <span className={`text-xs font-semibold uppercase tracking-wider ${CATEGORY_META[activeCategory]?.color}`}>
              {CATEGORY_META[activeCategory]?.label}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={() => !isLocked && setSelectedTask(task)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {CATEGORY_ORDER.map(cat => {
            const catTasks = grouped[cat] ?? [];
            if (!catTasks.length) return null;
            const meta = CATEGORY_META[cat];
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {catTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onClick={() => !isLocked && setSelectedTask(task)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      <div className="flex items-center gap-2 mt-8 pt-6 border-t border-white/5">
        <Zap className="w-3.5 h-3.5 text-primary/60" />
        <p className="text-xs text-slate-600">All generated content reflects your organization's name and context. Each task counts toward your monthly AI usage.</p>
      </div>
    </div>
  );
}
