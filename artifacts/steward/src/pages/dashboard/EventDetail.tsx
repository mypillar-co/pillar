import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Calendar, MapPin, Edit2, Save, X, Loader2, Trash2,
  Ticket, DollarSign, Users, Send, CheckCircle, XCircle, Plus,
  MessageSquare, RefreshCw, Sparkles, ClipboardList, Mail,
  ExternalLink, Copy, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, type EventItem, type EventDetail, type TicketType, type TicketSale } from "@/lib/api";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const STATUS_OPTIONS = ["draft", "published", "active", "completed", "cancelled"];
const STATUS_COLORS: Record<string, string> = {
  draft: "border-white/20 text-slate-400",
  pending_approval: "border-amber-500/30 text-amber-400",
  published: "border-emerald-500/30 text-emerald-400",
  active: "border-blue-500/30 text-blue-400",
  completed: "border-slate-500/30 text-slate-500",
  cancelled: "border-red-500/30 text-red-400",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  published: "Published",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

type Tab = "overview" | "registrations" | "attendees" | "communication";

type Registration = {
  id: string;
  type: string;
  status: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  vendorType?: string | null;
  tier?: string | null;
  logoUrl?: string | null;
  feeAmount?: number;
  stripePaymentStatus?: string | null;
  createdAt: string;
};

function AddSaleDialog({ open, onClose, eventId, ticketTypes }: {
  open: boolean; onClose: () => void; eventId: string; ticketTypes: TicketType[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ attendeeName: "", attendeeEmail: "", attendeePhone: "", ticketTypeId: "", quantity: "1", amountPaid: "", paymentMethod: "manual", notes: "" });
  const mutation = useMutation({
    mutationFn: () => api.events.sales.create(eventId, {
      attendeeName: form.attendeeName,
      attendeeEmail: form.attendeeEmail || undefined,
      attendeePhone: form.attendeePhone || undefined,
      ticketTypeId: form.ticketTypeId || undefined,
      quantity: Number(form.quantity),
      amountPaid: form.amountPaid ? Number(form.amountPaid) : 0,
      paymentMethod: form.paymentMethod,
      notes: form.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", eventId] });
      toast.success("Sale recorded");
      onClose();
      setForm({ attendeeName: "", attendeeEmail: "", attendeePhone: "", ticketTypeId: "", quantity: "1", amountPaid: "", paymentMethod: "manual", notes: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[hsl(224,30%,14%)] border-white/10 text-white max-w-md">
        <DialogHeader><DialogTitle>Record Ticket Sale</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-slate-300">Attendee Name *</Label>
            <Input value={form.attendeeName} onChange={e => set("attendeeName")(e.target.value)} placeholder="Jane Smith" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Email</Label>
              <Input value={form.attendeeEmail} onChange={e => set("attendeeEmail")(e.target.value)} placeholder="jane@example.com" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Phone</Label>
              <Input value={form.attendeePhone} onChange={e => set("attendeePhone")(e.target.value)} placeholder="555-0100" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
          </div>
          {ticketTypes.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-slate-300">Ticket Type</Label>
              <Select value={form.ticketTypeId} onValueChange={set("ticketTypeId")}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue placeholder="General admission" /></SelectTrigger>
                <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                  {ticketTypes.map(tt => (
                    <SelectItem key={tt.id} value={tt.id} className="text-white">{tt.name} {tt.price > 0 ? `— $${tt.price}` : "(Free)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Qty</Label>
              <Input type="number" min="1" value={form.quantity} onChange={e => set("quantity")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Amount ($)</Label>
              <Input type="number" step="0.01" value={form.amountPaid} onChange={e => set("amountPaid")(e.target.value)} placeholder="0.00" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Method</Label>
              <Select value={form.paymentMethod} onValueChange={set("paymentMethod")}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                  <SelectItem value="manual" className="text-white">Manual</SelectItem>
                  <SelectItem value="cash" className="text-white">Cash</SelectItem>
                  <SelectItem value="check" className="text-white">Check</SelectItem>
                  <SelectItem value="card" className="text-white">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-slate-300">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.attendeeName || mutation.isPending}>
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Record Sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddTicketTypeDialog({ open, onClose, eventId }: { open: boolean; onClose: () => void; eventId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", price: "0", quantity: "" });
  const mutation = useMutation({
    mutationFn: () => api.events.ticketTypes.create(eventId, { name: form.name, description: form.description || undefined, price: Number(form.price), quantity: form.quantity ? Number(form.quantity) : undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", eventId] });
      toast.success("Ticket type added");
      onClose();
      setForm({ name: "", description: "", price: "0", quantity: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[hsl(224,30%,14%)] border-white/10 text-white max-w-md">
        <DialogHeader><DialogTitle>Add Ticket Type</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-slate-300">Name *</Label>
            <Input value={form.name} onChange={e => set("name")(e.target.value)} placeholder="General Admission" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Price ($)</Label>
              <Input type="number" step="0.01" min="0" value={form.price} onChange={e => set("price")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Quantity (blank = unlimited)</Label>
              <Input type="number" min="1" value={form.quantity} onChange={e => set("quantity")(e.target.value)} placeholder="∞" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-slate-300">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending}>
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Add Type
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ open, onClose, onConfirm, isPending }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void; isPending: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[hsl(224,30%,14%)] border-white/10 text-white max-w-md">
        <DialogHeader><DialogTitle>Reject Application</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-slate-300">Provide a reason for rejection. This will be sent to the applicant.</p>
          <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Thank you for your application. Unfortunately..." rows={3} className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-slate-300">Cancel</Button>
          <Button onClick={() => onConfirm(reason)} disabled={isPending} className="bg-red-600 hover:bg-red-700 text-white border-0">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<EventItem>>({});
  const [addingSale, setAddingSale] = useState(false);
  const [addingTicketType, setAddingTicketType] = useState(false);
  const [commSubject, setCommSubject] = useState("");
  const [commBody, setCommBody] = useState("");
  const [approvalComment, setApprovalComment] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [expandedReg, setExpandedReg] = useState<string | null>(null);

  // AI panel
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api.events.get(id),
    enabled: !!id,
  });

  const { data: registrations = [], isLoading: regsLoading } = useQuery({
    queryKey: ["event-registrations", id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/registrations?eventId=${id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<Registration[]>;
    },
    enabled: !!id,
  });

  const detail = data as EventDetail | undefined;
  const event = detail?.event;

  const updateMutation = useMutation({
    mutationFn: () => api.events.update(id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", id] });
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event updated");
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.events.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event deleted");
      navigate("/dashboard/events");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.events.submit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", id] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["event-metrics"] });
      qc.invalidateQueries({ queryKey: ["approval-queue"] });
      toast.success("Event submitted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: () => api.events.approve(id, approvalComment || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", id] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["approval-queue"] });
      toast.success("Event approved and published");
      setApprovalComment("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.events.reject(id, approvalComment || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", id] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["approval-queue"] });
      toast.success("Event returned to draft");
      setApprovalComment("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveRegMutation = useMutation({
    mutationFn: (regId: string) =>
      fetch(`${BASE}/api/registrations/${regId}/approve`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-registrations", id] });
      toast.success("Application approved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectRegMutation = useMutation({
    mutationFn: ({ regId, reason }: { regId: string; reason: string }) =>
      fetch(`${BASE}/api/registrations/${regId}/reject`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-registrations", id] });
      setRejectingId(null);
      toast.success("Application rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSaleMutation = useMutation({
    mutationFn: (saleId: string) => api.events.sales.delete(id, saleId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["event", id] }); toast.success("Sale removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTicketTypeMutation = useMutation({
    mutationFn: (typeId: string) => api.events.ticketTypes.delete(id, typeId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["event", id] }); toast.success("Ticket type removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendCommMutation = useMutation({
    mutationFn: () => api.events.communications.send(id, commSubject, commBody),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", id] });
      toast.success("Message sent");
      setCommSubject("");
      setCommBody("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEditing = () => {
    if (!event) return;
    setForm({ name: event.name, description: event.description ?? "", eventType: event.eventType ?? "", status: event.status, startDate: event.startDate ?? "", endDate: event.endDate ?? "", startTime: event.startTime ?? "", endTime: event.endTime ?? "", location: event.location ?? "" });
    setEditing(true);
  };

  const set = (k: keyof EventItem) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  async function askAI(e: React.FormEvent) {
    e.preventDefault();
    const msg = aiInput.trim();
    if (!msg || aiLoading) return;
    const newMessages = [...aiMessages, { role: "user" as const, content: msg }];
    setAiMessages(newMessages);
    setAiInput("");
    setAiLoading(true);
    try {
      const res = await fetch(`${BASE}/api/events/ai-manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: msg, history: aiMessages, eventId: id }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setAiMessages([...newMessages, { role: "assistant", content: data.reply ?? "" }]);
      qc.invalidateQueries({ queryKey: ["event", id] });
      qc.invalidateQueries({ queryKey: ["events"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setAiLoading(false);
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!event) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Event not found</p>
        <Link href="/dashboard/events"><Button variant="outline" className="mt-4 border-white/10">Back to Events</Button></Link>
      </div>
    );
  }

  const hasPendingApproval = detail?.approvals?.some(a => a.status === "pending");
  const canSubmit = event.status === "draft" && !hasPendingApproval;
  const canApproveReject = event.status === "pending_approval" && hasPendingApproval;
  const pendingRegs = (registrations as Registration[]).filter(r => r.status === "pending_approval");
  const { data: orgData } = useQuery<{ slug: string }>({
    queryKey: ["org-info"],
    queryFn: () => fetch("/api/organizations", { credentials: "include" }).then(r => r.json()),
  });

  const publicEventUrl = event.slug && orgData?.slug
    ? `https://${orgData.slug}.mypillar.co/events/${event.slug}`
    : null;

  const TABS: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "overview", label: "Overview", icon: Calendar },
    { key: "registrations", label: "Registrations", icon: ClipboardList, count: pendingRegs.length || undefined },
    { key: "attendees", label: "Attendees", icon: Users, count: detail?.totalSold || undefined },
    { key: "communication", label: "Communication", icon: Mail },
  ];

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard/events">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white flex-shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white truncate">{event.name}</h1>
              {event.isRecurring && <RefreshCw className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={`text-xs ${STATUS_COLORS[event.status] ?? ""}`}>
                {STATUS_LABELS[event.status] ?? event.status}
              </Badge>
              {publicEventUrl && (
                <a href={publicEventUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                  <ExternalLink className="w-3 h-3" /> View public page
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => setAiOpen(v => !v)} className="border-primary/30 text-primary hover:bg-primary/10">
            <Sparkles className="w-4 h-4 mr-1.5" /> Ask AI
          </Button>
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="border-white/10 text-slate-300">
                <X className="w-4 h-4 mr-1.5" /> Cancel
              </Button>
              <Button size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />} Save
              </Button>
            </>
          ) : (
            <>
              {canSubmit && (
                <Button size="sm" variant="outline" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                  {submitMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1.5" />}
                  {event.requiresApproval ? "Submit for Approval" : "Publish"}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={startEditing} className="border-white/10 text-slate-300">
                <Edit2 className="w-4 h-4 mr-1.5" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => { if (confirm("Delete this event?")) deleteMutation.mutate(); }} disabled={deleteMutation.isPending} className="border-red-500/20 text-red-400 hover:bg-red-500/10">
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* AI Panel */}
      {aiOpen && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-primary/15">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-white">Event AI</p>
              <p className="text-xs text-muted-foreground">— update this event with plain English</p>
            </div>
            <button onClick={() => setAiOpen(false)} className="text-muted-foreground hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          {aiMessages.length > 0 && (
            <div className="px-4 py-3 space-y-3 max-h-64 overflow-y-auto">
              {aiMessages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-white rounded-br-sm" : "bg-white/8 text-slate-200 rounded-bl-sm border border-white/10"}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="px-3 py-2 rounded-xl bg-white/8 border border-white/10">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          )}
          {aiMessages.length === 0 && !aiLoading && (
            <div className="px-4 py-3 flex flex-wrap gap-2">
              {[
                "Change the date to next Saturday at 6pm",
                "Update the description to be more exciting",
                "Change the location to City Hall Park",
                "Add a $25 VIP ticket tier with 50 capacity",
              ].map(suggestion => (
                <button key={suggestion} onClick={() => setAiInput(suggestion)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={askAI} className="flex items-center gap-2 px-4 py-3 border-t border-primary/15">
            <input value={aiInput} onChange={e => setAiInput(e.target.value)}
              placeholder='Try: "Move the start time to 7pm and update the description"'
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none"
              disabled={aiLoading} />
            <button type="submit" disabled={!aiInput.trim() || aiLoading}
              className="flex-shrink-0 p-1.5 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors">
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      )}

      {/* Event-level Approval Panel */}
      {canApproveReject && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-amber-400">Approval Required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-300">This event is pending approval before it can be published.</p>
            <Textarea value={approvalComment} onChange={e => setApprovalComment(e.target.value)} placeholder="Add a comment for the submitter... (optional)" rows={2} className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {approveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1.5" />} Approve & Publish
              </Button>
              <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                {rejectMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <XCircle className="w-4 h-4 mr-1.5" />} Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Tickets Sold", value: detail?.totalSold ?? 0, icon: Users },
          { label: "Revenue", value: `$${(detail?.totalRevenue ?? 0).toFixed(2)}`, icon: DollarSign },
          { label: "Pending Applications", value: pendingRegs.length, icon: ClipboardList },
          { label: "Messages Sent", value: detail?.communications?.length ?? 0, icon: MessageSquare },
        ].map(s => (
          <Card key={s.label} className="border-white/10 bg-card/60">
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <s.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold text-white">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/8">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-primary text-white" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? "bg-white/20 text-white" : "bg-amber-500/20 text-amber-400"}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <Card className="border-white/10 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Event Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-slate-300">Name</Label>
                      <Input value={form.name ?? ""} onChange={e => set("name")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-slate-300">Status</Label>
                      <Select value={form.status ?? ""} onValueChange={set("status")}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                          {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s} className="text-white capitalize">{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-slate-300">Start Date</Label>
                      <Input type="date" value={form.startDate ?? ""} onChange={e => set("startDate")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-slate-300">Start Time</Label>
                      <Input type="time" value={form.startTime ?? ""} onChange={e => set("startTime")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-slate-300">End Date</Label>
                      <Input type="date" value={form.endDate ?? ""} onChange={e => set("endDate")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-slate-300">Location</Label>
                      <Input value={form.location ?? ""} onChange={e => set("location")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300">Description</Label>
                    <Textarea value={form.description ?? ""} onChange={e => set("description")(e.target.value)} rows={4} className="bg-white/5 border-white/10 text-white resize-none" />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Date</p>
                      <p className="text-sm text-white">
                        {event.startDate ? new Date(event.startDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "Not set"}
                        {event.startTime && ` at ${event.startTime}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Location</p>
                      <div className="flex items-center gap-1.5">
                        {event.location && <MapPin className="w-3.5 h-3.5 text-muted-foreground" />}
                        <p className="text-sm text-white">{event.location || "Not set"}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Type</p>
                      <p className="text-sm text-white capitalize">{event.eventType || "Not set"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Ticketed</p>
                      <p className="text-sm text-white">{event.isTicketed ? `Yes${event.ticketPrice ? ` — $${event.ticketPrice}` : ""}` : "No"}</p>
                    </div>
                    {event.maxCapacity && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Capacity</p>
                        <p className="text-sm text-white">{event.maxCapacity}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Approval Required</p>
                      <p className="text-sm text-white">{event.requiresApproval ? "Yes" : "No"}</p>
                    </div>
                  </div>
                  {event.description && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Description</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{event.description}</p>
                    </div>
                  )}
                  {publicEventUrl && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Public URL</p>
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/5 border border-white/8">
                        <code className="flex-1 text-xs text-slate-300 truncate">{publicEventUrl}</code>
                        <button onClick={() => { navigator.clipboard.writeText(publicEventUrl); toast.success("URL copied"); }} className="text-slate-400 hover:text-white transition-colors">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <a href={publicEventUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ticket Types */}
          <Card className="border-white/10 bg-card/60">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Ticket className="w-4 h-4 text-primary" /> Ticket Types
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setAddingTicketType(true)} className="border-white/10 text-slate-300 h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add Type
              </Button>
            </CardHeader>
            <CardContent>
              {!detail?.ticketTypes?.length ? (
                <p className="text-sm text-muted-foreground">No ticket types. Add one to track sales by category.</p>
              ) : (
                <div className="space-y-2">
                  {detail.ticketTypes.map((tt: TicketType) => (
                    <div key={tt.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/8">
                      <div>
                        <p className="text-sm font-medium text-white">{tt.name}</p>
                        <p className="text-xs text-muted-foreground">{tt.price > 0 ? `$${tt.price}` : "Free"} · {tt.sold} sold{tt.quantity ? ` / ${tt.quantity}` : ""}</p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => deleteTicketTypeMutation.mutate(tt.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Approval History */}
          {detail?.approvals && detail.approvals.length > 0 && (
            <Card className="border-white/10 bg-card/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-white">Approval History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {detail.approvals.map(appr => (
                    <div key={appr.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/8">
                      {appr.status === "approved" ? <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5" /> : appr.status === "rejected" ? <XCircle className="w-4 h-4 text-red-400 mt-0.5" /> : <Calendar className="w-4 h-4 text-amber-400 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white capitalize">{appr.status}</p>
                        {appr.comments && <p className="text-xs text-muted-foreground mt-0.5">{appr.comments}</p>}
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">{new Date(appr.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground text-right">Created {new Date(event.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
        </div>
      )}

      {/* ── REGISTRATIONS TAB ── */}
      {tab === "registrations" && (
        <div className="space-y-4">
          {regsLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (registrations as Registration[]).length === 0 ? (
            <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
              <ClipboardList className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No applications yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Vendor and sponsor applications submitted through your public event page will appear here</p>
            </div>
          ) : (
            <>
              {pendingRegs.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <p className="text-xs text-amber-400 font-medium">{pendingRegs.length} application{pendingRegs.length !== 1 ? "s" : ""} pending review</p>
                </div>
              )}
              <div className="space-y-2">
                {(registrations as Registration[]).map(reg => {
                  const isExpanded = expandedReg === reg.id;
                  const statusColor = reg.status === "approved" ? "border-emerald-500/30 text-emerald-400" : reg.status === "rejected" ? "border-red-500/30 text-red-400" : reg.status === "pending_approval" ? "border-amber-500/30 text-amber-400" : "border-white/20 text-slate-400";
                  return (
                    <div key={reg.id} className="border border-white/8 bg-card/50 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => setExpandedReg(isExpanded ? null : reg.id)}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary">{reg.type === "vendor" ? "V" : "S"}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{reg.name}</p>
                            <p className="text-xs text-muted-foreground">{reg.contactName ?? reg.email ?? ""} · {reg.type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="outline" className={`text-xs capitalize ${statusColor}`}>{reg.status.replace(/_/g, " ")}</Badge>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-white/8 pt-3 space-y-3">
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                            {reg.email && <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm text-white">{reg.email}</p></div>}
                            {reg.phone && <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-sm text-white">{reg.phone}</p></div>}
                            {reg.vendorType && <div><p className="text-xs text-muted-foreground">Vendor Type</p><p className="text-sm text-white capitalize">{reg.vendorType}</p></div>}
                            {reg.tier && <div><p className="text-xs text-muted-foreground">Sponsor Tier</p><p className="text-sm text-white capitalize">{reg.tier}</p></div>}
                            {reg.feeAmount != null && <div><p className="text-xs text-muted-foreground">Fee</p><p className="text-sm text-white">{reg.feeAmount > 0 ? `$${(reg.feeAmount / 100).toFixed(2)}` : "Waived"}</p></div>}
                            {reg.stripePaymentStatus && <div><p className="text-xs text-muted-foreground">Payment</p><p className="text-sm text-white capitalize">{reg.stripePaymentStatus}</p></div>}
                          </div>
                          {reg.status === "pending_approval" && (
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" onClick={() => approveRegMutation.mutate(reg.id)} disabled={approveRegMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                {approveRegMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />} Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setRejectingId(reg.id)} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                                <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ATTENDEES TAB ── */}
      {tab === "attendees" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{detail?.totalSold ?? 0} attendee{detail?.totalSold !== 1 ? "s" : ""} · ${(detail?.totalRevenue ?? 0).toFixed(2)} total revenue</p>
            <Button size="sm" variant="outline" onClick={() => setAddingSale(true)} className="border-white/10 text-slate-300 h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" /> Record Sale
            </Button>
          </div>
          {!detail?.sales?.length ? (
            <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
              <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No ticket sales recorded yet</p>
              <Button size="sm" className="mt-4" onClick={() => setAddingSale(true)}>
                <Plus className="w-4 h-4 mr-2" /> Record First Sale
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-12 gap-2 px-3 mb-1">
                <p className="col-span-4 text-xs text-muted-foreground">Name</p>
                <p className="col-span-3 text-xs text-muted-foreground">Email</p>
                <p className="col-span-2 text-xs text-muted-foreground">Qty</p>
                <p className="col-span-2 text-xs text-muted-foreground">Paid</p>
                <p className="col-span-1" />
              </div>
              {detail.sales.map((sale: TicketSale) => (
                <div key={sale.id} className="grid grid-cols-12 gap-2 items-center p-3 rounded-lg bg-white/5 border border-white/8">
                  <p className="col-span-4 text-sm text-white truncate">{sale.attendeeName}</p>
                  <p className="col-span-3 text-xs text-muted-foreground truncate">{sale.attendeeEmail ?? "—"}</p>
                  <p className="col-span-2 text-sm text-white">{sale.quantity}</p>
                  <p className="col-span-2 text-sm text-white">{sale.amountPaid > 0 ? `$${sale.amountPaid.toFixed(2)}` : "Free"}</p>
                  <div className="col-span-1 flex justify-end">
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => deleteSaleMutation.mutate(sale.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── COMMUNICATION TAB ── */}
      {tab === "communication" && (
        <div className="space-y-4">
          <Card className="border-white/10 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" /> Send Message to Attendees
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Subject</Label>
                <Input value={commSubject} onChange={e => setCommSubject(e.target.value)} placeholder="Important update about your event" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">Message</Label>
                <Textarea value={commBody} onChange={e => setCommBody(e.target.value)} placeholder="Write your message to all registered attendees..." rows={5} className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none" />
              </div>
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-muted-foreground">{detail?.totalSold ?? 0} attendee{detail?.totalSold !== 1 ? "s" : ""} will receive this message</p>
                <Button size="sm" onClick={() => sendCommMutation.mutate()} disabled={!commSubject || !commBody || sendCommMutation.isPending}>
                  {sendCommMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />} Send Message
                </Button>
              </div>
            </CardContent>
          </Card>

          {detail?.communications && detail.communications.length > 0 ? (
            <Card className="border-white/10 bg-card/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-white">Message History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {detail.communications.map(comm => (
                    <div key={comm.id} className="p-3 rounded-lg bg-white/5 border border-white/8">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-white">{comm.subject}</p>
                        <p className="text-xs text-muted-foreground whitespace-nowrap">{new Date(comm.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{comm.body}</p>
                      <p className="text-xs text-muted-foreground mt-1">{comm.recipientCount} recipient{comm.recipientCount !== 1 ? "s" : ""}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
              <MessageSquare className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No messages sent yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Messages you send to attendees will appear here</p>
            </div>
          )}
        </div>
      )}

      <AddSaleDialog open={addingSale} onClose={() => setAddingSale(false)} eventId={id} ticketTypes={detail?.ticketTypes ?? []} />
      <AddTicketTypeDialog open={addingTicketType} onClose={() => setAddingTicketType(false)} eventId={id} />
      <RejectDialog
        open={!!rejectingId}
        onClose={() => setRejectingId(null)}
        onConfirm={(reason) => rejectingId && rejectRegMutation.mutate({ regId: rejectingId, reason })}
        isPending={rejectRegMutation.isPending}
      />
    </div>
  );
}