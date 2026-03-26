import React, { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Calendar, MapPin, Search, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type EventItem } from "@/lib/api";

const EVENT_TYPES = ["festival", "mixer", "fundraiser", "meeting", "market", "conference", "workshop", "other"];
const STATUS_COLORS: Record<string, string> = {
  draft: "border-white/20 text-slate-400",
  published: "border-emerald-500/30 text-emerald-400",
  active: "border-blue-500/30 text-blue-400",
  completed: "border-slate-500/30 text-slate-500",
  cancelled: "border-red-500/30 text-red-400",
};

function CreateEventDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", eventType: "", startDate: "", endDate: "", startTime: "", location: "" });
  const mutation = useMutation({
    mutationFn: () => api.events.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Event created");
      onClose();
      setForm({ name: "", description: "", eventType: "", startDate: "", endDate: "", startTime: "", location: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: string) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[hsl(224,30%,14%)] border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Event</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-slate-300">Event Name *</Label>
            <Input
              value={form.name}
              onChange={e => set("name")(e.target.value)}
              placeholder="Summer Festival 2026"
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Type</Label>
              <Select value={form.eventType} onValueChange={set("eventType")}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                  {EVENT_TYPES.map(t => <SelectItem key={t} value={t} className="text-white capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Location</Label>
              <Input
                value={form.location}
                onChange={e => set("location")(e.target.value)}
                placeholder="City Hall Park"
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Start Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={e => set("startDate")(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Start Time</Label>
              <Input
                type="time"
                value={form.startTime}
                onChange={e => set("startTime")(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">Description</Label>
            <Textarea
              value={form.description}
              onChange={e => set("description")(e.target.value)}
              placeholder="What's this event about?"
              rows={3}
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-slate-300">Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.name || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Events() {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const { data: events = [], isLoading } = useQuery({ queryKey: ["events"], queryFn: api.events.list });
  const filtered = events.filter((e: EventItem) => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Events</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your organization's events</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4 mr-2" /> New Event
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search events..."
          className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
          <Calendar className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">{search ? "No events match your search" : "No events yet"}</p>
          {!search && (
            <Button size="sm" className="mt-4" onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4 mr-2" /> Create your first event
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((event: EventItem) => (
            <Link key={event.id} href={`/dashboard/events/${event.id}`}>
              <div className="flex items-center justify-between p-4 border border-white/8 bg-card/50 rounded-xl hover:bg-white/5 hover:border-white/15 cursor-pointer transition-all group">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{event.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {event.startDate && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {event.startTime && ` at ${event.startTime}`}
                        </span>
                      )}
                      {event.location && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" /> {event.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {event.eventType && (
                    <span className="text-xs text-muted-foreground capitalize hidden sm:block">{event.eventType}</span>
                  )}
                  <Badge variant="outline" className={`text-xs capitalize ${STATUS_COLORS[event.status] ?? "border-white/20 text-slate-400"}`}>
                    {event.status}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <CreateEventDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
