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

type Tab = "home" | "profile" | "directory";

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
          {(["home", "profile", "directory"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-current" : "border-transparent text-gray-500 hover:text-gray-800"}`}
              style={tab === t ? { color: "var(--primary-hex)" } : {}}>
              {t === "home" ? "Announcements" : t === "profile" ? "My profile" : "Directory"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {tab === "home" && <AnnouncementsTab />}
        {tab === "profile" && <ProfileTab member={member} />}
        {tab === "directory" && <DirectoryTab />}
      </div>
    </div>
  );
}

function AnnouncementsTab() {
  const { data, isLoading } = useQuery<Announcement[]>({
    queryKey: ["/api/members/announcements"],
    queryFn: async () => {
      const res = await fetch("/api/members/announcements", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load announcements");
      return res.json();
    },
  });
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!data?.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
        <h2 className="text-lg font-serif font-bold text-gray-900 mb-2">No announcements yet</h2>
        <p className="text-sm text-gray-500">When your administrators post something, it will show up here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {data.map((a) => (
        <div key={a.id} className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="text-xs text-gray-400 mb-2">{new Date(a.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</div>
          <h3 className="font-serif font-bold text-xl text-gray-900 mb-2">{a.title}</h3>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{a.body}</div>
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

function DirectoryTab() {
  const { data, isLoading } = useQuery<DirectoryRow[]>({
    queryKey: ["/api/members/directory"],
    queryFn: async () => {
      const res = await fetch("/api/members/directory", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load directory");
      return res.json();
    },
  });
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!data?.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
        <p className="text-sm text-gray-500">No members are listed in the directory yet.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.map((m) => (
        <div key={m.id} className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-start gap-3">
            {m.photo_url ? (
              <img src={m.photo_url} alt="" className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: "var(--primary-hex)" }}>
                {m.first_name[0]}{m.last_name?.[0] ?? ""}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 truncate">{m.first_name} {m.last_name}</div>
              {m.title && <div className="text-xs text-gray-500 truncate">{m.title}</div>}
              {m.member_type === "board" && <span className="inline-block mt-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Board</span>}
            </div>
          </div>
          {m.bio && <p className="text-xs text-gray-600 mt-3 line-clamp-3">{m.bio}</p>}
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
