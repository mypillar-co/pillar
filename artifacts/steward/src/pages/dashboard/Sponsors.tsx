import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Star, Search, Mail, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type Sponsor } from "@/lib/api";

function AddSponsorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", phone: "", website: "", notes: "" });
  const mutation = useMutation({
    mutationFn: () => api.sponsors.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sponsors"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Sponsor added");
      onClose();
      setForm({ name: "", email: "", phone: "", website: "", notes: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: string) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[hsl(224,30%,14%)] border-white/10 text-white max-w-md">
        <DialogHeader><DialogTitle>Add Sponsor</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-slate-300">Sponsor Name *</Label>
            <Input value={form.name} onChange={e => set("name")(e.target.value)} placeholder="Acme Corp" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Email</Label>
              <Input type="email" value={form.email} onChange={e => set("email")(e.target.value)} placeholder="sponsor@acme.com" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Website</Label>
              <Input value={form.website} onChange={e => set("website")(e.target.value)} placeholder="https://acme.com" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes")(e.target.value)} rows={2} className="bg-white/5 border-white/10 text-white resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-slate-300">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending}>
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Add Sponsor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Sponsors() {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const { data: sponsors = [], isLoading } = useQuery({ queryKey: ["sponsors"], queryFn: api.sponsors.list });
  const filtered = sponsors.filter((s: Sponsor) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sponsors</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{sponsors.length} sponsor{sponsors.length !== 1 ? "s" : ""} in your organization</p>
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-2" /> Add Sponsor</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sponsors..." className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
          <Star className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">{search ? "No sponsors match your search" : "No sponsors yet"}</p>
          {!search && <Button size="sm" className="mt-4" onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-2" /> Add your first sponsor</Button>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((sponsor: Sponsor) => (
            <div key={sponsor.id} className="flex items-center justify-between p-4 border border-white/8 bg-card/50 rounded-xl">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  {sponsor.logoUrl ? <img src={sponsor.logoUrl} alt={sponsor.name} className="w-8 h-8 object-contain rounded" /> : <Star className="w-5 h-5 text-amber-400" />}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{sponsor.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {sponsor.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{sponsor.email}</span>}
                    {sponsor.website && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Globe className="w-3 h-3" />{sponsor.website.replace(/^https?:\/\//, "")}</span>}
                  </div>
                </div>
              </div>
              <Badge variant="outline" className={`text-xs capitalize flex-shrink-0 ${sponsor.status === "active" ? "border-emerald-500/30 text-emerald-400" : "border-white/20 text-slate-400"}`}>{sponsor.status}</Badge>
            </div>
          ))}
        </div>
      )}
      <AddSponsorDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
