import { useState } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminLogin() {
  const [, nav] = useLocation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.login(form.username, form.password);
      nav(`${BASE}/admin`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", padding: "1.5rem" }}>
      <div style={{ background: "white", borderRadius: 16, padding: "2.5rem", maxWidth: 400, width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid var(--border)" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ width: 56, height: 56, background: "var(--accent)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "1.1rem", color: "var(--primary)", margin: "0 auto 1rem" }}>NR</div>
          <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.5rem", fontWeight: 800 }}>Admin Login</h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>Norwin Rotary Club</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-input"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign In →"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
          <a href={`${BASE}/`} style={{ color: "var(--text-muted)" }}>← Back to website</a>
        </p>
      </div>
    </div>
  );
}
