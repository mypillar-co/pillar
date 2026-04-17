import React, { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Users, Search, Mail, Phone, Loader2, Upload, Trash2, Pencil, Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { api, type Member } from "@/lib/api";

const MEMBER_TYPES = ["general", "board", "honorary", "staff"];
const STATUSES = ["active", "inactive", "pending"];

const emptyForm = {
  firstName: "", lastName: "", email: "", phone: "",
  memberType: "general", status: "active",
  joinDate: "", renewalDate: "", notes: "",
};

function MemberFormDialog({
  open, onClose, member,
}: { open: boolean; onClose: () => void; member: Member | null }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);

  React.useEffect(() => {
    if (member) {
      setForm({
        firstName: member.firstName ?? "",
        lastName: member.lastName ?? "",
        email: member.email ?? "",
        phone: member.phone ?? "",
        memberType: member.memberType ?? "general",
        status: member.status ?? "active",
        joinDate: member.joinDate ?? "",
        renewalDate: member.renewalDate ?? "",
        notes: member.notes ?? "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [member, open]);

  const mutation = useMutation({
    mutationFn: () => member
      ? api.members.update(member.id, form)
      : api.members.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["member-stats"] });
      toast.success(member ? "Member updated" : "Member added");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[hsl(224,30%,14%)] border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>{member ? "Edit Member" : "Add Member"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">First name *</Label>
              <Input value={form.firstName} onChange={e => set("firstName")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Last name</Label>
              <Input value={form.lastName} onChange={e => set("lastName")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Email</Label>
              <Input type="email" value={form.email} onChange={e => set("email")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Phone</Label>
              <Input value={form.phone} onChange={e => set("phone")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Type</Label>
              <Select value={form.memberType} onValueChange={set("memberType")}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                  {MEMBER_TYPES.map(t => <SelectItem key={t} value={t} className="text-white capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Status</Label>
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                  {STATUSES.map(s => <SelectItem key={s} value={s} className="text-white capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Join date</Label>
              <Input type="date" value={form.joinDate} onChange={e => set("joinDate")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Renewal date</Label>
              <Input type="date" value={form.renewalDate} onChange={e => set("renewalDate")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes")(e.target.value)} rows={3} className="bg-white/5 border-white/10 text-white resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-slate-300">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.firstName || mutation.isPending}>
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {member ? "Save" : "Add Member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseCsv(text: string): Partial<Member>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[\s_-]/g, ""));
  const map: Record<string, keyof Member> = {
    firstname: "firstName", first: "firstName",
    lastname: "lastName", last: "lastName",
    email: "email", emailaddress: "email",
    phone: "phone", phonenumber: "phone",
    membertype: "memberType", type: "memberType",
    status: "status",
    joindate: "joinDate", joined: "joinDate",
    renewaldate: "renewalDate", renewal: "renewalDate",
    notes: "notes", note: "notes",
  };
  const rows: Partial<Member>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const row: Partial<Member> = {};
    headers.forEach((h, idx) => {
      const key = map[h];
      if (key && cells[idx]) (row as Record<string, string>)[key] = cells[idx];
    });
    if (row.firstName) rows.push(row);
  }
  return rows;
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => parseCsv(text), [text]);

  const importMutation = useMutation({
    mutationFn: async () => ({ inserted: 0, skipped: preview.length, errors: [] as { row: number; error: string }[] }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["member-stats"] });
      toast.success(`Imported ${r.inserted} member${r.inserted !== 1 ? "s" : ""}${r.skipped ? `, ${r.skipped} skipped` : ""}`);
      onClose();
      setText("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(f);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[hsl(224,30%,14%)] border-white/10 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Members from CSV</DialogTitle>
          <DialogDescription className="text-slate-400">
            Headers we recognize: firstName, lastName, email, phone, memberType, status, joinDate, renewalDate, notes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="border-white/10 text-slate-200">
              <Upload className="w-4 h-4 mr-2" /> Choose CSV
            </Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            <span className="text-xs text-muted-foreground self-center">or paste CSV text below</span>
          </div>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={8}
            placeholder="firstName,lastName,email,phone,memberType,status&#10;Jane,Doe,jane@example.com,555-1234,general,active"
            className="bg-white/5 border-white/10 text-white font-mono text-xs resize-none"
          />
          {preview.length > 0 && (
            <div className="text-sm text-slate-300">
              Found <span className="font-semibold text-white">{preview.length}</span> member{preview.length !== 1 ? "s" : ""} ready to import.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-slate-300">Cancel</Button>
          <Button onClick={() => importMutation.mutate()} disabled={preview.length === 0 || importMutation.isPending}>
            {importMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Import {preview.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Members() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["members", statusFilter, search],
    queryFn: () => api.members.list({
      status: statusFilter === "all" ? undefined : statusFilter,
      search: search || undefined,
    }),
  });
  const { data: stats } = useQuery({ queryKey: ["member-stats"], queryFn: api.members.stats });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.members.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["member-stats"] });
      toast.success("Member removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSelect = (id: string) => setSelected(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const selectedEmails = members
    .filter(m => selected.has(m.id) && m.email)
    .map(m => m.email!)
    .filter((e, i, a) => a.indexOf(e) === i);

  const onBulkEmail = () => {
    if (selectedEmails.length === 0) {
      toast.error("No selected members have an email address");
      return;
    }
    window.location.href = `mailto:?bcc=${encodeURIComponent(selectedEmails.join(","))}`;
  };

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Members</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {stats
              ? `${stats.total} total · ${stats.active} active · ${stats.pending} pending · ${stats.board} board`
              : `${members.length} member${members.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImporting(true)} className="border-white/10 text-slate-200">
            <Upload className="w-4 h-4 mr-2" /> Import CSV
          </Button>
          <Button onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-2" /> Add Member</Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..." className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
            <SelectItem value="all" className="text-white">All statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s} className="text-white capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <Button variant="outline" onClick={onBulkEmail} className="border-primary/40 text-primary">
            <Send className="w-4 h-4 mr-2" /> Email {selected.size}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : members.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
          <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">{search || statusFilter !== "all" ? "No members match your filters" : "No members yet"}</p>
          {!search && statusFilter === "all" && (
            <div className="flex justify-center gap-2 mt-4">
              <Button size="sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-2" /> Add member</Button>
              <Button size="sm" variant="outline" onClick={() => setImporting(true)} className="border-white/10 text-slate-200"><Upload className="w-4 h-4 mr-2" /> Import CSV</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-4 border border-white/8 bg-card/50 rounded-xl">
              <Checkbox
                checked={selected.has(m.id)}
                onCheckedChange={() => toggleSelect(m.id)}
                aria-label={`Select ${m.firstName} ${m.lastName ?? ""}`.trim()}
              />
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white truncate">
                  {m.firstName} {m.lastName ?? ""}
                </p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {m.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{m.email}</span>}
                  {m.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{m.phone}</span>}
                  {m.renewalDate && <span className="text-xs text-muted-foreground">Renews {m.renewalDate}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground capitalize hidden sm:block">{m.memberType}</span>
                <Badge variant="outline" className={`text-xs capitalize ${
                  m.status === "active" ? "border-emerald-500/30 text-emerald-400" :
                  m.status === "pending" ? "border-amber-500/30 text-amber-400" :
                  "border-white/20 text-slate-400"
                }`}>{m.status}</Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Edit ${m.firstName} ${m.lastName ?? ""}`.trim()}
                  className="h-8 w-8 text-slate-400 hover:text-white"
                  onClick={() => setEditing(m)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${m.firstName} ${m.lastName ?? ""}`.trim()}
                  className="h-8 w-8 text-slate-400 hover:text-red-400"
                  onClick={() => {
                    if (window.confirm(`Remove ${m.firstName} ${m.lastName ?? ""}?`)) removeMutation.mutate(m.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <MemberFormDialog open={adding} onClose={() => setAdding(false)} member={null} />
      <MemberFormDialog open={!!editing} onClose={() => setEditing(null)} member={editing} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}
