import { useState } from "react";
import { useConfig } from "../config-context";

export default function MemberForgotPasswordPage() {
  const config = useConfig();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/members/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-serif font-bold text-gray-900 mb-1">Forgot password</h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter the email you use for {config?.orgName} and we'll send you a reset link.
        </p>
        {done ? (
          <div className="p-4 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm">
            If an account exists for <strong>{email}</strong>, a password reset link is on the way.
            The link expires in 1 hour.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1"
                style={{ ['--tw-ring-color' as any]: 'var(--primary-hex)' }}
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-md text-white font-medium text-sm disabled:opacity-60"
              style={{ backgroundColor: "var(--primary-hex)" }}
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <p className="text-xs text-gray-400 mt-6 text-center">
          <a href="/members/login" className="underline">Back to sign in</a>
        </p>
      </div>
    </div>
  );
}
