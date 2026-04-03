import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Contact2, Search, Mail, Phone, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type ContactItem } from "@/lib/api";

const CONTACT_TYPES = ["general", "vendor_rep", "sponsor_rep", "attendee", "member", "board"];

function AddContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", contactType: "" });
  const mutation = useMutation({
    mutationFn: () => api.contacts.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Contact added");
      onClose();
      setForm({ firstName: "", lastName: "", email: "", phone: "", company: "", contactType: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: string) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[hsl(224,30%,14%)] border-white/10 text-white max-w-md">
        <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">First Name *</Label>
              <Input value={form.firstName} onChange={e => set("firstName")(e.target.value)} placeholder="Jane" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Last Name</Label>
              <Input value={form.lastName} onChange={e => set("lastName")(e.target.value)} placeholder="Smith" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Email</Label>
              <Input type="email" value={form.email} onChange={e => set("email")(e.target.value)} placeholder="jane@example.com" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Phone</Label>
              <Input value={form.phone} onChange={e => set("phone")(e.target.value)} placeholder="+1 555 000 0000" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Company</Label>
              <Input value={form.company} onChange={e => set("company")(e.target.value)} placeholder="Acme Corp" className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Type</Label>
              <Select value={form.contactType} onValueChange={set("contactType")}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                  {CONTACT_TYPES.map(t => <SelectItem key={t} value={t} className="text-white capitalize">{t.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 text-slate-300">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.firstName || mutation.isPending}>
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Add Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Contacts() {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const { data: contacts = [], isLoading } = useQuery({ queryKey: ["contacts"], queryFn: api.contacts.list });
  const filtered = contacts.filter((c: ContactItem) => 
    `${c.firstName} ${c.lastName ?? ""} ${c.email ?? ""} ${c.company ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{contacts.length} contact{contacts.length !== 1 ? "s" : ""} in your database</p>
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-2" /> Add Contact</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..." className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
          <Contact2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">{search ? "No contacts match your search" : "No contacts yet"}</p>
          {!search && <Button size="sm" className="mt-4" onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-2" /> Add your first contact</Button>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((contact: ContactItem) => (
            <div key={contact.id} className="flex items-center justify-between p-4 border border-white/8 bg-card/50 rounded-xl">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-semibold text-sm">
                  {contact.firstName[0]}{contact.lastName?.[0] ?? ""}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-white">{contact.firstName} {contact.lastName}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                    {contact.company && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Building2 className="w-3 h-3" /><span className="truncate max-w-[120px]">{contact.company}</span></span>}
                    {contact.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" /><span className="truncate max-w-[160px]">{contact.email}</span></span>}
                    {contact.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{contact.phone}</span>}
                  </div>
                </div>
              </div>
              {contact.contactType && (
                <span className="text-xs text-muted-foreground capitalize flex-shrink-0 hidden sm:block">{contact.contactType.replace(/_/g, " ")}</span>
              )}
            </div>
          ))}
        </div>
      )}
      <AddContactDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
