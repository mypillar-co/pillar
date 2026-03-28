import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, Copy, Check, ChevronRight, Loader2, Lock,
  ArrowLeft, Zap, FileText, History, Package, Clock, Trash2,
  Search, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useGetSubscription } from "@workspace/api-client-react";

// ── Types ────────────────────────────────────────────────────────────────────

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
  timeSaved: string;
  inputs: TaskInput[];
}

interface Pack {
  id: string;
  label: string;
  description: string;
  emoji: string;
  timeSaved: string;
  includes: string[];
  inputs: TaskInput[];
}

interface HistoryItem {
  id: string;
  taskId: string;
  taskLabel: string;
  category: string;
  inputSummary: string | null;
  output: string;
  packId: string | null;
  createdAt: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchTasks(): Promise<{ tasks: Task[] }> {
  const res = await fetch("/api/content/tasks", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load tasks");
  return res.json();
}

async function fetchPacks(): Promise<{ packs: Pack[] }> {
  const res = await fetch("/api/content/packs", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load packs");
  return res.json();
}

async function fetchHistory(): Promise<{ outputs: HistoryItem[] }> {
  const res = await fetch("/api/content/history", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load history");
  return res.json();
}

async function generateContent(taskId: string, inputs: Record<string, string>) {
  const res = await fetch("/api/content/generate", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, inputs }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Generation failed");
  return data as { content: string; used: number; limit: number };
}

async function generatePack(packId: string, inputs: Record<string, string>) {
  const res = await fetch("/api/content/pack", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packId, inputs }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Pack generation failed");
  return data as { results: { taskId: string; label: string; content: string }[]; used: number; limit: number };
}

async function deleteHistoryItem(id: string) {
  const res = await fetch(`/api/content/history/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Delete failed");
}

// ── Category meta ─────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  communications: { label: "Communications", color: "text-blue-300",    bg: "bg-blue-500/10 border-blue-500/20" },
  events:         { label: "Events",          color: "text-amber-300",   bg: "bg-amber-500/10 border-amber-500/20" },
  social:         { label: "Social Media",    color: "text-pink-300",    bg: "bg-pink-500/10 border-pink-500/20" },
  admin:          { label: "Administration",  color: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20" },
  repurposing:    { label: "Repurposing",     color: "text-violet-300",  bg: "bg-violet-500/10 border-violet-500/20" },
};

const CATEGORY_ORDER = ["communications", "events", "social", "admin", "repurposing"];

// ── Shared form inputs ────────────────────────────────────────────────────────

function FormInputs({
  inputs,
  values,
  onChange,
}: {
  inputs: TaskInput[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <>
      {inputs.map(inp => (
        <div key={inp.key} className="space-y-1.5">
          <Label className="text-slate-300 text-sm">{inp.label}</Label>
          {inp.multiline ? (
            <Textarea
              value={values[inp.key] ?? ""}
              onChange={e => onChange(inp.key, e.target.value)}
              placeholder={inp.placeholder}
              rows={4}
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 resize-none text-sm"
            />
          ) : (
            <Input
              value={values[inp.key] ?? ""}
              onChange={e => onChange(inp.key, e.target.value)}
              placeholder={inp.placeholder}
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 text-sm"
            />
          )}
        </div>
      ))}
    </>
  );
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text, size = "sm" }: { text: string; size?: "sm" | "xs" }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Copied to clipboard");
    });
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handle}
      className={`${size === "xs" ? "h-6 text-xs px-1.5" : "h-7 text-xs px-2"} text-slate-400 hover:text-white`}
    >
      {copied
        ? <><Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Copied</>
        : <><Copy className="w-3.5 h-3.5 mr-1" /> Copy</>
      }
    </Button>
  );
}

// ── OutputPanel ───────────────────────────────────────────────────────────────

function OutputPanel({ label, content, loading }: { label?: string; content: string; loading?: boolean }) {
  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
          {content && <CopyButton text={content} />}
        </div>
      )}
      <div className="min-h-[180px] rounded-xl border border-white/8 bg-white/3 p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <p className="text-xs text-slate-500">Writing…</p>
          </div>
        ) : content ? (
          <pre className="text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">{content}</pre>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-600">
            <FileText className="w-6 h-6 opacity-30" />
            <p className="text-xs">Output will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onClick, locked }: { task: Task; onClick: () => void; locked: boolean }) {
  const meta = CATEGORY_META[task.category];
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className="text-left w-full p-4 rounded-xl border border-white/8 bg-card/40 hover:bg-card/70 hover:border-primary/30 transition-all group disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5">{task.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-semibold text-white group-hover:text-primary transition-colors">{task.label}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-primary transition-colors flex-shrink-0" />
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-2">{task.description}</p>
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400/80">
            <Clock className="w-3 h-3" /> Saves {task.timeSaved}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Task Workspace ────────────────────────────────────────────────────────────

function TaskWorkspace({ task, onBack }: { task: Task; onBack: () => void }) {
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(task.inputs.map(i => [i.key, ""]))
  );
  const [output, setOutput] = useState("");
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => generateContent(task.id, inputs),
    onSuccess: (data) => {
      setOutput(data.content);
      setUsage({ used: data.used, limit: data.limit });
      queryClient.invalidateQueries({ queryKey: ["content-history"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isValid = task.inputs
    .filter(i => !i.label.toLowerCase().includes("optional"))
    .every(i => inputs[i.key]?.trim());

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-400 hover:text-white h-8 px-2 -ml-2">
        <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
      </Button>

      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none">{task.emoji}</span>
        <div>
          <h2 className="text-lg font-bold text-white">{task.label}</h2>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-sm text-slate-400">{task.description}</p>
            <span className="text-xs text-emerald-400/80 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Saves {task.timeSaved}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inputs</h3>
          <FormInputs inputs={task.inputs} values={inputs} onChange={(k, v) => setInputs(p => ({ ...p, [k]: v }))} />
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !isValid}
            className="w-full bg-primary hover:bg-primary/90"
          >
            {mutation.isPending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
              : <><Sparkles className="w-4 h-4 mr-2" /> Generate</>
            }
          </Button>
          {usage && (
            <p className="text-xs text-slate-500 text-center">{usage.used} / {usage.limit} AI tasks used this month</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Output</h3>
            {output && <CopyButton text={output} />}
          </div>
          <OutputPanel content={output} loading={mutation.isPending} />
        </div>
      </div>
    </div>
  );
}

// ── Pack Card ─────────────────────────────────────────────────────────────────

function PackCard({ pack, onClick, locked }: { pack: Pack; onClick: () => void; locked: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className="text-left w-full p-5 rounded-xl border border-white/8 bg-card/40 hover:bg-card/70 hover:border-primary/30 transition-all group disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl leading-none">{pack.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">{pack.label}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-primary flex-shrink-0" />
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{pack.description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {pack.includes.map(item => (
          <span key={item} className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400">{item}</span>
        ))}
      </div>
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400/80">
        <Clock className="w-3 h-3" /> Saves {pack.timeSaved}
      </span>
    </button>
  );
}

// ── Pack Workspace ─────────────────────────────────────────────────────────────

function PackWorkspace({ pack, onBack }: { pack: Pack; onBack: () => void }) {
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(pack.inputs.map(i => [i.key, ""]))
  );
  const [results, setResults] = useState<{ taskId: string; label: string; content: string }[]>([]);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => generatePack(pack.id, inputs),
    onSuccess: (data) => {
      setResults(data.results);
      setUsage({ used: data.used, limit: data.limit });
      queryClient.invalidateQueries({ queryKey: ["content-history"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isValid = pack.inputs
    .filter(i => !i.label.toLowerCase().includes("optional"))
    .every(i => inputs[i.key]?.trim());

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-400 hover:text-white h-8 px-2 -ml-2">
        <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
      </Button>

      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none">{pack.emoji}</span>
        <div>
          <h2 className="text-lg font-bold text-white">{pack.label}</h2>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <p className="text-sm text-slate-400">{pack.description}</p>
            <span className="text-xs text-emerald-400/80 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Saves {pack.timeSaved}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {pack.includes.map(item => (
              <span key={item} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary/80">{item}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fill in Once, Get Everything</h3>
          <FormInputs inputs={pack.inputs} values={inputs} onChange={(k, v) => setInputs(p => ({ ...p, [k]: v }))} />
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !isValid}
            className="w-full bg-primary hover:bg-primary/90"
          >
            {mutation.isPending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating {pack.includes.length} pieces…</>
              : <><Sparkles className="w-4 h-4 mr-2" /> Generate All {pack.includes.length} Pieces</>
            }
          </Button>
          {usage && (
            <p className="text-xs text-slate-500 text-center">{usage.used} / {usage.limit} AI tasks used this month</p>
          )}
        </div>

        {/* Outputs */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Generated Outputs</h3>
          {mutation.isPending ? (
            pack.includes.map(label => (
              <OutputPanel key={label} label={label} content="" loading />
            ))
          ) : results.length > 0 ? (
            results.map(r => (
              <OutputPanel key={r.taskId} label={r.label} content={r.content} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-600 border border-white/8 rounded-xl">
              <Package className="w-8 h-8 opacity-20" />
              <p className="text-sm">Your {pack.includes.length} outputs will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── History Item ───────────────────────────────────────────────────────────────

function HistoryRow({ item, onDelete }: { item: HistoryItem; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_META[item.category] ?? CATEGORY_META["communications"];
  const timeAgo = formatDistanceToNow(new Date(item.createdAt), { addSuffix: true });

  return (
    <div className="rounded-xl border border-white/8 bg-card/30 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color}`}>
              {item.taskLabel}
            </span>
            {item.packId && (
              <span className="text-xs text-slate-600 flex items-center gap-1"><Package className="w-3 h-3" /> Pack</span>
            )}
          </div>
          {item.inputSummary && (
            <p className="text-xs text-slate-500 mt-1 truncate">{item.inputSummary}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-slate-600">{timeAgo}</span>
          <CopyButton text={item.output} size="xs" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(e => !e)}
            className="h-6 w-6 p-0 text-slate-600 hover:text-slate-300"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(item.id)}
            className="h-6 w-6 p-0 text-slate-600 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5">
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed mt-3">{item.output}</pre>
        </div>
      )}
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function TasksTab({ tasks, isLocked }: { tasks: Task[]; isLocked: boolean }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const grouped = CATEGORY_ORDER.reduce<Record<string, Task[]>>((acc, cat) => {
    acc[cat] = tasks.filter(t => t.category === cat);
    return acc;
  }, {});

  const displayTasks = activeCategory ? tasks.filter(t => t.category === activeCategory) : tasks;

  if (selectedTask) {
    return <TaskWorkspace task={selectedTask} onBack={() => setSelectedTask(null)} />;
  }

  return (
    <div className="space-y-5">
      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${activeCategory === null ? "bg-primary/20 text-primary border-primary/30" : "border-white/10 text-slate-400 hover:text-white"}`}
        >
          All ({tasks.length})
        </button>
        {CATEGORY_ORDER.map(cat => {
          const meta = CATEGORY_META[cat];
          const count = grouped[cat]?.length ?? 0;
          if (!count) return null;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${activeCategory === cat ? `${meta.bg} ${meta.color}` : "border-white/10 text-slate-400 hover:text-white"}`}
            >
              {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Task grid */}
      {activeCategory ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayTasks.map(task => (
            <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} locked={isLocked} />
          ))}
        </div>
      ) : (
        <div className="space-y-7">
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
                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} locked={isLocked} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PacksTab({ isLocked }: { isLocked: boolean }) {
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["content-packs"], queryFn: fetchPacks });
  const packs = data?.packs ?? [];

  if (selectedPack) {
    return <PackWorkspace pack={selectedPack} onBack={() => setSelectedPack(null)} />;
  }

  return (
    <div className="space-y-5">
      <div className="px-4 py-3 bg-primary/5 border border-primary/15 rounded-xl">
        <p className="text-sm text-slate-300">
          <span className="font-semibold text-primary">Packs</span> generate multiple related pieces of content in a single step — just fill in shared details once.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packs.map(pack => (
            <PackCard key={pack.id} pack={pack} onClick={() => setSelectedPack(pack)} locked={isLocked} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryTab() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["content-history"], queryFn: fetchHistory });
  const allOutputs = data?.outputs ?? [];

  const deleteMutation = useMutation({
    mutationFn: deleteHistoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-history"] });
      toast.success("Deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const filtered = search.trim()
    ? allOutputs.filter(o =>
        o.taskLabel.toLowerCase().includes(search.toLowerCase()) ||
        o.inputSummary?.toLowerCase().includes(search.toLowerCase()) ||
        o.output.toLowerCase().includes(search.toLowerCase())
      )
    : allOutputs;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search saved content…"
          className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-600"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-600">
          <History className="w-10 h-10 opacity-20" />
          <p className="text-sm">{search ? "No results found" : "No saved content yet — generate something to see it here"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <HistoryRow key={item.id} item={item} onDelete={id => deleteMutation.mutate(id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "tasks" | "packs" | "history";

export default function ContentStudio() {
  const [tab, setTab] = useState<Tab>("tasks");

  const { data: subscriptionData } = useGetSubscription();
  const tier = subscriptionData?.tierId ?? null;
  const isLocked = tier === null || tier === "tier0";

  const { data, isLoading } = useQuery({ queryKey: ["content-tasks"], queryFn: fetchTasks });
  const tasks = data?.tasks ?? [];

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "tasks",   label: "Tasks",   icon: Sparkles },
    { id: "packs",   label: "Packs",   icon: Package },
    { id: "history", label: "History", icon: History },
  ];

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
            <p className="text-sm text-slate-400">Purpose-built AI for your organization</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{tasks.length} tasks</span>
          <span>·</span>
          <span>3 packs</span>
        </div>
      </div>

      {isLocked && (
        <div className="flex items-start gap-3 px-5 py-4 bg-amber-500/8 border border-amber-500/20 rounded-xl mb-6">
          <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">Starter plan required</p>
            <p className="text-xs text-amber-400/70 mt-0.5">Content Studio is available on any paid plan. Upgrade to unlock all tasks and packs.</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl mb-6 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {isLoading && tab === "tasks" ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : tab === "tasks" ? (
        <TasksTab tasks={tasks} isLocked={isLocked} />
      ) : tab === "packs" ? (
        <PacksTab isLocked={isLocked} />
      ) : (
        <HistoryTab />
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 mt-8 pt-6 border-t border-white/5">
        <Zap className="w-3.5 h-3.5 text-primary/60" />
        <p className="text-xs text-slate-600">All content uses your organization's name and context. Each task counts toward your monthly AI usage.</p>
      </div>
    </div>
  );
}
