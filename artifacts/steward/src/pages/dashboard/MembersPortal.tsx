import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Sparkles, Save, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { csrfHeaders } from "@/lib/api";

type PortalSection = {
  type: string;
  title?: string;
  body?: string;
  amountText?: string;
  payUrl?: string | null;
  notices?: Array<{ date?: string; title?: string; body?: string }>;
  cadence?: string;
  location?: string;
  upcoming?: Array<{ date?: string; note?: string }>;
  committees?: Array<{ name?: string; description?: string; contact?: string }>;
  documents?: Array<{ name?: string; url?: string; description?: string; category?: string }>;
  [key: string]: unknown;
};

type AvailableSection = {
  type: string;
  label: string;
  description: string;
  example: PortalSection;
};

type PortalResponse = {
  sections: PortalSection[];
  provisionedAt: string | null;
  available: AvailableSection[];
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...csrfHeaders(method), ...(init?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export default function MembersPortal() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<PortalResponse>({
    queryKey: ["/api/members-portal"],
    queryFn: () => apiJson<PortalResponse>("/api/members-portal"),
  });

  const [draft, setDraft] = useState<PortalSection[]>([]);
  const [dirty, setDirty] = useState(false);
  const [addType, setAddType] = useState<string>("");

  useEffect(() => {
    if (data?.sections) {
      setDraft(data.sections);
      setDirty(false);
    }
  }, [data?.sections]);

  const save = useMutation({
    mutationFn: (sections: PortalSection[]) =>
      apiJson<PortalResponse>("/api/members-portal", {
        method: "PATCH",
        body: JSON.stringify({ sections }),
      }),
    onSuccess: (resp) => {
      qc.setQueryData(["/api/members-portal"], (prev: PortalResponse | undefined) =>
        prev ? { ...prev, sections: resp.sections, provisionedAt: resp.provisionedAt } : prev,
      );
      setDirty(false);
      toast.success("Portal saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const aiSuggest = useMutation({
    mutationFn: () =>
      apiJson<{ suggestions: PortalSection[] }>("/api/members-portal/ai-suggest", { method: "POST" }),
    onSuccess: (resp) => {
      if (!resp.suggestions?.length) {
        toast.info("No new suggestions right now.");
        return;
      }
      setDraft((prev) => [...prev, ...resp.suggestions]);
      setDirty(true);
      toast.success(`Added ${resp.suggestions.length} suggested section${resp.suggestions.length === 1 ? "" : "s"} — review and save.`);
    },
    onError: (e: any) => toast.error(e.message ?? "AI suggestion failed"),
  });

  const usedTypes = useMemo(() => new Set(draft.map((s) => s.type)), [draft]);
  const addable = useMemo(
    () => (data?.available ?? []).filter((s) => !usedTypes.has(s.type)),
    [data?.available, usedTypes],
  );

  function move(idx: number, dir: -1 | 1) {
    const next = [...draft];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setDraft(next);
    setDirty(true);
  }
  function remove(idx: number) {
    setDraft(draft.filter((_, i) => i !== idx));
    setDirty(true);
  }
  function update(idx: number, patch: Partial<PortalSection>) {
    setDraft(draft.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    setDirty(true);
  }
  function addSection() {
    if (!addType) return;
    const def = data?.available.find((a) => a.type === addType);
    if (!def) return;
    setDraft([...draft, JSON.parse(JSON.stringify(def.example))]);
    setAddType("");
    setDirty(true);
  }

  if (isLoading) return <div className="p-8 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Members Portal</h1>
          <p className="text-sm text-slate-500 mt-1">
            What logged-in members see at <code className="text-xs bg-slate-100 px-1 rounded">/members</code>.
            Reorder, edit, add, or remove sections — these power your private members area.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => aiSuggest.mutate()} disabled={aiSuggest.isPending}>
            <Sparkles className="w-4 h-4 mr-1.5" />
            {aiSuggest.isPending ? "Finding sections…" : "Suggest sections"}
          </Button>
          <Button onClick={() => save.mutate(draft)} disabled={!dirty || save.isPending}>
            <Save className="w-4 h-4 mr-1.5" />
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </header>

      {dirty && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-900">
          You have unsaved changes.
        </div>
      )}

      <div className="space-y-4">
        {draft.length === 0 && (
          <Card className="p-12 text-center text-sm text-slate-500">
            No portal sections yet. Add one below or click "Suggest sections".
          </Card>
        )}
        {draft.map((section, idx) => (
          <SectionEditor
            key={`${section.type}-${idx}`}
            section={section}
            onChange={(patch) => update(idx, patch)}
            onRemove={() => remove(idx)}
            onMoveUp={() => move(idx, -1)}
            onMoveDown={() => move(idx, 1)}
            canMoveUp={idx > 0}
            canMoveDown={idx < draft.length - 1}
            label={data?.available.find((a) => a.type === section.type)?.label ?? section.type}
          />
        ))}
      </div>

      <Card className="p-5">
        <Label className="text-sm font-semibold text-slate-700">Add a section</Label>
        <div className="flex gap-2 mt-3">
          <Select value={addType} onValueChange={setAddType}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder={addable.length ? "Choose a section type…" : "All section types added"} />
            </SelectTrigger>
            <SelectContent>
              {addable.map((a) => (
                <SelectItem key={a.type} value={a.type}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addSection} disabled={!addType}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add
          </Button>
        </div>
        {addType && (
          <p className="text-xs text-slate-500 mt-2">
            {data?.available.find((a) => a.type === addType)?.description}
          </p>
        )}
      </Card>
    </div>
  );
}

function SectionEditor({
  section,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  label,
}: {
  section: PortalSection;
  onChange: (patch: Partial<PortalSection>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  label: string;
}) {
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge variant="outline" className="font-mono text-[10px] uppercase">{section.type}</Badge>
          <div className="text-xs text-slate-500 mt-1">{label}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onMoveUp} disabled={!canMoveUp} title="Move up">
            <ArrowUp className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onMoveDown} disabled={!canMoveDown} title="Move down">
            <ArrowDown className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRemove} title="Remove">
            <Trash2 className="w-4 h-4 text-red-600" />
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-xs text-slate-600">Title</Label>
        <Input
          value={section.title ?? ""}
          onChange={(e) => onChange({ title: e.target.value })}
          className="mt-1"
        />
      </div>

      {(section.type === "welcome_message" || section.type === "dues_info") && (
        <div>
          <Label className="text-xs text-slate-600">Body</Label>
          <Textarea
            value={section.body ?? ""}
            onChange={(e) => onChange({ body: e.target.value })}
            rows={4}
            className="mt-1"
          />
        </div>
      )}

      {section.type === "dues_info" && (
        <>
          <div>
            <Label className="text-xs text-slate-600">Amount text (e.g. "$120 / year")</Label>
            <Input
              value={section.amountText ?? ""}
              onChange={(e) => onChange({ amountText: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Pay URL (optional)</Label>
            <Input
              value={section.payUrl ?? ""}
              onChange={(e) => onChange({ payUrl: e.target.value || null })}
              className="mt-1"
              placeholder="https://…"
            />
          </div>
        </>
      )}

      {section.type === "meeting_schedule" && (
        <>
          <div>
            <Label className="text-xs text-slate-600">Cadence (e.g. "Second Thursday, 7 PM")</Label>
            <Input
              value={section.cadence ?? ""}
              onChange={(e) => onChange({ cadence: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Location</Label>
            <Input
              value={section.location ?? ""}
              onChange={(e) => onChange({ location: e.target.value })}
              className="mt-1"
            />
          </div>
        </>
      )}

      {(section.type === "notices" ||
        section.type === "committee_signups" ||
        section.type === "documents" ||
        section.type === "meeting_schedule") && (
        <ListEditor
          section={section}
          listKey={
            section.type === "notices"
              ? "notices"
              : section.type === "committee_signups"
              ? "committees"
              : section.type === "documents"
              ? "documents"
              : "upcoming"
          }
          fields={
            section.type === "notices"
              ? [
                  { key: "date", label: "Date" },
                  { key: "title", label: "Title" },
                  { key: "body", label: "Body", multiline: true },
                ]
              : section.type === "committee_signups"
              ? [
                  { key: "name", label: "Name" },
                  { key: "description", label: "Description", multiline: true },
                  { key: "contact", label: "Contact email" },
                ]
              : section.type === "documents"
              ? [
                  { key: "name", label: "Name" },
                  { key: "url", label: "URL" },
                  { key: "description", label: "Description" },
                  { key: "category", label: "Category" },
                ]
              : [
                  { key: "date", label: "Date" },
                  { key: "note", label: "Note" },
                ]
          }
          onChange={(items) => onChange({ [getListKey(section.type)]: items } as Partial<PortalSection>)}
        />
      )}

      {section.type === "member_roster" && (
        <p className="text-xs text-slate-500 italic">
          The member roster is rendered live from your members list — no manual data entry.
          Members who opt out of the directory are hidden.
        </p>
      )}
    </Card>
  );
}

function getListKey(type: string): string {
  if (type === "notices") return "notices";
  if (type === "committee_signups") return "committees";
  if (type === "documents") return "documents";
  if (type === "meeting_schedule") return "upcoming";
  return "items";
}

type ListField = { key: string; label: string; multiline?: boolean };

function ListEditor({
  section,
  listKey,
  fields,
  onChange,
}: {
  section: PortalSection;
  listKey: string;
  fields: ListField[];
  onChange: (items: Array<Record<string, string>>) => void;
}) {
  const items = (section as Record<string, unknown>)[listKey] as Array<Record<string, string>> | undefined;
  const list = Array.isArray(items) ? items : [];

  function update(i: number, patch: Record<string, string>) {
    onChange(list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function remove(i: number) {
    onChange(list.filter((_, idx) => idx !== i));
  }
  function add() {
    const blank: Record<string, string> = {};
    for (const f of fields) blank[f.key] = "";
    onChange([...list, blank]);
  }

  return (
    <div className="space-y-3 pt-2 border-t border-slate-100">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Items</Label>
        <Button variant="ghost" size="sm" onClick={add}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>
      {list.length === 0 && <p className="text-xs text-slate-400 italic">No items yet.</p>}
      {list.map((item, i) => (
        <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/50">
          <div className="flex justify-end">
            <Button variant="ghost" size="icon" onClick={() => remove(i)} className="h-7 w-7">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
          {fields.map((f) =>
            f.multiline ? (
              <div key={f.key}>
                <Label className="text-xs text-slate-600">{f.label}</Label>
                <Textarea
                  value={item[f.key] ?? ""}
                  onChange={(e) => update(i, { [f.key]: e.target.value })}
                  rows={3}
                  className="mt-1 bg-white"
                />
              </div>
            ) : (
              <div key={f.key}>
                <Label className="text-xs text-slate-600">{f.label}</Label>
                <Input
                  value={item[f.key] ?? ""}
                  onChange={(e) => update(i, { [f.key]: e.target.value })}
                  className="mt-1 bg-white"
                />
              </div>
            ),
          )}
        </div>
      ))}
    </div>
  );
}
