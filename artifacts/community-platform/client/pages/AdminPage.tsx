import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useConfig } from "../config-context";
import { apiFetch } from "../lib/api";

type Tab = "events" | "sponsors" | "businesses" | "blog" | "messages" | "newsletter";

export default function AdminPage() {
  const config = useConfig();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("events");
  const qc = useQueryClient();

  const { data: user, isLoading: authLoading } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await apiFetch("/api/auth/me");
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/admin/login");
  }, [user, authLoading]);

  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setLocation("/admin/login");
  };

  if (authLoading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" /></div>;
  if (!user) return null;

  const tabs: { id: Tab; label: string; show?: boolean }[] = [
    { id: "events", label: "Events" },
    { id: "sponsors", label: "Sponsors", show: !!config?.features?.sponsors || true },
    { id: "businesses", label: "Directory", show: !!config?.features?.businessDirectory },
    { id: "blog", label: "Blog / News", show: !!config?.features?.blog },
    { id: "messages", label: "Messages" },
    { id: "newsletter", label: "Newsletter", show: !!config?.features?.newsletter },
  ].filter(t => t.show !== false);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-serif">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm">{config?.orgName}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Hello, {user.username}</span>
          <button onClick={logout} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50">Sign Out</button>
        </div>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? "border-current" : "border-transparent text-gray-500 hover:text-gray-800"}`}
              style={activeTab === tab.id ? { color: "var(--primary-hex)", borderColor: "var(--primary-hex)" } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "events" && <EventsAdmin />}
      {activeTab === "sponsors" && <SponsorsAdmin />}
      {activeTab === "businesses" && <BusinessesAdmin />}
      {activeTab === "blog" && <BlogAdmin />}
      {activeTab === "messages" && <MessagesAdmin />}
      {activeTab === "newsletter" && <NewsletterAdmin />}
    </div>
  );
}

function EventsAdmin() {
  const qc = useQueryClient();
  const { data: events } = useQuery<any[]>({ queryKey: ["/api/events"], queryFn: async () => { const r = await apiFetch("/api/events?all=true"); return r.json(); } });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({ title: "", description: "", date: "", time: "", location: "", category: "Community", featured: false, isActive: true, isTicketed: false });

  const save = async () => {
    const method = editingId ? "PATCH" : "POST";
    const url = editingId ? `/api/admin/events/${editingId}` : "/api/admin/events";
    await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    qc.invalidateQueries({ queryKey: ["/api/events"] });
    setShowForm(false); setEditingId(null);
    setForm({ title: "", description: "", date: "", time: "", location: "", category: "Community", featured: false, isActive: true, isTicketed: false });
  };

  const del = async (id: number) => {
    if (!confirm("Delete this event?")) return;
    await apiFetch(`/api/admin/events/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["/api/events"] });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Events ({events?.length || 0})</h2>
        <button onClick={() => { setShowForm(true); setEditingId(null); }} className="px-4 py-2 text-white text-sm rounded-md" style={{ backgroundColor: "var(--primary-hex)" }}>+ Add Event</button>
      </div>

      {showForm && (
        <div className="border border-gray-200 rounded-lg p-5 mb-6 bg-gray-50">
          <h3 className="font-semibold mb-4">{editingId ? "Edit Event" : "New Event"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[["title","Title"],["date","Date"],["time","Time"],["location","Location"],["category","Category"]].map(([k, l]) => (
              <div key={k}>
                <label className="block text-xs font-medium mb-1">{l}</label>
                <input className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" value={form[k]||""} onChange={e => setForm((f:any) => ({...f,[k]:e.target.value}))} />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Description</label>
              <textarea rows={3} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm resize-none" value={form.description||""} onChange={e => setForm((f:any) => ({...f,description:e.target.value}))} />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.featured||false} onChange={e => setForm((f:any)=>({...f,featured:e.target.checked}))} /> Featured</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive!==false} onChange={e => setForm((f:any)=>({...f,isActive:e.target.checked}))} /> Active</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isTicketed||false} onChange={e => setForm((f:any)=>({...f,isTicketed:e.target.checked}))} /> Ticketed</label>
            </div>
            {form.isTicketed && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1">Ticket Price ($)</label>
                  <input type="number" step="0.01" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" value={form.ticketPrice||""} onChange={e => setForm((f:any)=>({...f,ticketPrice:e.target.value}))} />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1">Capacity</label>
                  <input type="number" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" value={form.ticketCapacity||""} onChange={e => setForm((f:any)=>({...f,ticketCapacity:parseInt(e.target.value)||undefined}))} />
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="px-4 py-2 text-white text-sm rounded-md" style={{ backgroundColor: "var(--primary-hex)" }}>Save</button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 border border-gray-300 text-sm rounded-md">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {events?.map(ev => (
          <div key={ev.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-white">
            <div>
              <p className="font-medium text-sm">{ev.title}</p>
              <p className="text-xs text-gray-400">{ev.date} · {ev.location} {!ev.isActive ? "· [inactive]" : ""}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setForm(ev); setEditingId(ev.id); setShowForm(true); }} className="px-3 py-1 text-xs border border-gray-300 rounded">Edit</button>
              <button onClick={() => del(ev.id)} className="px-3 py-1 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50">Delete</button>
            </div>
          </div>
        ))}
        {events?.length === 0 && <p className="text-gray-400 text-sm text-center py-8">No events yet.</p>}
      </div>
    </div>
  );
}

function SponsorsAdmin() {
  const qc = useQueryClient();
  const { data: sponsors } = useQuery<any[]>({ queryKey: ["/api/sponsors"] });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", level: "Gold Sponsor", websiteUrl: "", logoUrl: "", eventType: "general" });

  const save = async () => {
    await apiFetch("/api/admin/sponsors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    qc.invalidateQueries({ queryKey: ["/api/sponsors"] });
    setShowForm(false);
    setForm({ name: "", level: "Gold Sponsor", websiteUrl: "", logoUrl: "", eventType: "general" });
  };

  const del = async (id: number) => {
    if (!confirm("Remove this sponsor?")) return;
    await apiFetch(`/api/admin/sponsors/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["/api/sponsors"] });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Sponsors ({sponsors?.length || 0})</h2>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 text-white text-sm rounded-md" style={{ backgroundColor: "var(--primary-hex)" }}>+ Add Sponsor</button>
      </div>
      {showForm && (
        <div className="border border-gray-200 rounded-lg p-5 mb-6 bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[["name","Sponsor Name"],["level","Level"],["websiteUrl","Website URL"],["logoUrl","Logo URL"],["eventType","Event Type"]].map(([k,l]) => (
              <div key={k}>
                <label className="block text-xs font-medium mb-1">{l}</label>
                <input className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" value={(form as any)[k]||""} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="px-4 py-2 text-white text-sm rounded-md" style={{ backgroundColor: "var(--primary-hex)" }}>Save</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-md">Cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {sponsors?.map(sp => (
          <div key={sp.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-white">
            <div>
              <p className="font-medium text-sm">{sp.name}</p>
              <p className="text-xs text-gray-400">{sp.level} · {sp.eventType}</p>
            </div>
            <button onClick={() => del(sp.id)} className="px-3 py-1 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50">Remove</button>
          </div>
        ))}
        {sponsors?.length === 0 && <p className="text-gray-400 text-sm text-center py-8">No sponsors yet.</p>}
      </div>
    </div>
  );
}

function BusinessesAdmin() {
  const qc = useQueryClient();
  const { data: businesses } = useQuery<any[]>({ queryKey: ["/api/businesses"] });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", address: "", phone: "", website: "", category: "" });

  const save = async () => {
    await apiFetch("/api/admin/businesses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    qc.invalidateQueries({ queryKey: ["/api/businesses"] });
    setShowForm(false);
    setForm({ name: "", description: "", address: "", phone: "", website: "", category: "" });
  };

  const del = async (id: number) => {
    if (!confirm("Remove this business?")) return;
    await apiFetch(`/api/admin/businesses/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["/api/businesses"] });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Business Directory ({businesses?.length || 0})</h2>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 text-white text-sm rounded-md" style={{ backgroundColor: "var(--primary-hex)" }}>+ Add Business</button>
      </div>
      {showForm && (
        <div className="border border-gray-200 rounded-lg p-5 mb-6 bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[["name","Business Name"],["category","Category"],["address","Address"],["phone","Phone"],["website","Website URL"]].map(([k,l]) => (
              <div key={k}>
                <label className="block text-xs font-medium mb-1">{l}</label>
                <input className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" value={(form as any)[k]||""} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Description</label>
              <textarea rows={2} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm resize-none" value={form.description} onChange={e => setForm(f => ({...f,description:e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="px-4 py-2 text-white text-sm rounded-md" style={{ backgroundColor: "var(--primary-hex)" }}>Save</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-md">Cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {businesses?.map(biz => (
          <div key={biz.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-white">
            <div><p className="font-medium text-sm">{biz.name}</p><p className="text-xs text-gray-400">{biz.category} · {biz.address}</p></div>
            <button onClick={() => del(biz.id)} className="px-3 py-1 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50">Remove</button>
          </div>
        ))}
        {businesses?.length === 0 && <p className="text-gray-400 text-sm text-center py-8">No businesses yet.</p>}
      </div>
    </div>
  );
}

function BlogAdmin() {
  const qc = useQueryClient();
  const { data: posts } = useQuery<any[]>({ queryKey: ["/api/admin/blog"], queryFn: async () => { const r = await apiFetch("/api/admin/blog"); return r.json(); } });
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number|null>(null);
  const [form, setForm] = useState({ title: "", excerpt: "", content: "", category: "News", author: "", published: false, membersOnly: false });

  const save = async () => {
    const method = editId ? "PATCH" : "POST";
    const url = editId ? `/api/admin/blog/${editId}` : "/api/admin/blog";
    await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    qc.invalidateQueries({ queryKey: ["/api/admin/blog"] });
    qc.invalidateQueries({ queryKey: ["/api/blog"] });
    setShowForm(false); setEditId(null);
    setForm({ title: "", excerpt: "", content: "", category: "News", author: "", published: false, membersOnly: false });
  };

  const del = async (id: number) => {
    if (!confirm("Delete post?")) return;
    await apiFetch(`/api/admin/blog/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["/api/admin/blog"] });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Blog / News ({posts?.length || 0})</h2>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm({ title: "", excerpt: "", content: "", category: "News", author: "", published: false, membersOnly: false }); }} className="px-4 py-2 text-white text-sm rounded-md" style={{ backgroundColor: "var(--primary-hex)" }}>+ New Post</button>
      </div>
      {showForm && (
        <div className="border border-gray-200 rounded-lg p-5 mb-6 bg-gray-50">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium mb-1">Title</label><input className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" value={form.title} onChange={e => setForm(f => ({...f,title:e.target.value}))} /></div>
              <div><label className="block text-xs font-medium mb-1">Author</label><input className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" value={form.author} onChange={e => setForm(f => ({...f,author:e.target.value}))} /></div>
              <div><label className="block text-xs font-medium mb-1">Category</label><input className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" value={form.category} onChange={e => setForm(f => ({...f,category:e.target.value}))} /></div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.published} onChange={e => setForm(f => ({...f,published:e.target.checked}))} /> Published</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.membersOnly} onChange={e => setForm(f => ({...f,membersOnly:e.target.checked}))} /> Members only</label>
              </div>
            </div>
            <div><label className="block text-xs font-medium mb-1">Excerpt</label><textarea rows={2} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm resize-none" value={form.excerpt} onChange={e => setForm(f => ({...f,excerpt:e.target.value}))} /></div>
            <div><label className="block text-xs font-medium mb-1">Content</label><textarea rows={8} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm resize-none" value={form.content} onChange={e => setForm(f => ({...f,content:e.target.value}))} /></div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="px-4 py-2 text-white text-sm rounded-md" style={{ backgroundColor: "var(--primary-hex)" }}>Save</button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="px-4 py-2 border border-gray-300 text-sm rounded-md">Cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {posts?.map(p => (
          <div key={p.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-white">
            <div>
              <p className="font-medium text-sm">{p.title}</p>
              <p className="text-xs text-gray-400">{p.category} · {p.published ? "Published" : "Draft"}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setForm(p); setEditId(p.id); setShowForm(true); }} className="px-3 py-1 text-xs border border-gray-300 rounded">Edit</button>
              <button onClick={() => del(p.id)} className="px-3 py-1 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50">Delete</button>
            </div>
          </div>
        ))}
        {posts?.length === 0 && <p className="text-gray-400 text-sm text-center py-8">No posts yet.</p>}
      </div>
    </div>
  );
}

function MessagesAdmin() {
  const { data: messages } = useQuery<any[]>({ queryKey: ["/api/admin/contact-messages"], queryFn: async () => { const r = await apiFetch("/api/admin/contact-messages"); return r.json(); } });
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Contact Messages ({messages?.length || 0})</h2>
      <div className="space-y-3">
        {messages?.map(msg => (
          <div key={msg.id} className="p-4 border border-gray-200 rounded-lg bg-white">
            <div className="flex justify-between mb-2">
              <p className="font-medium text-sm">{msg.name} — {msg.subject}</p>
              <p className="text-xs text-gray-400">{new Date(msg.createdAt).toLocaleDateString()}</p>
            </div>
            <p className="text-xs text-gray-400 mb-1">{msg.email}</p>
            <p className="text-sm text-gray-600">{msg.message}</p>
          </div>
        ))}
        {messages?.length === 0 && <p className="text-gray-400 text-sm text-center py-8">No messages yet.</p>}
      </div>
    </div>
  );
}

function NewsletterAdmin() {
  const { data: subscribers } = useQuery<any[]>({ queryKey: ["/api/admin/newsletter-subscribers"], queryFn: async () => { const r = await apiFetch("/api/admin/newsletter-subscribers"); return r.json(); } });
  const active = subscribers?.filter(s => s.status === "active") || [];
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Newsletter Subscribers ({active.length} active)</h2>
      <div className="space-y-2">
        {subscribers?.map(sub => (
          <div key={sub.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white text-sm">
            <div>
              <p className="font-medium">{sub.email}</p>
              {sub.firstName && <p className="text-xs text-gray-400">{sub.firstName}</p>}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${sub.status === "active" ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>{sub.status}</span>
          </div>
        ))}
        {active.length === 0 && <p className="text-gray-400 text-sm text-center py-8">No subscribers yet.</p>}
      </div>
    </div>
  );
}
