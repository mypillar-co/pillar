import React, { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, RefreshCw, Loader2, Sparkles, Trash2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api, type RecurringTemplate } from "@/lib/api";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKS_OF_MONTH = [
  { value: "1", label: "1st" },
  { value: "2", label: "2nd" },
  { value: "3", label: "3rd" },
  { value: "4", label: "4th" },
];
const EVENT_TYPES = ["festival", "mixer", "fundraiser", "meeting", "market", "conference", "workshop", "other"];

function frequencyLabel(template: RecurringTemplate): string {
  if (template.frequency === "weekly" && template.dayOfWeek != null) {
    return `Every ${DAYS_OF_WEEK[template.dayOfWeek]}`;
  }
  if (template.frequency === "biweekly" && template.dayOfWeek != null) {
    return `Every other ${DAYS_OF_WEEK[template.dayOfWeek]}`;
  }
  if (template.frequency === "monthly") {
    if (template.weekOfMonth != null && template.dayOfWeek != null) {
      const week = WEEKS_OF_MONTH.find(w => w.value === String(template.weekOfMonth))?.label ?? "";
      return `${week} ${DAYS_OF_WEEK[template.dayOfWeek]} of the month`;
    }
    if (template.dayOfMonth != null) {
      return `Monthly on the ${template.dayOfMonth}th`;
    }
  }
  return template.frequency;
}

function CreateTemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "", description: "", eventType: "", location: "", startTime: "", durationMinutes: "",
    frequency: "monthly", dayOfWeek: "", weekOfMonth: "", dayOfMonth: "",
  });

  const mutation = useMutation({
    mutationFn: () => api.events.recurring.create({
      name: form.name,
      description: form.description || undefined,
      eventType: form.eventType || undefined,
      location: form.location || undefined,
      startTime: form.startTime || undefined,
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
      frequency: form.frequency,
      dayOfWeek: form.dayOfWeek !== "" ? Number(form.dayOfWeek) : undefined,
      weekOfMonth: form.weekOfMonth !== "" ? Number(form.weekOfMonth) : undefined,
      dayOfMonth: form.dayOfMonth !== "" ? Number(form.dayOfMonth) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-templates"] });
      toast.success("Recurring schedule created");
      onClose();
      setForm({ name: "", description: "", eventType: "", location: "", startTime: "", durationMinutes: "", frequency: "monthly", dayOfWeek: "", weekOfMonth: "", dayOfMonth: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[hsl(224,30%,14%)] border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Recurring Schedule</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-slate-300">Event Name *</Label>
            <Input value={form.name} onChange={e => set("name")(e.target.value)} placeholder="Monthly Board Meeting" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">Description</Label>
            <Textarea value={form.description} onChange={e => set("description")(e.target.value)} placeholder="Base description (AI will expand on this for each event)" rows={2} className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none" />
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
              <Input value={form.location} onChange={e => set("location")(e.target.value)} placeholder="Meeting Hall" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Start Time</Label>
              <Input type="time" value={form.startTime} onChange={e => set("startTime")(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Duration (minutes)</Label>
              <Input type="number" value={form.durationMinutes} onChange={e => set("durationMinutes")(e.target.value)} placeholder="90" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-white/8">
            <Label className="text-slate-300">Frequency</Label>
            <Select value={form.frequency} onValueChange={set("frequency")}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                <SelectItem value="weekly" className="text-white">Weekly</SelectItem>
                <SelectItem value="biweekly" className="text-white">Bi-weekly</SelectItem>
                <SelectItem value="monthly" className="text-white">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(form.frequency === "weekly" || form.frequency === "biweekly") && (
            <div className="space-y-1.5">
              <Label className="text-slate-300">Day of Week</Label>
              <Select value={form.dayOfWeek} onValueChange={set("dayOfWeek")}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                  {DAYS_OF_WEEK.map((d, i) => <SelectItem key={d} value={String(i)} className="text-white">{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.frequency === "monthly" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Week of Month</Label>
                <Select value={form.weekOfMonth} onValueChange={v => { set("weekOfMonth")(v); set("dayOfMonth")(""); }}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="e.g. 2nd" />
                  </SelectTrigger>
                  <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                    {WEEKS_OF_MONTH.map(w => <SelectItem key={w.value} value={w.value} className="text-white">{w.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.weekOfMonth ? (
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Day of Week</Label>
                  <Select value={form.dayOfWeek} onValueChange={set("dayOfWeek")}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                      {DAYS_OF_WEEK.map((d, i) => <SelectItem key={d} value={String(i)} className="text-white">{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Day of Month</Label>
                  <Input type="number" min="1" max="31" value={form.dayOfMonth} onChange={e => { set("dayOfMonth")(e.target.value); set("weekOfMonth")(""); }} placeholder="15" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-slate-300">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || !form.frequency || mutation.isPending}>
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RecurringTemplates() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["recurring-templates"],
    queryFn: () => api.events.recurring.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.events.recurring.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-templates"] });
      toast.success("Schedule deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateMutation = useMutation({
    mutationFn: (id: string) => {
      setGeneratingId(id);
      return api.events.recurring.generate(id);
    },
    onSuccess: (event) => {
      qc.invalidateQueries({ queryKey: ["recurring-templates"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success(`Event "${event.name}" created with AI description`);
      setGeneratingId(null);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setGeneratingId(null);
    },
  });

  const items = templates as RecurringTemplate[];

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/events">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Recurring Schedules</h1>
            <p className="text-sm text-muted-foreground mt-0.5">AI automatically creates events from your schedule templates</p>
          </div>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4 mr-2" /> New Schedule
        </Button>
      </div>

      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-white">AI-Powered Recurring Events</p>
          <p className="text-xs text-slate-400 mt-0.5">Define a template once. When you click Generate, the AI writes a unique description for each occurrence and creates a draft event ready to review and publish.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
          <RefreshCw className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No recurring schedules yet</p>
          <Button size="sm" className="mt-4" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create your first schedule
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(template => (
            <Card key={template.id} className="border-white/10 bg-card/60">
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div className="min-w-0">
                  <CardTitle className="text-base text-white flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-primary flex-shrink-0" />
                    {template.name}
                    <Badge variant="outline" className={`text-xs ml-1 ${template.isActive ? "border-emerald-500/30 text-emerald-400" : "border-white/20 text-slate-400"}`}>
                      {template.isActive ? "Active" : "Paused"}
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{frequencyLabel(template)}{template.startTime && ` at ${template.startTime}`}{template.location && ` · ${template.location}`}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateMutation.mutate(template.id)}
                    disabled={generatingId === template.id}
                    className="border-primary/30 text-primary hover:bg-primary/10 h-8 text-xs"
                  >
                    {generatingId === template.id ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating...</>
                    ) : (
                      <><Play className="w-3.5 h-3.5 mr-1.5" /> Generate Next</>
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    onClick={() => { if (confirm("Delete this schedule?")) deleteMutation.mutate(template.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {template.description && (
                  <p className="text-sm text-slate-400 line-clamp-2">{template.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2">
                  {template.durationMinutes && (
                    <p className="text-xs text-muted-foreground">{template.durationMinutes} min</p>
                  )}
                  {template.eventType && (
                    <p className="text-xs text-muted-foreground capitalize">{template.eventType}</p>
                  )}
                  {template.lastGeneratedAt && (
                    <p className="text-xs text-muted-foreground">
                      Last generated {new Date(template.lastGeneratedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  )}
                  {template.nextGenerateAt && (
                    <p className="text-xs text-primary">
                      Next: {new Date(template.nextGenerateAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateTemplateDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
