import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2, Download, Plus, Users, Mail, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { api, type Member } from "@/lib/api";

const TYPE_OPTIONS = ["general", "board", "honorary", "staff", "volunteer"] as const;
const STATUS_OPTIONS = ["active", "inactive", "pending"] as const;

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  memberType: string;
  status: string;
  joinDate: string;
  renewalDate: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  memberType: "general",
  status: "active",
  joinDate: "",
  renewalDate: "",
  notes: "",
};

function memberToForm(m: Member): FormState {
  return {
    firstName: m.firstName ?? "",
    lastName: m.lastName ?? "",
    email: m.email ?? "",
    phone: m.phone ?? "",
    memberType: m.memberType ?? "general",
    status: m.status ?? "active",
    joinDate: m.joinDate ?? "",
    renewalDate: m.renewalDate ?? "",
    notes: m.notes ?? "",
  };
}

function formToPayload(f: FormState): Partial<Member> {
  return {
    firstName: f.firstName.trim(),
    lastName: f.lastName.trim() || null,
    email: f.email.trim() || null,
    phone: f.phone.trim() || null,
    memberType: f.memberType,
    status: f.status,
    joinDate: f.joinDate || null,
    renewalDate: f.renewalDate || null,
    notes: f.notes.trim() || null,
  };
}

function statusBadgeClass(status: string) {
  if (status === "active") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (status === "pending") return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return "bg-slate-500/15 text-slate-300 border-slate-500/30";
}

function MemberFormFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm({ ...form, [key]: value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
      <div className="space-y-1.5">
        <Label className="text-slate-300">First Name *</Label>
        <Input
          value={form.firstName}
          onChange={(e) => update("firstName", e.target.value)}
          className="bg-white/5 border-white/10 text-white"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-slate-300">Last Name</Label>
        <Input
          value={form.lastName}
          onChange={(e) => update("lastName", e.target.value)}
          className="bg-white/5 border-white/10 text-white"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-slate-300">Email</Label>
        <Input
          type="email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          className="bg-white/5 border-white/10 text-white"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-slate-300">Phone</Label>
        <Input
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
          className="bg-white/5 border-white/10 text-white"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-slate-300">Member Type</Label>
        <Select value={form.memberType} onValueChange={(v) => update("memberType", v)}>
          <SelectTrigger className="bg-white/5 border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10 text-white">
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t} className="capitalize">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-slate-300">Status</Label>
        <Select value={form.status} onValueChange={(v) => update("status", v)}>
          <SelectTrigger className="bg-white/5 border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10 text-white">
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-slate-300">Join Date</Label>
        <Input
          type="date"
          value={form.joinDate}
          onChange={(e) => update("joinDate", e.target.value)}
          className="bg-white/5 border-white/10 text-white"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-slate-300">Renewal Date</Label>
        <Input
          type="date"
          value={form.renewalDate}
          onChange={(e) => update("renewalDate", e.target.value)}
          className="bg-white/5 border-white/10 text-white"
        />
      </div>
      <div className="sm:col-span-2 space-y-1.5">
        <Label className="text-slate-300">Notes</Label>
        <Textarea
          rows={3}
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          className="bg-white/5 border-white/10 text-white resize-none"
        />
      </div>
    </div>
  );
}

export default function Members() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["members", statusFilter, typeFilter, search],
    queryFn: () =>
      api.members.list({
        status: statusFilter === "all" ? undefined : statusFilter,
        type: typeFilter === "all" ? undefined : typeFilter,
        search: search.trim() || undefined,
      }),
  });

  const { data: stats } = useQuery({
    queryKey: ["members-stats"],
    queryFn: api.members.stats,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["members"] });
    qc.invalidateQueries({ queryKey: ["members-stats"] });
  };

  const createMutation = useMutation({
    mutationFn: () => api.members.create(formToPayload(addForm)),
    onSuccess: () => {
      invalidateAll();
      toast.success("Member added");
      setAdding(false);
      setAddForm(EMPTY_FORM);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to add member"),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("No member selected");
      return api.members.update(editing.id, formToPayload(editForm));
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Member updated");
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update member"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.members.delete(id),
    onSuccess: () => {
      invalidateAll();
      toast.success("Member deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to delete member"),
  });

  const resendInviteMutation = useMutation({
    mutationFn: (id: string) => api.members.resendInvite(id),
    onSuccess: (res) => {
      invalidateAll();
      if (res.sent) toast.success("Invitation email sent");
      else if (res.simulated) toast.success(`Invite link generated (email not configured): ${res.url}`);
      else toast.warning("Invite link generated, but email could not be sent. Check server logs.");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to resend invite"),
  });

  useEffect(() => {
    if (editing) setEditForm(memberToForm(editing));
  }, [editing]);

  const handleAddSubmit = () => {
    if (!addForm.firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    createMutation.mutate();
  };

  const handleEditSubmit = () => {
    if (!editForm.firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    updateMutation.mutate();
  };

  const handleDelete = (m: Member) => {
    if (!confirm(`Delete ${m.firstName}${m.lastName ? " " + m.lastName : ""}?`)) return;
    deleteMutation.mutate(m.id);
  };

  const handleExportCsv = async () => {
    try {
      const res = await api.members.exportCsv();
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `members-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Export started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const fmtDate = (d?: string | null) => {
    if (!d) return "—";
    return d.length >= 10 ? d.slice(0, 10) : d;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Members</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExportCsv}
            className="border-white/10 text-slate-200"
          >
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Member
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="bg-[hsl(224,30%,14%)] border-white/10 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Total Members</div>
          <div className="text-2xl font-bold text-white mt-1">{stats?.total ?? 0}</div>
        </Card>
        <Card className="bg-[hsl(224,30%,14%)] border-white/10 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Active</div>
          <div className="text-2xl font-bold text-emerald-300 mt-1">{stats?.active ?? 0}</div>
        </Card>
        <Card className="bg-[hsl(224,30%,14%)] border-white/10 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Board Members</div>
          <div className="text-2xl font-bold text-sky-300 mt-1">{stats?.board ?? 0}</div>
        </Card>
        <Card className="bg-[hsl(224,30%,14%)] border-white/10 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Registered</div>
          <div className="text-2xl font-bold text-violet-300 mt-1">{stats?.registered ?? 0}</div>
        </Card>
        <Card className="bg-[hsl(224,30%,14%)] border-white/10 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Pending</div>
          <div className="text-2xl font-bold text-amber-300 mt-1">{stats?.pending ?? 0}</div>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-white/5 border-white/10 text-white sm:max-w-sm"
        />
        <div className="flex gap-2 sm:ml-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10 text-white">
              <SelectItem value="all">All Status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10 text-white">
              <SelectItem value="all">All Types</SelectItem>
              {TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="bg-[hsl(224,30%,14%)] border-white/10 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading…</div>
        ) : members.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <Users className="w-10 h-10 text-slate-500 mb-3" />
            <p className="text-slate-400">
              No members yet. Add your first member to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-slate-400">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Email</th>
                  <th className="text-left px-4 py-2 font-medium">Phone</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Join Date</th>
                  <th className="text-left px-4 py-2 font-medium">Renewal Date</th>
                  <th className="text-right px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-4 py-2 text-white">
                      {m.firstName}
                      {m.lastName ? " " + m.lastName : ""}
                    </td>
                    <td className="px-4 py-2 text-slate-300">{m.email ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-300">{m.phone ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant="outline"
                        className="capitalize border-white/15 text-slate-200"
                      >
                        {m.memberType}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        variant="outline"
                        className={`capitalize ${statusBadgeClass(m.status)}`}
                      >
                        {m.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-slate-300">{fmtDate(m.joinDate)}</td>
                    <td className="px-4 py-2 text-slate-300">{fmtDate(m.renewalDate)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end items-center gap-2">
                        {m.registered_at || m.registeredAt ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-300" title="Member has registered">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Registered
                          </span>
                        ) : (m.has_pending_invite || m.hasPendingInvite) && m.email ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => resendInviteMutation.mutate(m.id)}
                            disabled={resendInviteMutation.isPending}
                            className="h-7 text-xs text-amber-300 hover:text-amber-200"
                            title="Resend portal invitation"
                          >
                            <Mail className="w-3.5 h-3.5 mr-1" /> Resend invite
                          </Button>
                        ) : null}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditing(m)}
                          className="h-8 w-8 text-slate-300 hover:text-white"
                          aria-label="Edit member"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(m)}
                          className="h-8 w-8 text-slate-300 hover:text-rose-300"
                          aria-label="Delete member"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add Member Dialog */}
      <Dialog
        open={adding}
        onOpenChange={(o) => {
          setAdding(o);
          if (!o) setAddForm(EMPTY_FORM);
        }}
      >
        <DialogContent className="bg-[hsl(224,30%,14%)] border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
          </DialogHeader>
          <MemberFormFields form={addForm} setForm={setAddForm} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAdding(false)}
              className="border-white/10 text-slate-300"
            >
              Cancel
            </Button>
            <Button onClick={handleAddSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-[hsl(224,30%,14%)] border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
          </DialogHeader>
          <MemberFormFields form={editForm} setForm={setEditForm} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              className="border-white/10 text-slate-300"
            >
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
