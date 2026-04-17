import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useConfig } from "../config-context";

export default function MemberLoginPage() {
  const config = useConfig();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/members/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign-in failed");
      await qc.invalidateQueries({ queryKey: ["/api/members/me"] });
      navigate("/members");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-serif font-bold text-gray-900 mb-1">Members sign in</h1>
        <p className="text-sm text-gray-500 mb-6">Welcome back to {config?.orgName}.</p>
        {error && <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1"
              style={{ ['--tw-ring-color' as any]: 'var(--primary-hex)' }} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md" />
          </div>
          <button type="submit" disabled={busy}
            className="w-full py-2.5 rounded-md text-white font-medium text-sm disabled:opacity-60"
            style={{ backgroundColor: "var(--primary-hex)" }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-6 text-center">
          Don't have an account? Ask your administrator to send you an invite.
        </p>
      </div>
    </div>
  );
}
