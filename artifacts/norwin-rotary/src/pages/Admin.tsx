import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { api, type NrcEvent, type BlogPost, type Sponsor, type ContactMessage, type NewsletterSubscriber, type AdminStats } from "@/lib/api";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function path(p: string) { return `${BASE}${p}`; }

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type AdminSection = "dashboard" | "events" | "blog" | "sponsors" | "newsletter" | "messages";

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ section, setSection, onLogout }: {
  section: AdminSection;
  setSection: (s: AdminSection) => void;
  onLogout: () => void;
}) {
  const items: { id: AdminSection; icon: string; label: string }[] = [
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "events", icon: "📅", label: "Events" },
    { id: "blog", icon: "📰", label: "Blog Posts" },
    { id: "sponsors", icon: "🤝", label: "Sponsors" },
    { id: "newsletter", icon: "📧", label: "Newsletter" },
    { id: "messages", icon: "✉️", label: "Messages" },
  ];
  return (
    <div className="admin-sidebar">
      <div className="admin-sidebar-brand">
        <h2>🌐 NRC Admin</h2>
        <p>Norwin Rotary Club</p>
      </div>
      <ul className="admin-nav">
        {items.map(item => (
          <li key={item.id}>
            <a
              href="#"
              className={section === item.id ? "active" : ""}
              onClick={e => { e.preventDefault(); setSection(item.id); }}
            >
              <span>{item.icon}</span> {item.label}
            </a>
          </li>
        ))}
        <li style={{ marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1rem", marginTop: "2rem" }}>
          <Link href="/" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", display: "flex", gap: "0.65rem", padding: "0.65rem 1.25rem", fontSize: "0.875rem" }}>
            <span>🏠</span> View Website
          </Link>
        </li>
        <li>
          <button onClick={onLogout}>
            <span>🚪</span> Log Out
          </button>
        </li>
      </ul>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ stats }: { stats: AdminStats | null }) {
  if (!stats) return <div className="loading-center"><div className="spinner" /></div>;
  const cards = [
    { label: "Published Events", value: stats.publishedEvents, icon: "📅" },
    { label: "Published Posts", value: stats.publishedPosts, icon: "📰" },
    { label: "Subscribers", value: stats.subscribers, icon: "📧" },
    { label: "Unread Messages", value: stats.unreadMessages, icon: "✉️" },
    { label: "Active Sponsors", value: stats.activeSponsors, icon: "🤝" },
  ];
  return (
    <div>
      <div className="admin-header">
        <h1>Dashboard</h1>
        <p>Overview of your Norwin Rotary Club website</p>
      </div>
      <div className="admin-stats-grid">
        {cards.map(c => (
          <div key={c.label} className="admin-stat-card">
            <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>{c.icon}</div>
            <div className="admin-stat-value">{c.value}</div>
            <div className="admin-stat-label">{c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "white", borderRadius: 12, padding: "1.75rem", border: "1px solid var(--border)" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 700 }}>Quick Links</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <a href={path("/")} target="_blank" className="btn btn-outline btn-sm">🏠 View Website</a>
          <a href={path("/events")} target="_blank" className="btn btn-outline btn-sm">📅 Events Page</a>
          <a href={path("/blog")} target="_blank" className="btn btn-outline btn-sm">📰 Blog Page</a>
        </div>
      </div>
    </div>
  );
}

// ── Generic modal form ────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Events admin ──────────────────────────────────────────────────────────────

function AdminEvents() {
  const [events, setEvents] = useState<NrcEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<NrcEvent | null>(null);
  const [form, setForm] = useState<Partial<NrcEvent>>({});
  const [saving, setSaving] = useState(false);

  const load = () => api.adminGetEvents().then(setEvents).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ is_published: false, is_ticketed: false });
    setShowModal(true);
  }

  function openEdit(ev: NrcEvent) {
    setEditing(ev);
    setForm({ ...ev });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.adminUpdateEvent(editing.id, form);
      } else {
        await api.adminCreateEvent(form);
      }
      setShowModal(false);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this event?")) return;
    await api.adminDeleteEvent(id);
    load();
  }

  return (
    <div>
      <div className="admin-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Events</h1>
          <p>Manage upcoming and past events</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ New Event</button>
      </div>
      <div className="admin-table">
        <table>
          <thead><tr>
            <th>Title</th><th>Date</th><th>Location</th><th>Ticketed</th><th>Published</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem" }}><div className="spinner" style={{ margin: "0 auto" }} /></td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>No events yet</td></tr>
            ) : events.map(ev => (
              <tr key={ev.id}>
                <td style={{ fontWeight: 600 }}>{ev.title}</td>
                <td>{formatDate(ev.event_date)}</td>
                <td>{ev.location ?? "—"}</td>
                <td>
                  <span className={`badge ${ev.is_ticketed ? "badge-blue" : "badge-yellow"}`}>
                    {ev.is_ticketed ? `$${ev.ticket_price}` : "Free"}
                  </span>
                </td>
                <td>
                  <span className={`badge ${ev.is_published ? "badge-green" : "badge-yellow"}`}>
                    {ev.is_published ? "Published" : "Draft"}
                  </span>
                </td>
                <td>
                  <button className="btn btn-outline btn-sm" style={{ marginRight: 6 }} onClick={() => openEdit(ev)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(ev.id)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? "Edit Event" : "New Event"} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input className="form-input" value={form.title ?? ""} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" rows={4} value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Start Date/Time *</label>
                <input type="datetime-local" className="form-input" value={form.event_date ? new Date(form.event_date).toISOString().slice(0,16) : ""} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">End Date/Time</label>
                <input type="datetime-local" className="form-input" value={form.end_date ? new Date(form.end_date).toISOString().slice(0,16) : ""} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input className="form-input" value={form.location ?? ""} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Image URL</label>
              <input type="url" className="form-input" value={form.image_url ?? ""} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} />
            </div>
            <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1.25rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>
                <input type="checkbox" checked={!!form.is_ticketed} onChange={e => setForm(f => ({ ...f, is_ticketed: e.target.checked }))} />
                Ticketed Event
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>
                <input type="checkbox" checked={!!form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} />
                Published
              </label>
            </div>
            {form.is_ticketed && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="form-group">
                  <label className="form-label">Ticket Price ($)</label>
                  <input type="number" step="0.01" className="form-input" value={form.ticket_price ?? ""} onChange={e => setForm(f => ({ ...f, ticket_price: Number(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Capacity</label>
                  <input type="number" className="form-input" value={form.ticket_capacity ?? ""} onChange={e => setForm(f => ({ ...f, ticket_capacity: Number(e.target.value) }))} />
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Saving…" : "Save Event"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Blog admin ────────────────────────────────────────────────────────────────

function AdminBlog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [form, setForm] = useState<Partial<BlogPost>>({});
  const [saving, setSaving] = useState(false);

  const load = () => api.adminGetBlogPosts().then(setPosts).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ is_published: false, author: "Norwin Rotary Club" });
    setShowModal(true);
  }

  function openEdit(post: BlogPost) {
    setEditing(post);
    setForm({ ...post });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.adminUpdateBlogPost(editing.id, form);
      } else {
        await api.adminCreateBlogPost(form);
      }
      setShowModal(false);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this blog post?")) return;
    await api.adminDeleteBlogPost(id);
    load();
  }

  return (
    <div>
      <div className="admin-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h1>Blog Posts</h1><p>Create and manage community news and updates</p></div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ New Post</button>
      </div>
      <div className="admin-table">
        <table>
          <thead><tr><th>Title</th><th>Author</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: "2rem" }}><div className="spinner" style={{ margin: "0 auto" }} /></td></tr>
            ) : posts.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>No posts yet</td></tr>
            ) : posts.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.title}</td>
                <td>{p.author}</td>
                <td>{p.published_at ? formatDate(p.published_at) : "—"}</td>
                <td><span className={`badge ${p.is_published ? "badge-green" : "badge-yellow"}`}>{p.is_published ? "Published" : "Draft"}</span></td>
                <td>
                  <button className="btn btn-outline btn-sm" style={{ marginRight: 6 }} onClick={() => openEdit(p)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? "Edit Post" : "New Post"} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input className="form-input" value={form.title ?? ""} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Slug (auto-generated if blank)</label>
              <input className="form-input" value={form.slug ?? ""} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="my-post-title" />
            </div>
            <div className="form-group">
              <label className="form-label">Author</label>
              <input className="form-input" value={form.author ?? ""} onChange={e => setForm(f => ({ ...f, author: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Excerpt (short summary)</label>
              <textarea className="form-textarea" rows={2} value={form.excerpt ?? ""} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Body (use blank lines to separate paragraphs)</label>
              <textarea className="form-textarea" rows={8} value={form.body ?? ""} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Cover Image URL</label>
              <input type="url" className="form-input" value={form.cover_image_url ?? ""} onChange={e => setForm(f => ({ ...f, cover_image_url: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Tags (comma separated)</label>
              <input className="form-input" value={form.tags ?? ""} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="community, scholarship, fundraiser" />
            </div>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>
                <input type="checkbox" checked={!!form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} />
                Publish immediately
              </label>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Saving…" : "Save Post"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Sponsors admin ────────────────────────────────────────────────────────────

function AdminSponsors() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [form, setForm] = useState<Partial<Sponsor>>({});
  const [saving, setSaving] = useState(false);

  const load = () => api.adminGetSponsors().then(setSponsors).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ is_active: true, tier: "community", tier_rank: 99 });
    setShowModal(true);
  }

  function openEdit(s: Sponsor) {
    setEditing(s);
    setForm({ ...s });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.adminUpdateSponsor(editing.id, form);
      } else {
        await api.adminCreateSponsor(form);
      }
      setShowModal(false);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this sponsor?")) return;
    await api.adminDeleteSponsor(id);
    load();
  }

  return (
    <div>
      <div className="admin-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h1>Sponsors</h1><p>Manage community partners and sponsors</p></div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Add Sponsor</button>
      </div>
      <div className="admin-table">
        <table>
          <thead><tr><th>Name</th><th>Tier</th><th>Website</th><th>Active</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: "2rem" }}><div className="spinner" style={{ margin: "0 auto" }} /></td></tr>
            ) : sponsors.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>No sponsors yet</td></tr>
            ) : sponsors.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td><span className="badge badge-blue" style={{ textTransform: "capitalize" }}>{s.tier}</span></td>
                <td>{s.website_url ? <a href={s.website_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.85rem" }}>{s.website_url.replace(/^https?:\/\//, "")}</a> : "—"}</td>
                <td><span className={`badge ${s.is_active ? "badge-green" : "badge-red"}`}>{s.is_active ? "Active" : "Inactive"}</span></td>
                <td>
                  <button className="btn btn-outline btn-sm" style={{ marginRight: 6 }} onClick={() => openEdit(s)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? "Edit Sponsor" : "Add Sponsor"} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input className="form-input" value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Tier</label>
              <select className="form-select" value={form.tier ?? "community"} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))}>
                <option value="presenting">Presenting</option>
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
                <option value="bronze">Bronze</option>
                <option value="community">Community</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Logo URL</label>
              <input type="url" className="form-input" value={form.logo_url ?? ""} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Website URL</label>
              <input type="url" className="form-input" value={form.website_url ?? ""} onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" rows={2} value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Display Priority (lower = first)</label>
                <input type="number" className="form-input" value={form.tier_rank ?? 99} onChange={e => setForm(f => ({ ...f, tier_rank: Number(e.target.value) }))} />
              </div>
            </div>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>
                <input type="checkbox" checked={!!form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                Active (visible on website)
              </label>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Saving…" : "Save Sponsor"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Newsletter ─────────────────────────────────────────────────────────────────

function AdminNewsletter() {
  const [subs, setSubs] = useState<NewsletterSubscriber[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminGetSubscribers().then(setSubs).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="admin-header">
        <h1>Newsletter Subscribers</h1>
        <p>{subs.length} active subscriber{subs.length !== 1 ? "s" : ""}</p>
      </div>
      <div className="admin-table">
        <table>
          <thead><tr><th>Email</th><th>Name</th><th>Subscribed</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} style={{ textAlign: "center", padding: "2rem" }}><div className="spinner" style={{ margin: "0 auto" }} /></td></tr>
            ) : subs.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>No subscribers yet</td></tr>
            ) : subs.map(s => (
              <tr key={s.id}>
                <td>{s.email}</td>
                <td>{s.name ?? "—"}</td>
                <td>{formatDate(s.subscribed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Messages ──────────────────────────────────────────────────────────────────

function AdminMessages() {
  const [msgs, setMsgs] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ContactMessage | null>(null);

  const load = () => api.adminGetMessages().then(setMsgs).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function markRead(id: string) {
    await api.adminMarkRead(id);
    load();
  }

  return (
    <div>
      <div className="admin-header">
        <h1>Contact Messages</h1>
        <p>Inquiries from the website contact form</p>
      </div>
      <div className="admin-table">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Subject</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem" }}><div className="spinner" style={{ margin: "0 auto" }} /></td></tr>
            ) : msgs.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>No messages yet</td></tr>
            ) : msgs.map(m => (
              <tr key={m.id} style={{ fontWeight: m.is_read ? 400 : 700 }}>
                <td>{m.name}</td>
                <td>{m.email}</td>
                <td>{m.subject ?? "General"}</td>
                <td>{formatDate(m.created_at)}</td>
                <td><span className={`badge ${m.is_read ? "badge-yellow" : "badge-blue"}`}>{m.is_read ? "Read" : "New"}</span></td>
                <td>
                  <button className="btn btn-outline btn-sm" style={{ marginRight: 6 }} onClick={() => setSelected(m)}>View</button>
                  {!m.is_read && (
                    <button className="btn btn-sm btn-success" onClick={() => markRead(m.id)}>Mark Read</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <Modal title={`Message from ${selected.name}`} onClose={() => setSelected(null)}>
          <div style={{ marginBottom: "1rem" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.82rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>From</p>
            <p style={{ margin: 0 }}>{selected.name} &lt;<a href={`mailto:${selected.email}`}>{selected.email}</a>&gt;</p>
          </div>
          {selected.subject && (
            <div style={{ marginBottom: "1rem" }}>
              <p style={{ margin: "0 0 0.25rem", fontSize: "0.82rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Subject</p>
              <p style={{ margin: 0 }}>{selected.subject}</p>
            </div>
          )}
          <div>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.82rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Message</p>
            <p style={{ margin: 0, background: "var(--surface)", padding: "1rem", borderRadius: 8, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{selected.message}</p>
          </div>
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
            <a href={`mailto:${selected.email}`} className="btn btn-primary btn-sm">Reply via Email</a>
            {!selected.is_read && (
              <button className="btn btn-outline btn-sm" onClick={() => { markRead(selected.id); setSelected(null); }}>Mark as Read</button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Main Admin component ──────────────────────────────────────────────────────

export default function Admin() {
  const [, nav] = useLocation();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [section, setSection] = useState<AdminSection>("dashboard");
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    api.me().then(res => {
      if (!res.authenticated) {
        nav("/admin/login");
      } else {
        setAuthed(true);
        api.adminGetStats().then(setStats).catch(() => {});
      }
    }).catch(() => nav("/admin/login"));
  }, []);

  async function handleLogout() {
    await api.logout();
    nav("/admin/login");
  }

  if (authed === null) {
    return (
      <div className="loading-center" style={{ minHeight: "100vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <Sidebar section={section} setSection={setSection} onLogout={handleLogout} />
      <div className="admin-main">
        {section === "dashboard" && <Dashboard stats={stats} />}
        {section === "events" && <AdminEvents />}
        {section === "blog" && <AdminBlog />}
        {section === "sponsors" && <AdminSponsors />}
        {section === "newsletter" && <AdminNewsletter />}
        {section === "messages" && <AdminMessages />}
      </div>
    </div>
  );
}
