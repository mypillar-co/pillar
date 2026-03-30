import React, { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Calendar, MapPin, Search, ChevronRight, Loader2,
  Ticket, DollarSign, Clock, CheckCircle, Inbox, RefreshCw, Lock,
  Link2, Copy, ExternalLink, CalendarPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useGetSubscription } from "@workspace/api-client-react";
import { api, type EventItem, type EventMetrics } from "@/lib/api";

const EVENT_TYPES = ["festival", "mixer", "fundraiser", "meeting", "market", "conference", "workshop", "other"];

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

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: string | number; icon: React.ElementType; sub?: string }) {
  return (
    <Card className="border-white/10 bg-card/60">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-primary" />
          </div>
        </div>
        <p className="text-xl font-bold text-white">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function CreateEventDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "", description: "", eventType: "", startDate: "", endDate: "",
    startTime: "", endTime: "", location: "", maxCapacity: "", isTicketed: false, ticketPrice: "",
    requiresApproval: false,
  });
  const mutation = useMutation({
    mutationFn: () => api.events.create({
      name: form.name,
      description: form.description || undefined,
      eventType: form.eventType || undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      location: form.location || undefined,
      maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : undefined,
      isTicketed: form.isTicketed,
      ticketPrice: form.ticketPrice ? Number(form.ticketPrice) : undefined,
      requiresApproval: form.requiresApproval,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["event-metrics"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Event created");
      onClose();
      setForm({ name: "", description: "", eventType: "", startDate: "", endDate: "", startTime: "", endTime: "", location: "", maxCapacity: "", isTicketed: false, ticketPrice: "", requiresApproval: false });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const setStr = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  const setBool = (k: keyof typeof form) => (v: boolean) => setForm(p => ({ ...p, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[hsl(224,30%,14%)] border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Event</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-slate-300">Event Name *</Label>
            <Input value={form.name} onChange={e => setStr("name")(e.target.value)} placeholder="Summer Festival 2026" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Type</Label>
              <Select value={form.eventType} onValueChange={setStr("eventType")}>
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
              <Input value={form.location} onChange={e => setStr("location")(e.target.value)} placeholder="City Hall Park" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Start Date</Label>
              <Input type="date" value={form.startDate} onChange={e => setStr("startDate")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Start Time</Label>
              <Input type="time" value={form.startTime} onChange={e => setStr("startTime")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">End Date</Label>
              <Input type="date" value={form.endDate} onChange={e => setStr("endDate")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Max Capacity</Label>
              <Input type="number" value={form.maxCapacity} onChange={e => setStr("maxCapacity")(e.target.value)} placeholder="200" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">Description</Label>
            <Textarea value={form.description} onChange={e => setStr("description")(e.target.value)} placeholder="What's this event about?" rows={3} className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none" />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/8">
            <div>
              <p className="text-sm text-white">Ticketed Event</p>
              <p className="text-xs text-muted-foreground">Track ticket sales for this event</p>
            </div>
            <Switch checked={form.isTicketed} onCheckedChange={setBool("isTicketed")} />
          </div>
          {form.isTicketed && (
            <div className="space-y-1.5">
              <Label className="text-slate-300">Default Ticket Price ($)</Label>
              <Input type="number" step="0.01" value={form.ticketPrice} onChange={e => setStr("ticketPrice")(e.target.value)} placeholder="25.00" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
          )}
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/8">
            <div>
              <p className="text-sm text-white">Requires Approval</p>
              <p className="text-xs text-muted-foreground">Events must be approved before publishing</p>
            </div>
            <Switch checked={form.requiresApproval} onCheckedChange={setBool("requiresApproval")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-slate-300">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending}>
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { data: subscription } = useGetSubscription();
  const tier = subscription?.tierId;
  const isTier3 = tier === "tier3";

  const { data: orgData } = useQuery<{ slug: string; name: string }>({
    queryKey: ["org-info"],
    queryFn: () => fetch("/api/organizations", { credentials: "include" }).then(r => r.json()),
  });

  const hasEventAccess = tier === "tier2" || tier === "tier3";

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.events.list(),
    enabled: hasEventAccess,
  });
  const { data: metrics } = useQuery({
    queryKey: ["event-metrics"],
    queryFn: () => api.events.metrics(),
    enabled: tier === "tier2" || tier === "tier3",
  });
  const { data: approvalQueue = [] } = useQuery({
    queryKey: ["approval-queue"],
    queryFn: () => api.events.approvalQueue(),
    enabled: tier === "tier2" || tier === "tier3",
  });

  const filtered = (events as EventItem[]).filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const m = metrics as EventMetrics | undefined;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Events</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your organization's events and track attendance</p>
        </div>
        <div className="flex items-center gap-2">
          {hasEventAccess && approvalQueue.length > 0 && (
            <Link href="/dashboard/events/approvals">
              <Button variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300">
                <Inbox className="w-4 h-4 mr-2" />
                Approvals ({approvalQueue.length})
              </Button>
            </Link>
          )}
          {isTier3 && (
            <Link href="/dashboard/events/recurring">
              <Button variant="outline" className="border-white/10 text-slate-300 hover:bg-white/5">
                <RefreshCw className="w-4 h-4 mr-2" /> Recurring
              </Button>
            </Link>
          )}
          {hasEventAccess && orgData?.slug && (
            <Button variant="outline" onClick={() => setCalendarOpen(v => !v)} className="border-white/10 text-slate-300 hover:bg-white/5">
              <CalendarPlus className="w-4 h-4 mr-2" /> Subscribe
            </Button>
          )}
          {hasEventAccess && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Event
            </Button>
          )}
        </div>
      </div>

      {/* Tier gate — shown for Tier 1 / no-plan users */}
      {subscription !== undefined && !hasEventAccess && (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-amber-500/30 rounded-xl bg-amber-500/5">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Event Management requires the Events plan</h3>
          <p className="text-sm text-muted-foreground mb-5 text-center max-w-sm">
            Upgrade to the Events plan ($99/mo) to create events, sell tickets, and track attendance.
          </p>
          <Link href="/billing">
            <Button className="bg-amber-500 hover:bg-amber-400 text-black font-semibold">
              Upgrade Now
            </Button>
          </Link>
        </div>
      )}

      {/* Calendar subscribe panel (header button trigger, no upcoming events case) */}
      {calendarOpen && orgData?.slug && !(m && m.upcomingEvents.length > 0) && (() => {
        const feedUrl = `${window.location.origin}/api/events/public/calendar/${orgData.slug}`;
        const webcalUrl = feedUrl.replace(/^https?:\/\//, "webcal://");
        const googleUrl = `https://www.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;
        return (
          <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary flex-shrink-0" />
              <p className="text-sm font-medium text-white">Calendar Sync</p>
              <p className="text-xs text-muted-foreground">— stays up-to-date automatically</p>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/5 border border-white/10">
              <code className="flex-1 text-xs text-slate-300 truncate select-all">{feedUrl}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(feedUrl); toast.success("Feed URL copied"); }}
                className="flex-shrink-0 text-slate-400 hover:text-white transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={googleUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 hover:bg-white/12 text-xs text-white transition-colors">
                <ExternalLink className="w-3.5 h-3.5" />Add to Google Calendar
              </a>
              <a href={webcalUrl}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 hover:bg-white/12 text-xs text-white transition-colors">
                <Calendar className="w-3.5 h-3.5" />Add to Apple / Outlook
              </a>
              <a href={feedUrl} download={`${orgData.slug}-events.ics`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 hover:bg-white/12 text-xs text-white transition-colors">
                <CalendarPlus className="w-3.5 h-3.5" />Download .ics file
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this link with members so they can subscribe in their own calendar app. Syncs automatically.
            </p>
          </div>
        );
      })()}

      {/* Metrics */}
      {m && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Events" value={m.totalEvents} icon={Calendar} />
          <StatCard label="Published" value={m.publishedEvents} icon={CheckCircle} />
          <StatCard label="All-Time Tickets" value={m.totalTicketsSold} icon={Ticket} sub={`${m.thisMonthTicketsSold} this month`} />
          <StatCard label="Total Revenue" value={`$${m.totalRevenue.toFixed(2)}`} icon={DollarSign} />
        </div>
      )}

      {/* Upcoming mini-calendar */}
      {m && m.upcomingEvents.length > 0 && (
        <div className="p-4 rounded-xl border border-white/8 bg-card/40">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Upcoming</p>
            {orgData?.slug && (
              <button
                onClick={() => setCalendarOpen(v => !v)}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                Subscribe to Calendar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {m.upcomingEvents.map(e => (
              <Link key={e.id} href={`/dashboard/events/${e.id}`}>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/8 hover:bg-white/10 cursor-pointer transition-all">
                  <Clock className="w-3 h-3 text-primary flex-shrink-0" />
                  <span className="text-xs text-white">{e.name}</span>
                  {e.startDate && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Calendar subscribe panel */}
          {calendarOpen && orgData?.slug && (() => {
            const feedUrl = `${window.location.origin}/api/events/public/calendar/${orgData.slug}`;
            const webcalUrl = feedUrl.replace(/^https?:\/\//, "webcal://");
            const googleUrl = `https://www.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;
            return (
              <div className="mt-4 p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary flex-shrink-0" />
                  <p className="text-sm font-medium text-white">Calendar Sync</p>
                  <p className="text-xs text-muted-foreground">— stays up-to-date automatically</p>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/5 border border-white/10">
                  <code className="flex-1 text-xs text-slate-300 truncate select-all">{feedUrl}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(feedUrl); toast.success("Feed URL copied"); }}
                    className="flex-shrink-0 text-slate-400 hover:text-white transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={googleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 hover:bg-white/12 text-xs text-white transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Add to Google Calendar
                  </a>
                  <a
                    href={webcalUrl}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 hover:bg-white/12 text-xs text-white transition-colors"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Add to Apple / Outlook
                  </a>
                  <a
                    href={feedUrl}
                    download={`${orgData.slug}-events.ics`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 hover:bg-white/12 text-xs text-white transition-colors"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                    Download .ics file
                  </a>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your published events sync automatically every hour. Share this link with members so they can subscribe in their own calendar app.
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* Filters + Event List (only for tier2+ users) */}
      {hasEventAccess && (
        <>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events..." className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                <SelectItem value="all" className="text-white">All statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-white">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Event List */}
          {eventsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
              <Calendar className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">{search || statusFilter !== "all" ? "No events match your filter" : "No events yet"}</p>
              {!search && statusFilter === "all" && (
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
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-white truncate">{event.name}</p>
                          {event.isRecurring && <RefreshCw className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                        </div>
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
                      {event.isTicketed && (event.totalSold != null && event.totalSold > 0) && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground hidden md:flex">
                          <Ticket className="w-3 h-3" /> {event.totalSold}
                        </span>
                      )}
                      {event.isTicketed && (event.totalRevenue != null && event.totalRevenue > 0) && (
                        <span className="flex items-center gap-1 text-xs text-emerald-500 hidden md:flex">
                          <DollarSign className="w-3 h-3" /> {event.totalRevenue.toFixed(0)}
                        </span>
                      )}
                      {event.eventType && <span className="text-xs text-muted-foreground capitalize hidden sm:block">{event.eventType}</span>}
                      <Badge variant="outline" className={`text-xs ${STATUS_COLORS[event.status] ?? "border-white/20 text-slate-400"}`}>
                        {STATUS_LABELS[event.status] ?? event.status}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <CreateEventDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
