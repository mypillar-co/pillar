import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, Search, Mail, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type Vendor } from "@/lib/api";

const VENDOR_TYPES = ["food", "merchandise", "entertainment", "service", "nonprofit", "other"];

function AddVendorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", vendorType: "", email: "", phone: "", notes: "" });
  const mutation = useMutation({
    mutationFn: () => api.vendors.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Vendor added");
      onClose();
      setForm({ name: "", vendorType: "", email: "", phone: "", notes: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: string) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[hsl(224,30%,14%)] border-white/10 text-white max-w-md">
        <DialogHeader><DialogTitle>Add Vendor</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-slate-300">Vendor Name *</Label>
            <Input value={form.name} onChange={e => set("name")(e.target.value)} placeholder="Joe's Food Truck" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">Type</Label>
            <Select value={form.vendorType} onValueChange={set("vendorType")}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                {VENDOR_TYPES.map(t => <SelectItem key={t} value={t} className="text-white capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Email</Label>
              <Input type="email" value={form.email} onChange={e => set("email")(e.target.value)} placeholder="contact@vendor.com" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Phone</Label>
              <Input value={form.phone} onChange={e => set("phone")(e.target.value)} placeholder="+1 555 000 0000" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
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
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Add Vendor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Vendors() {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const { data: vendors = [], isLoading } = useQuery({ queryKey: ["vendors"], queryFn: api.vendors.list });
  const filtered = vendors.filter((v: Vendor) => v.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Vendors</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{vendors.length} vendor{vendors.length !== 1 ? "s" : ""} in your organization</p>
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-2" /> Add Vendor</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors..." className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
          <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">{search ? "No vendors match your search" : "No vendors yet"}</p>
          {!search && <Button size="sm" className="mt-4" onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-2" /> Add your first vendor</Button>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((vendor: Vendor) => (
            <div key={vendor.id} className="flex items-center justify-between p-4 border border-white/8 bg-card/50 rounded-xl">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{vendor.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {vendor.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{vendor.email}</span>}
                    {vendor.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{vendor.phone}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {vendor.vendorType && <span className="text-xs text-muted-foreground capitalize hidden sm:block">{vendor.vendorType}</span>}
                <Badge variant="outline" className={`text-xs capitalize ${vendor.status === "active" ? "border-emerald-500/30 text-emerald-400" : "border-white/20 text-slate-400"}`}>{vendor.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
      <AddVendorDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
