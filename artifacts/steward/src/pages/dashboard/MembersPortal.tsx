import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Sparkles, Save, X, Eye, GripVertical } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  useEffect(() => {
    if (data?.sections) {
      setDraft(data.sections);
      setDirty(false);
      setSelectedIndex(0);
    }
  }, [data?.sections]);

  useEffect(() => {
    setSelectedIndex((current) => {
      if (draft.length === 0) return 0;
      return Math.min(current, draft.length - 1);
    });
  }, [draft.length]);

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

  function sectionLabel(section: PortalSection): string {
    return data?.available.find((a) => a.type === section.type)?.label ?? section.type.replace(/_/g, " ");
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...draft];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setDraft(next);
    setSelectedIndex(j);
    setDirty(true);
  }
  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= draft.length || to >= draft.length) return;
    const next = [...draft];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setDraft(next);
    setSelectedIndex(to);
    setDirty(true);
  }
  function remove(idx: number) {
    setDraft(draft.filter((_, i) => i !== idx));
    setSelectedIndex(Math.max(0, Math.min(idx, draft.length - 2)));
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
    setSelectedIndex(draft.length);
    setAddType("");
    setDirty(true);
  }

  if (isLoading) return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  const selected = draft[selectedIndex] ?? draft[0];
  const selectedMeta = selected ? data?.available.find((a) => a.type === selected.type) : null;

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-500 font-semibold">Members workbench</p>
          <h1 className="text-2xl font-bold text-slate-900">Members Portal</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Tune what logged-in members see at <code className="text-xs bg-slate-100 px-1 rounded">/members</code>.
            The roster itself stays managed from Members; this workbench controls the portal sections around it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => aiSuggest.mutate()} disabled={aiSuggest.isPending}>
            <Sparkles className="w-4 h-4 mr-1.5" />
            {aiSuggest.isPending ? "Finding sections…" : "Suggest sections"}
          </Button>
          <Button data-testid="members-portal-save" onClick={() => save.mutate(draft)} disabled={!dirty || save.isPending}>
            <Save className="w-4 h-4 mr-1.5" />
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </header>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        {dirty ? (
          <span>Previewing unsaved draft. Save changes when the portal looks right.</span>
        ) : (
          <span>Showing saved portal. Changes you make here update the preview first.</span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_430px]">
        <Card className="overflow-hidden border-slate-200 bg-slate-950">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2 text-white">
              <Eye className="w-4 h-4 text-amber-300" />
              <span className="text-sm font-semibold">Live portal preview</span>
            </div>
            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-xs text-amber-100">
              {dirty ? "Unsaved draft" : "Saved"}
            </span>
          </div>
          <div className="bg-slate-100 p-4 sm:p-6 min-h-[620px]">
            <PortalPreview sections={draft} selectedIndex={selectedIndex} getLabel={sectionLabel} />
          </div>
        </Card>

        <aside className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Edit portal</p>
            <p className="text-sm font-semibold text-slate-900">Sections</p>
          </div>

          <div className="max-h-[760px] overflow-y-auto p-4 space-y-4">
            <Card className="p-4 border-slate-200">
              <Label className="text-sm font-semibold text-slate-700">Add a section</Label>
              <div className="flex gap-2 mt-3">
                <Select value={addType} onValueChange={setAddType}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={addable.length ? "Choose a section type..." : "All section types added"} />
                  </SelectTrigger>
                  <SelectContent>
                    {addable.map((a) => (
                      <SelectItem key={a.type} value={a.type}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button data-testid="members-portal-add-section" onClick={addSection} disabled={!addType}>
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

            <div className="space-y-2">
              {draft.length === 0 && (
                <Card className="p-8 text-center text-sm text-slate-500">
                  No portal sections yet. Add one above or click "Suggest sections".
                </Card>
              )}
              {draft.map((section, idx) => {
                const label = sectionLabel(section);
                return (
                  <div
                    key={`${section.type}-${idx}`}
                    data-testid={`members-portal-section-row-${section.type}`}
                    draggable
                    onDragStart={(event) => {
                      setDraggingIndex(idx);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("application/x-pillar-portal-section", String(idx));
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDropIndex(idx);
                    }}
                    onDragLeave={() => setDropIndex((current) => current === idx ? null : current)}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = Number(event.dataTransfer.getData("application/x-pillar-portal-section") || draggingIndex);
                      reorder(from, idx);
                      setDraggingIndex(null);
                      setDropIndex(null);
                    }}
                    onDragEnd={() => {
                      setDraggingIndex(null);
                      setDropIndex(null);
                    }}
                    className={`rounded-lg border px-3 py-2 transition-colors ${
                      selectedIndex === idx
                        ? "border-amber-400 bg-amber-50"
                        : dropIndex === idx
                          ? "border-amber-300 bg-amber-50/60"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedIndex(idx)}
                        data-testid={`members-portal-section-select-${section.type}`}
                        className="min-w-0 flex flex-1 items-center gap-2 text-left"
                        aria-label={`Edit ${label}`}
                      >
                        <GripVertical className="w-4 h-4 shrink-0 text-slate-400" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900">{section.title || label}</span>
                          <span className="block truncate text-xs text-slate-500">{label}</span>
                        </span>
                      </button>
                      <Button data-testid={`members-portal-section-move-up-${section.type}`} variant="ghost" size="icon" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={`Move ${label} up`} className="h-8 w-8">
                        <ArrowUp className="w-4 h-4" />
                      </Button>
                      <Button data-testid={`members-portal-section-move-down-${section.type}`} variant="ghost" size="icon" onClick={() => move(idx, 1)} disabled={idx === draft.length - 1} aria-label={`Move ${label} down`} className="h-8 w-8">
                        <ArrowDown className="w-4 h-4" />
                      </Button>
                      <Button data-testid={`members-portal-section-remove-${section.type}`} variant="ghost" size="icon" onClick={() => remove(idx)} aria-label={`Remove ${label}`} className="h-8 w-8 text-red-600 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {selected && (
              <SectionEditor
                section={selected}
                onChange={(patch) => update(selectedIndex, patch)}
                onRemove={() => remove(selectedIndex)}
                onMoveUp={() => move(selectedIndex, -1)}
                onMoveDown={() => move(selectedIndex, 1)}
                canMoveUp={selectedIndex > 0}
                canMoveDown={selectedIndex < draft.length - 1}
                label={selectedMeta?.label ?? selected.type.replace(/_/g, " ")}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function PortalPreview({
  sections,
  selectedIndex,
  getLabel,
}: {
  sections: PortalSection[];
  selectedIndex: number;
  getLabel: (section: PortalSection) => string;
}) {
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-5">
        <p className="text-xs uppercase tracking-wide text-slate-400">Members portal</p>
        <h2 className="mt-1 text-2xl font-serif font-bold text-slate-950">Welcome, member.</h2>
        <p className="mt-1 text-sm text-slate-500">This is a preview of the logged-in portal home.</p>
      </div>
      <div className="space-y-4 p-5">
        {sections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            Add a section to start shaping the members portal.
          </div>
        ) : (
          sections.map((section, index) => (
            <PortalPreviewSection
              key={`${section.type}-${index}`}
              section={section}
              selected={index === selectedIndex}
              label={getLabel(section)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PortalPreviewSection({
  section,
  selected,
  label,
}: {
  section: PortalSection;
  selected: boolean;
  label: string;
}) {
  const shell = (children: ReactNode) => (
    <section
      data-testid={`members-portal-preview-section-${section.type}`}
      aria-label={label}
      className={`rounded-xl border p-5 ${selected ? "border-amber-400 ring-2 ring-amber-100" : "border-slate-200"}`}
    >
      {children}
    </section>
  );
  if (section.type === "welcome_message") {
    return shell(
      <>
        <h3 className="text-xl font-serif font-bold text-slate-950">{section.title || "Welcome, members"}</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{section.body || "Welcome copy appears here."}</p>
      </>,
    );
  }
  if (section.type === "meeting_schedule") {
    return shell(
      <>
        <h3 className="text-lg font-serif font-bold text-slate-950">{section.title || "When we meet"}</h3>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          {section.cadence && <p><span className="font-semibold">Cadence: </span>{section.cadence}</p>}
          {section.location && <p><span className="font-semibold">Location: </span>{section.location}</p>}
          {(section.upcoming?.length ?? 0) > 0 && (
            <div className="pt-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">Upcoming</p>
              {(section.upcoming ?? []).slice(0, 3).map((item, index) => (
                <p key={index} className="mt-1"><span className="font-medium">{item.date}</span>{item.note ? ` - ${item.note}` : ""}</p>
              ))}
            </div>
          )}
        </div>
      </>,
    );
  }
  if (section.type === "dues_info") {
    return shell(
      <>
        <h3 className="text-lg font-serif font-bold text-slate-950">{section.title || "Annual dues"}</h3>
        {section.amountText && <p className="mt-2 text-2xl font-serif font-bold text-slate-950">{section.amountText}</p>}
        {section.body && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{section.body}</p>}
        <button type="button" className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Pay dues</button>
      </>,
    );
  }
  if (section.type === "notices") {
    return shell(
      <>
        <h3 className="text-lg font-serif font-bold text-slate-950">{section.title || "Notices"}</h3>
        <div className="mt-3 space-y-3">
          {(section.notices ?? []).slice(0, 3).map((notice, index) => (
            <div key={index} className="border-l-2 border-amber-400 pl-3">
              {notice.date && <p className="text-xs text-slate-400">{notice.date}</p>}
              <p className="font-medium text-slate-900">{notice.title || "Notice title"}</p>
              {notice.body && <p className="text-sm text-slate-600">{notice.body}</p>}
            </div>
          ))}
          {(section.notices?.length ?? 0) === 0 && <p className="text-sm text-slate-500">No current notices.</p>}
        </div>
      </>,
    );
  }
  if (section.type === "committee_signups") {
    return shell(
      <>
        <h3 className="text-lg font-serif font-bold text-slate-950">{section.title || "Committees"}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(section.committees ?? []).slice(0, 4).map((committee, index) => (
            <div key={index} className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-900">{committee.name || "Committee"}</p>
              {committee.description && <p className="mt-1 text-sm text-slate-600">{committee.description}</p>}
            </div>
          ))}
        </div>
      </>,
    );
  }
  if (section.type === "documents") {
    return shell(
      <>
        <h3 className="text-lg font-serif font-bold text-slate-950">{section.title || "Documents"}</h3>
        <div className="mt-3 space-y-2">
          {(section.documents ?? []).slice(0, 4).map((document, index) => (
            <div key={index} className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-900">{document.name || "Document"}</p>
              {document.description && <p className="text-sm text-slate-500">{document.description}</p>}
            </div>
          ))}
          {(section.documents?.length ?? 0) === 0 && <p className="text-sm text-slate-500">No documents uploaded yet.</p>}
        </div>
      </>,
    );
  }
  if (section.type === "member_roster") {
    return shell(
      <>
        <h3 className="text-lg font-serif font-bold text-slate-950">{section.title || "Member roster"}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {["Alex Member", "Jordan Member", "Taylor Member"].map((name) => (
            <div key={name} className="rounded-lg border border-slate-200 p-3">
              <div className="h-10 w-10 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">{name[0]}</div>
              <p className="mt-2 text-sm font-medium text-slate-900">{name}</p>
              <p className="text-xs text-slate-500">Member profile</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Roster data is managed from the Members tab.</p>
      </>,
    );
  }
  return shell(<p className="text-sm text-slate-500">{section.title || "Portal section"}</p>);
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
    <Card className="p-5 space-y-3 border-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Selected section</p>
          <div className="text-sm font-semibold text-slate-900 mt-1">{label}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onMoveUp} disabled={!canMoveUp} title="Move up" aria-label="Move selected section up">
            <ArrowUp className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onMoveDown} disabled={!canMoveDown} title="Move down" aria-label="Move selected section down">
            <ArrowDown className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRemove} title="Remove" aria-label="Remove selected section">
            <Trash2 className="w-4 h-4 text-red-600" />
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-xs text-slate-600">Title</Label>
        <Input
          data-testid="members-portal-section-title-input"
          value={section.title ?? ""}
          onChange={(e) => onChange({ title: e.target.value })}
          className="mt-1"
        />
      </div>

      {(section.type === "welcome_message" || section.type === "dues_info") && (
        <div>
          <Label className="text-xs text-slate-600">Body</Label>
          <Textarea
            data-testid="members-portal-section-body-input"
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
        <p data-testid="members-portal-roster-helper" className="text-xs text-slate-500 italic">
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
