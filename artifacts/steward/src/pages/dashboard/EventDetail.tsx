import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Calendar, MapPin, Edit2, Save, X, Loader2, Trash2,
  Ticket, DollarSign, Users, Send, CheckCircle, XCircle, Plus, MessageSquare,
  RefreshCw,
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
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="General admission" />
                </SelectTrigger>
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
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
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

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<EventItem>>({});
  const [addingSale, setAddingSale] = useState(false);
  const [addingTicketType, setAddingTicketType] = useState(false);
  const [commSubject, setCommSubject] = useState("");
  const [commBody, setCommBody] = useState("");
  const [approvalComment, setApprovalComment] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api.events.get(id),
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
      toast.success("Communication logged");
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Event not found</p>
        <Link href="/dashboard/events">
          <Button variant="outline" className="mt-4 border-white/10">Back to Events</Button>
        </Link>
      </div>
    );
  }

  const hasPendingApproval = detail?.approvals?.some(a => a.status === "pending");
  const canSubmit = event.status === "draft" && !hasPendingApproval;
  const canApproveReject = event.status === "pending_approval" && hasPendingApproval;

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      {/* Back + Title */}
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
            <Badge variant="outline" className={`mt-1 text-xs ${STATUS_COLORS[event.status] ?? ""}`}>
              {STATUS_LABELS[event.status] ?? event.status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tickets Sold", value: detail?.totalSold ?? 0, icon: Users },
          { label: "Revenue", value: `$${(detail?.totalRevenue ?? 0).toFixed(2)}`, icon: DollarSign },
          { label: "Communications", value: detail?.communications?.length ?? 0, icon: MessageSquare },
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

      {/* Approval Panel */}
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

      {/* Event Details Card */}
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

      {/* Attendees */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Attendees ({detail?.totalSold ?? 0})
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAddingSale(true)} className="border-white/10 text-slate-300 h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Record Sale
          </Button>
        </CardHeader>
        <CardContent>
          {!detail?.sales?.length ? (
            <p className="text-sm text-muted-foreground">No ticket sales recorded yet.</p>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-12 gap-2 px-2 mb-1">
                <p className="col-span-4 text-xs text-muted-foreground">Name</p>
                <p className="col-span-3 text-xs text-muted-foreground">Email</p>
                <p className="col-span-2 text-xs text-muted-foreground">Qty</p>
                <p className="col-span-2 text-xs text-muted-foreground">Paid</p>
                <p className="col-span-1" />
              </div>
              {detail.sales.map((sale: TicketSale) => (
                <div key={sale.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-white/5 border border-white/8">
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
        </CardContent>
      </Card>

      {/* Communications */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" /> Attendee Communications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 p-3 rounded-lg bg-white/5 border border-white/8">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Subject</Label>
              <Input value={commSubject} onChange={e => setCommSubject(e.target.value)} placeholder="Important update about your event" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Message</Label>
              <Textarea value={commBody} onChange={e => setCommBody(e.target.value)} placeholder="Write your message to all registered attendees..." rows={4} className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none" />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{detail?.totalSold ?? 0} attendee{detail?.totalSold !== 1 ? "s" : ""} will be notified</p>
              <Button size="sm" onClick={() => sendCommMutation.mutate()} disabled={!commSubject || !commBody || sendCommMutation.isPending}>
                {sendCommMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />} Send
              </Button>
            </div>
          </div>
          {detail?.communications && detail.communications.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sent Messages</p>
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

      <AddSaleDialog open={addingSale} onClose={() => setAddingSale(false)} eventId={id} ticketTypes={detail?.ticketTypes ?? []} />
      <AddTicketTypeDialog open={addingTicketType} onClose={() => setAddingTicketType(false)} eventId={id} />
    </div>
  );
}
