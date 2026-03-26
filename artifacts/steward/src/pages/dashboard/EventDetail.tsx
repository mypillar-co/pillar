import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Calendar, MapPin, Edit2, Save, X, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { api, type EventItem } from "@/lib/api";

const STATUS_OPTIONS = ["draft", "published", "active", "completed", "cancelled"];
const STATUS_COLORS: Record<string, string> = {
  draft: "border-white/20 text-slate-400",
  published: "border-emerald-500/30 text-emerald-400",
  active: "border-blue-500/30 text-blue-400",
  completed: "border-slate-500/30 text-slate-500",
  cancelled: "border-red-500/30 text-red-400",
};

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<EventItem>>({});

  const { data: event, isLoading } = useQuery({
    queryKey: ["events", id],
    queryFn: () => api.events.get(id),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: () => api.events.update(id, form),
    onSuccess: (updated) => {
      qc.setQueryData(["events", id], updated);
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

  const startEditing = () => {
    setForm({
      name: event?.name,
      description: event?.description ?? "",
      eventType: event?.eventType ?? "",
      status: event?.status,
      startDate: event?.startDate ?? "",
      endDate: event?.endDate ?? "",
      startTime: event?.startTime ?? "",
      endTime: event?.endTime ?? "",
      location: event?.location ?? "",
    });
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
            <h1 className="text-xl font-bold text-white truncate">{event.name}</h1>
            <Badge variant="outline" className={`mt-1 text-xs capitalize ${STATUS_COLORS[event.status] ?? ""}`}>
              {event.status}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="text-slate-400">
                <X className="w-4 h-4 mr-1.5" /> Cancel
              </Button>
              <Button size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={startEditing} className="border-white/10 text-slate-300">
                <Edit2 className="w-4 h-4 mr-1.5" /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { if (confirm("Delete this event?")) deleteMutation.mutate(); }}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Details Card */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-white">Event Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Event Name</Label>
                <Input value={form.name ?? ""} onChange={e => set("name")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Status</Label>
                  <Select value={form.status} onValueChange={set("status")}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                      {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s} className="text-white capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Location</Label>
                  <Input value={form.location ?? ""} onChange={e => set("location")(e.target.value)} className="bg-white/5 border-white/10 text-white" placeholder="Venue / address" />
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
                    {event.startDate
                      ? new Date(event.startDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
                      : "Not set"}
                    {event.startTime && ` at ${event.startTime}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Location</p>
                  <p className="text-sm text-white">{event.location || "Not set"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Type</p>
                  <p className="text-sm text-white capitalize">{event.eventType || "Not set"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Ticketed</p>
                  <p className="text-sm text-white">{event.isTicketed ? `Yes — $${event.ticketPrice}` : "No"}</p>
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

      {/* Metadata */}
      <p className="text-xs text-muted-foreground text-right">
        Created {new Date(event.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </p>
    </div>
  );
}
