import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMember, useMemberLogout, type CurrentMember } from "../lib/memberAuth";
import { useConfig } from "../config-context";

interface DirectoryRow {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  member_type: string;
  title: string | null;
  bio: string | null;
  photo_url: string | null;
}

interface Announcement {
  id: number;
  title: string;
  body: string;
  created_at: string;
}

interface PortalSection {
  type: string;
  title?: string;
  body?: string;
  notices?: Array<{ date?: string; title?: string; body?: string }>;
  cadence?: string;
  location?: string;
  upcoming?: Array<{ date?: string; note?: string }>;
  amountText?: string;
  payUrl?: string | null;
  committees?: Array<{ name?: string; description?: string; contact?: string }>;
  documents?: Array<{ name?: string; url?: string; description?: string; category?: string }>;
  [key: string]: unknown;
}

interface PortalConfig {
  sections: PortalSection[];
  provisionedAt: string | null;
  orgName: string | null;
}

type Tab = "home" | "profile";

export default function MemberPortalPage() {
  const { member, loading } = useMember();
  const config = useConfig();
  const [, navigate] = useLocation();
  const logout = useMemberLogout();
  const [tab, setTab] = useState<Tab>("home");

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-24 text-center text-sm text-gray-500">Loading…</div>;
  }
  if (!member) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-serif font-bold text-gray-900 mb-3">Members area</h1>
        <p className="text-sm text-gray-500 mb-6">Please sign in to access member content.</p>
        <button onClick={() => navigate("/members/login")}
          className="px-5 py-2.5 rounded-md text-white text-sm font-medium"
          style={{ backgroundColor: "var(--primary-hex)" }}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-160px)]">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Members portal</p>
            <h1 className="text-3xl font-serif font-bold text-gray-900">
              Welcome, {member.first_name}.
            </h1>
            <p className="text-sm text-gray-500 mt-1">{config?.orgName}</p>
          </div>
          <button
            onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/") })}
            className="self-start sm:self-end px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md">
            Sign out
          </button>
        </div>
        <div className="max-w-5xl mx-auto px-4 flex gap-6 border-t border-gray-100">
          {(["home", "profile"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-current" : "border-transparent text-gray-500 hover:text-gray-800"}`}
              style={tab === t ? { color: "var(--primary-hex)" } : {}}>
              {t === "home" ? "Home" : "My profile"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {tab === "home" && <HomeTab />}
        {tab === "profile" && <ProfileTab member={member} />}
      </div>
    </div>
  );
}

function HomeTab() {
  const { data, isLoading, error } = useQuery<PortalConfig>({
    queryKey: ["/api/members-portal/config"],
    queryFn: async () => {
      const res = await fetch("/api/members-portal/config", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load portal");
      return res.json();
    },
  });

  // Always also fetch announcements — they appear at the top regardless of
  // the configured sections (admins post them via the Announcements tab in
  // the dashboard and members expect them front and center).
  const announcements = useQuery<Announcement[]>({
    queryKey: ["/api/members/announcements"],
    queryFn: async () => {
      const res = await fetch("/api/members/announcements", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load announcements");
      return res.json();
    },
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">Could not load portal sections.</p>;
  const sections = data?.sections ?? [];

  return (
    <div className="space-y-6">
      {(announcements.data?.length ?? 0) > 0 && (
        <SectionCard title="Latest announcements">
          <div className="space-y-4">
            {(announcements.data ?? []).slice(0, 3).map((a) => (
              <div key={a.id}>
                <div className="text-xs text-gray-400 mb-1">
                  {new Date(a.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                </div>
                <h3 className="font-serif font-bold text-lg text-gray-900 mb-1">{a.title}</h3>
                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{a.body}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {sections.length === 0 && (announcements.data?.length ?? 0) === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <h2 className="text-lg font-serif font-bold text-gray-900 mb-2">Your portal is being set up</h2>
          <p className="text-sm text-gray-500">An administrator will configure your members area shortly.</p>
        </div>
      )}
      {sections.map((section, idx) => (
        <SectionRenderer key={idx} section={section} />
      ))}
    </div>
  );
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
      {title && <h2 className="text-xl font-serif font-bold text-gray-900 mb-4">{title}</h2>}
      {children}
    </div>
  );
}

function SectionRenderer({ section }: { section: PortalSection }) {
  switch (section.type) {
    case "welcome_message":
      return (
        <SectionCard title={section.title}>
          {section.body && (
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{section.body}</div>
          )}
        </SectionCard>
      );
    case "notices": {
      const list = section.notices ?? [];
      return (
        <SectionCard title={section.title ?? "Notices"}>
          {list.length === 0 ? (
            <p className="text-sm text-gray-500">No current notices.</p>
          ) : (
            <div className="space-y-4">
              {list.map((n, i) => (
                <div key={i} className="border-l-2 pl-4" style={{ borderColor: "var(--primary-hex)" }}>
                  {n.date && <div className="text-xs text-gray-400 mb-1">{n.date}</div>}
                  {n.title && <div className="font-semibold text-gray-900 mb-1">{n.title}</div>}
                  {n.body && <div className="text-sm text-gray-700 whitespace-pre-wrap">{n.body}</div>}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      );
    }
    case "meeting_schedule":
      return (
        <SectionCard title={section.title ?? "When we meet"}>
          {section.cadence && <p className="text-sm text-gray-800 mb-2"><span className="font-semibold">Cadence: </span>{section.cadence}</p>}
          {section.location && <p className="text-sm text-gray-800 mb-3"><span className="font-semibold">Location: </span>{section.location}</p>}
          {(section.upcoming?.length ?? 0) > 0 && (
            <div className="mt-3 space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-gray-400">Upcoming</div>
              {(section.upcoming ?? []).map((u, i) => (
                <div key={i} className="text-sm text-gray-700">
                  <span className="font-medium">{u.date}</span>{u.note ? ` — ${u.note}` : ""}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      );
    case "dues_info":
      return (
        <SectionCard title={section.title ?? "Dues"}>
          {section.amountText && <div className="text-2xl font-serif font-bold text-gray-900 mb-2">{section.amountText}</div>}
          {section.body && <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{section.body}</p>}
          {section.payUrl ? (
            <a href={section.payUrl} className="inline-block px-4 py-2 rounded-md text-white text-sm font-medium"
              style={{ backgroundColor: "var(--primary-hex)" }}>
              Pay dues
            </a>
          ) : (
            <p className="text-xs text-gray-400 italic">Online payment coming soon.</p>
          )}
        </SectionCard>
      );
    case "committee_signups": {
      const list = section.committees ?? [];
      return (
        <SectionCard title={section.title ?? "Committees"}>
          {list.length === 0 ? (
            <p className="text-sm text-gray-500">No committees listed yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {list.map((c, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-4">
                  <div className="font-semibold text-gray-900 mb-1">{c.name}</div>
                  {c.description && <div className="text-sm text-gray-600 mb-2">{c.description}</div>}
                  {c.contact && <a href={`mailto:${c.contact}`} className="text-sm" style={{ color: "var(--primary-hex)" }}>{c.contact}</a>}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      );
    }
    case "documents": {
      const list = section.documents ?? [];
      return (
        <SectionCard title={section.title ?? "Documents"}>
          {list.length === 0 ? (
            <p className="text-sm text-gray-500">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {list.map((d, i) => (
                <a key={i} href={d.url ?? "#"} target="_blank" rel="noreferrer"
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{d.name}</div>
                    {d.description && <div className="text-xs text-gray-500">{d.description}</div>}
                  </div>
                  {d.category && <span className="text-xs text-gray-400">{d.category}</span>}
                </a>
              ))}
            </div>
          )}
        </SectionCard>
      );
    }
    case "member_roster":
      return (
        <SectionCard title={section.title ?? "Member roster"}>
          <DirectoryGrid />
        </SectionCard>
      );
    default:
      return null;
  }
}

function DirectoryGrid() {
  const { data, isLoading } = useQuery<DirectoryRow[]>({
    queryKey: ["/api/members/directory"],
    queryFn: async () => {
      const res = await fetch("/api/members/directory", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load directory");
      return res.json();
    },
  });
  if (isLoading) return <p className="text-sm text-gray-500">Loading directory…</p>;
  if (!data?.length) return <p className="text-sm text-gray-500">No members are listed in the directory yet.</p>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.map((m) => (
        <div key={m.id} className="border border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            {m.photo_url ? (
              <img src={m.photo_url} alt="" className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: "var(--primary-hex)" }}>
                {m.first_name[0]}{m.last_name?.[0] ?? ""}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 truncate text-sm">{m.first_name} {m.last_name}</div>
              {m.title && <div className="text-xs text-gray-500 truncate">{m.title}</div>}
              {m.member_type === "board" && <span className="inline-block mt-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Board</span>}
            </div>
          </div>
          {(m.email || m.phone) && (
            <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-0.5">
              {m.email && <div className="truncate">{m.email}</div>}
              {m.phone && <div>{m.phone}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ProfileTab({ member }: { member: CurrentMember }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    firstName: member.first_name,
    lastName: member.last_name ?? "",
    phone: member.phone ?? "",
    title: member.title ?? "",
    bio: member.bio ?? "",
    photoUrl: member.photo_url ?? "",
    address: member.address ?? "",
    showInDirectory: member.show_in_directory,
  });
  const [msg, setMsg] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/members/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
    },
    onSuccess: () => {
      setMsg("Profile updated.");
      qc.invalidateQueries({ queryKey: ["/api/members/me"] });
      qc.invalidateQueries({ queryKey: ["/api/members/directory"] });
      setTimeout(() => setMsg(null), 2500);
    },
    onError: (e: any) => setMsg(e.message),
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8">
      <h2 className="text-xl font-serif font-bold text-gray-900 mb-6">My profile</h2>
      {msg && <div className="mb-4 p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="First name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} required />
          <Field label="Last name" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Field label="Title or role" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
        </div>
        <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
        <Field label="Photo URL" value={form.photoUrl} onChange={(v) => setForm({ ...form, photoUrl: v })} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
          <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.showInDirectory}
            onChange={(e) => setForm({ ...form, showInDirectory: e.target.checked })} />
          Show me in the member directory
        </label>
        <button type="submit" disabled={save.isPending}
          className="px-5 py-2.5 rounded-md text-white text-sm font-medium disabled:opacity-60"
          style={{ backgroundColor: "var(--primary-hex)" }}>
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input value={value} required={required} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
    </div>
  );
}
