import { useState } from "react";
import { useLocation } from "wouter";
import { useConfig } from "../config-context";
import { apiFetch } from "../lib/api";

export default function AdminLoginPage() {
  const config = useConfig();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        setLocation("/admin");
      } else {
        const data = await res.json();
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const shortName = config?.shortName || config?.orgName?.split(" ").map(w => w[0]).join("").slice(0, 2) || "CP";

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "var(--primary-hex)" }}>
            <span className="text-white font-bold font-serif">{shortName.slice(0, 2)}</span>
          </div>
          <h1 className="text-2xl font-bold font-serif">{config?.orgName || "Community Site"}</h1>
          <p className="text-gray-500 text-sm mt-1">Admin Login</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": "var(--primary-hex)" } as any}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-2.5 text-white rounded-md text-sm font-medium disabled:opacity-50" style={{ backgroundColor: "var(--primary-hex)" }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
