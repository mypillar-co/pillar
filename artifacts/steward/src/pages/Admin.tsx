import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { csrfHeaders } from "../lib/api";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const method = (opts?.method ?? "GET").toUpperCase();
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    ...opts,
    headers: {
      ...(mutating ? csrfHeaders(method) : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function fmt(n: number, prefix = "$") {
  return `${prefix}${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function KPICard({ label, value, sub, color = "#e8b84b" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: "20px 24px",
      flex: "1 1 160px",
      minWidth: 160,
    }}>
      <div style={{ fontSize: 12, color: "#8b9ab5", marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#8b9ab5", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const colors: Record<string, [string, string]> = {
    active: ["#16a34a", "#dcfce7"],
    canceled: ["#dc2626", "#fee2e2"],
    past_due: ["#d97706", "#fef3c7"],
    trialing: ["#7c3aed", "#ede9fe"],
    inactive: ["#6b7280", "#f3f4f6"],
  };
  const [bg, text] = colors[status] ?? ["#6b7280", "#f3f4f6"];
  return (
    <span style={{
      background: bg + "22",
      color: bg,
      border: `1px solid ${bg}44`,
      borderRadius: 6,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
    }}>{status}</span>
  );
}

const TIER_COLORS: Record<string, string> = {
  tier1: "#60a5fa",
  tier1a: "#a78bfa",
  tier2: "#34d399",
  tier3: "#e8b84b",
};

export default function Admin() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();

  const [tab, setTab] = useState<"overview" | "financials" | "subscribers" | "churn" | "health" | "support" | "agents" | "trials">("overview");
  const [overview, setOverview] = useState<any>(null);
  const [financials, setFinancials] = useState<any>(null);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [churn, setChurn] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketUpdating, setTicketUpdating] = useState<string | null>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [contentQueue, setContentQueue] = useState<any[]>([]);
  const [prospects, setProspects] = useState<any[]>([]);
  const [agentLogs, setAgentLogs] = useState<any[]>([]);
  const [prospectForm, setProspectForm] = useState<Record<string, string>>({});
  const [prospectAdding, setProspectAdding] = useState(false);
  const [agentFilter, setAgentFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subFilter, setSubFilter] = useState("");
  const [allOrgs, setAllOrgs] = useState<any[]>([]);
  const [orgSearch, setOrgSearch] = useState("");
  const [grantTrialOrg, setGrantTrialOrg] = useState<any | null>(null);
  const [grantTrialMonths, setGrantTrialMonths] = useState(3);
  const [grantTrialTierId, setGrantTrialTierId] = useState("tier3");
  const [grantingTrial, setGrantingTrial] = useState(false);
  const [grantTrialMsg, setGrantTrialMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (!isAuthenticated) return;
    Promise.all([
      apiFetch("/api/admin/overview"),
      apiFetch("/api/admin/financials"),
      apiFetch("/api/admin/subscribers"),
      apiFetch("/api/admin/churn"),
      apiFetch("/api/admin/health"),
      apiFetch("/api/support/tickets"),
      apiFetch("/api/admin/agents"),
      apiFetch("/api/admin/content-queue"),
      apiFetch("/api/admin/prospects"),
      apiFetch("/api/admin/agents/logs?limit=100"),
      apiFetch("/api/admin/orgs"),
    ])
      .then(([ov, fin, subs, ch, he, tix, ag, cq, pros, logs, orgs]) => {
        setOverview(ov);
        setFinancials(fin);
        setSubscribers(subs);
        setChurn(ch);
        setHealth(he);
        setTickets(tix);
        setAgents(ag.agents ?? []);
        setContentQueue(cq ?? []);
        setProspects(pros ?? []);
        setAgentLogs(logs ?? []);
        setAllOrgs(Array.isArray(orgs) ? orgs : []);
        setLoading(false);
      })
      .catch((err) => {
        if (err.message === "403") {
          setError("You don't have admin access. Ask the platform owner to add your user ID.");
        } else {
          setError("Failed to load admin data.");
        }
        setLoading(false);
      });
  }, [isAuthenticated]);

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "financials", label: "Financials" },
    { key: "subscribers", label: "Subscribers" },
    { key: "churn", label: "Churn" },
    { key: "trials", label: "🎁 Grant Trial" },
    { key: "agents", label: "AI Agents" },
    { key: "health", label: "Server Health" },
    { key: "support", label: `Support${tickets.filter(t => t.status === "open").length > 0 ? ` (${tickets.filter(t => t.status === "open").length})` : ""}` },
  ] as const;

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#0c1526",
      color: "#e2e8f0",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    },
    header: {
      background: "#0f1e35",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      padding: "0 32px",
      display: "flex",
      alignItems: "center",
      gap: 24,
      height: 60,
    },
    logo: {
      fontSize: 18,
      fontWeight: 700,
      color: "#e8b84b",
      display: "flex",
      alignItems: "center",
      gap: 8,
    },
    adminBadge: {
      background: "#e8b84b22",
      color: "#e8b84b",
      border: "1px solid #e8b84b44",
      borderRadius: 6,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: "0.06em",
    },
    nav: {
      display: "flex",
      gap: 4,
      marginLeft: "auto",
    },
    navBtn: (active: boolean) => ({
      background: active ? "rgba(232,184,75,0.12)" : "transparent",
      color: active ? "#e8b84b" : "#8b9ab5",
      border: active ? "1px solid rgba(232,184,75,0.3)" : "1px solid transparent",
      borderRadius: 8,
      padding: "6px 16px",
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      transition: "all 0.15s",
    }),
    content: {
      padding: 32,
      maxWidth: 1200,
      margin: "0 auto",
    },
    section: {
      marginBottom: 32,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: 600,
      color: "#8b9ab5",
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      marginBottom: 16,
    },
    kpiRow: {
      display: "flex",
      gap: 16,
      flexWrap: "wrap" as const,
    },
    card: {
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: 24,
    },
    table: {
      width: "100%",
      borderCollapse: "collapse" as const,
    },
    th: {
      textAlign: "left" as const,
      padding: "10px 12px",
      fontSize: 11,
      fontWeight: 600,
      color: "#8b9ab5",
      textTransform: "uppercase" as const,
      letterSpacing: "0.06em",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
    },
    td: {
      padding: "12px 12px",
      fontSize: 13,
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      color: "#e2e8f0",
    },
    input: {
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 8,
      padding: "8px 14px",
      fontSize: 13,
      color: "#e2e8f0",
      outline: "none",
      width: 280,
      marginBottom: 16,
    },
  };

  if (isLoading || (loading && !error)) {
    return (
      <div style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>⚙️</div>
          <div style={{ color: "#8b9ab5" }}>Loading admin console...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Admin Access Required</div>
          <div style={{ color: "#8b9ab5", marginBottom: 24, lineHeight: 1.6 }}>{error}</div>
          <button onClick={() => navigate("/dashboard")} style={{
            background: "#e8b84b",
            color: "#0c1526",
            border: "none",
            borderRadius: 8,
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const filteredSubs = subscribers.filter((s) => {
    const q = subFilter.toLowerCase();
    return (
      !q ||
      s.orgName?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.tierName?.toLowerCase().includes(q) ||
      s.status?.toLowerCase().includes(q)
    );
  });

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logo}>
          <svg width="24" height="24" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="200" height="200" rx="44" fill="#12203d"/>
            <g transform="rotate(-35, 100, 100)">
              <rect x="40" y="66" width="120" height="38" rx="10" fill="#e8b84b"/>
              <rect x="84" y="102" width="32" height="14" rx="5" fill="#c9a03e"/>
              <rect x="88" y="113" width="24" height="76" rx="10" fill="#e8b84b"/>
            </g>
          </svg>
          Pillar
        </div>
        <span style={styles.adminBadge}>Admin Console</span>
        <nav style={styles.nav}>
          {tabs.map((t) => (
            <button
              key={t.key}
              style={styles.navBtn(tab === t.key)}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button onClick={() => navigate("/dashboard")} style={{
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          color: "#8b9ab5",
          padding: "6px 14px",
          fontSize: 12,
          cursor: "pointer",
          marginLeft: 8,
        }}>← Dashboard</button>
      </header>

      <main style={styles.content}>

        {tab === "overview" && overview && (
          <>
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Revenue</div>
              <div style={styles.kpiRow}>
                <KPICard label="MRR" value={fmt(overview.mrr)} sub="Monthly Recurring Revenue" />
                <KPICard label="ARR" value={fmt(overview.arr)} sub="Annual Run Rate" />
                <KPICard label="ARPU" value={fmt(overview.arpu)} sub="Avg Revenue Per User" />
              </div>
            </div>

            <div style={styles.section}>
              <div style={styles.sectionTitle}>Subscribers</div>
              <div style={styles.kpiRow}>
                <KPICard label="Active" value={overview.totalSubscribers.toString()} color="#34d399" sub="Paying subscriptions" />
                <KPICard label="New This Month" value={overview.newThisMonth.toString()} color="#60a5fa" sub="Joined since month start" />
                <KPICard label="Churned This Month" value={overview.churnedThisMonth.toString()} color="#f87171" sub="Canceled this month" />
                <KPICard label="Churn Rate" value={`${overview.churnRate}%`} color={overview.churnRate > 5 ? "#f87171" : "#34d399"} sub="Monthly churn" />
                <KPICard label="Total Orgs" value={overview.totalOrgs.toString()} color="#a78bfa" sub="All organizations" />
              </div>
            </div>

            <div style={styles.section}>
              <div style={styles.sectionTitle}>Revenue by Tier</div>
              <div style={styles.card}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Tier</th>
                      <th style={styles.th}>Price/mo</th>
                      <th style={styles.th}>Subscribers</th>
                      <th style={styles.th}>Monthly Revenue</th>
                      <th style={styles.th}>Annual Revenue</th>
                      <th style={styles.th}>% of MRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.tierBreakdown.map((t: any) => (
                      <tr key={t.tierId}>
                        <td style={styles.td}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                              width: 10, height: 10, borderRadius: "50%",
                              background: TIER_COLORS[t.tierId] ?? "#8b9ab5",
                              flexShrink: 0,
                            }} />
                            {t.tierName}
                          </span>
                        </td>
                        <td style={styles.td}>${t.price}</td>
                        <td style={styles.td}>{t.count}</td>
                        <td style={styles.td}>{fmt(t.revenue)}</td>
                        <td style={styles.td}>{fmt(t.revenue * 12)}</td>
                        <td style={styles.td}>
                          {overview.mrr > 0 ? ((t.revenue / overview.mrr) * 100).toFixed(1) : "0.0"}%
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...styles.td, fontWeight: 700, color: "#e8b84b" }} colSpan={2}>Total</td>
                      <td style={{ ...styles.td, fontWeight: 700 }}>{overview.totalSubscribers}</td>
                      <td style={{ ...styles.td, fontWeight: 700, color: "#e8b84b" }}>{fmt(overview.mrr)}</td>
                      <td style={{ ...styles.td, fontWeight: 700, color: "#e8b84b" }}>{fmt(overview.arr)}</td>
                      <td style={styles.td}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === "financials" && financials && (
          <>
            <div style={styles.section}>
              <div style={styles.sectionTitle}>MRR Trend (Last 6 Months)</div>
              <div style={styles.card}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={financials.monthly} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: "#8b9ab5", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#8b9ab5", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ background: "#1a2f4e", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0" }}
                      formatter={(v: number) => [`$${v}`, "MRR"]}
                    />
                    <Bar dataKey="mrr" fill="#e8b84b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div style={styles.section}>
                <div style={styles.sectionTitle}>New vs Churned</div>
                <div style={styles.card}>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={financials.monthly} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="label" tick={{ fill: "#8b9ab5", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#8b9ab5", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#1a2f4e", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0" }} />
                      <Line type="monotone" dataKey="newSubs" stroke="#34d399" strokeWidth={2} dot={{ fill: "#34d399" }} name="New" />
                      <Line type="monotone" dataKey="churned" stroke="#f87171" strokeWidth={2} dot={{ fill: "#f87171" }} name="Churned" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionTitle}>Revenue Split by Tier</div>
                <div style={styles.card}>
                  {financials.tierRevenue.map((t: any) => (
                    <div key={t.tierId} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: "#e2e8f0" }}>{t.tierName}</span>
                        <span style={{ fontSize: 13, color: "#8b9ab5" }}>{t.subscribers} subs · {fmt(t.monthlyRevenue)}/mo</span>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                        <div style={{
                          width: financials.totalMrr > 0 ? `${(t.monthlyRevenue / financials.totalMrr) * 100}%` : "0%",
                          background: TIER_COLORS[t.tierId] ?? "#8b9ab5",
                          height: "100%",
                          borderRadius: 4,
                          transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16, marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#e8b84b" }}>Total MRR</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#e8b84b" }}>{fmt(financials.totalMrr)}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "subscribers" && (
          <>
            <input
              style={styles.input}
              placeholder="Search by org, email, tier, status..."
              value={subFilter}
              onChange={(e) => setSubFilter(e.target.value)}
            />
            <div style={{ fontSize: 12, color: "#8b9ab5", marginBottom: 16 }}>
              {filteredSubs.length} of {subscribers.length} subscribers
            </div>
            <div style={styles.card}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Organization</th>
                    <th style={styles.th}>Email</th>
                    <th style={styles.th}>Tier</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>MRR</th>
                    <th style={styles.th}>Period End</th>
                    <th style={styles.th}>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubs.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ ...styles.td, textAlign: "center", color: "#8b9ab5", padding: 32 }}>
                        {subFilter ? "No matches found" : "No subscribers yet"}
                      </td>
                    </tr>
                  ) : filteredSubs.map((s) => (
                    <tr key={s.subId}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: 500 }}>{s.orgName ?? "—"}</div>
                        {s.orgType && <div style={{ fontSize: 11, color: "#8b9ab5" }}>{s.orgType}</div>}
                      </td>
                      <td style={{ ...styles.td, color: "#8b9ab5" }}>{s.email ?? "—"}</td>
                      <td style={styles.td}>
                        <span style={{ color: TIER_COLORS[s.tierId] ?? "#8b9ab5" }}>{s.tierName}</span>
                      </td>
                      <td style={styles.td}><Badge status={s.status} /></td>
                      <td style={styles.td}>{s.monthlyValue > 0 ? fmt(s.monthlyValue) : "—"}</td>
                      <td style={{ ...styles.td, color: "#8b9ab5" }}>
                        {s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ ...styles.td, color: "#8b9ab5" }}>
                        {new Date(s.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "trials" && (
          <>
            <div style={{ fontSize: 13, color: "#8b9ab5", marginBottom: 16 }}>
              Search for any organization and grant them a free trial at any plan level.
            </div>
            <input
              style={styles.input}
              placeholder="Search organizations by name or email..."
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
            />
            {grantTrialMsg && (
              <div style={{ background: "#16a34a22", border: "1px solid #16a34a", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#4ade80", fontSize: 13 }}>
                {grantTrialMsg}
              </div>
            )}
            {grantTrialOrg && (
              <div style={{ background: "#1a2540", border: "1px solid #e8b84b44", borderRadius: 10, padding: 20, marginBottom: 20 }}>
                <div style={{ fontWeight: 600, color: "#fff", marginBottom: 4 }}>{grantTrialOrg.name}</div>
                <div style={{ fontSize: 12, color: "#8b9ab5", marginBottom: 16 }}>{grantTrialOrg.email} · {grantTrialOrg.type}</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={grantTrialTierId}
                    onChange={(e) => setGrantTrialTierId(e.target.value)}
                    style={{ ...styles.input, width: "auto", marginBottom: 0 }}
                  >
                    <option value="tier1">Starter ($29/mo)</option>
                    <option value="tier1a">Autopilot ($59/mo)</option>
                    <option value="tier2">Events ($99/mo)</option>
                    <option value="tier3">Total Operations ($149/mo)</option>
                  </select>
                  <select
                    value={grantTrialMonths}
                    onChange={(e) => setGrantTrialMonths(Number(e.target.value))}
                    style={{ ...styles.input, width: "auto", marginBottom: 0 }}
                  >
                    {[1,2,3,6,12].map(m => (
                      <option key={m} value={m}>{m} month{m > 1 ? "s" : ""} free</option>
                    ))}
                  </select>
                  <button
                    disabled={grantingTrial}
                    onClick={async () => {
                      setGrantingTrial(true);
                      setGrantTrialMsg(null);
                      try {
                        const res = await apiFetch(`/api/admin/orgs/${grantTrialOrg.id}/grant-trial`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ tierId: grantTrialTierId, months: grantTrialMonths }),
                        });
                        if (res?.ok) {
                          setGrantTrialMsg(`✓ Granted ${grantTrialMonths}-month free trial to ${grantTrialOrg.name}`);
                          setGrantTrialOrg(null);
                          setOrgSearch("");
                          const orgs = await apiFetch("/api/admin/orgs");
                          setAllOrgs(Array.isArray(orgs) ? orgs : []);
                        }
                      } finally {
                        setGrantingTrial(false);
                      }
                    }}
                    style={{ background: "#e8b84b", color: "#0c1526", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    {grantingTrial ? "Granting..." : `Grant ${grantTrialMonths}-Month Trial`}
                  </button>
                  <button
                    onClick={() => setGrantTrialOrg(null)}
                    style={{ background: "transparent", color: "#8b9ab5", border: "1px solid #8b9ab544", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div style={styles.card}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Organization</th>
                    <th style={styles.th}>Email</th>
                    <th style={styles.th}>Current Plan</th>
                    <th style={styles.th}>Trial Ends</th>
                    <th style={styles.th}>Joined</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {allOrgs
                    .filter(o => {
                      const q = orgSearch.toLowerCase();
                      return !q || o.name?.toLowerCase().includes(q) || o.email?.toLowerCase().includes(q);
                    })
                    .slice(0, 50)
                    .map((o) => (
                      <tr key={o.id}>
                        <td style={styles.td}>
                          <div style={{ fontWeight: 500 }}>{o.name}</div>
                          {o.type && <div style={{ fontSize: 11, color: "#8b9ab5" }}>{o.type}</div>}
                        </td>
                        <td style={{ ...styles.td, color: "#8b9ab5" }}>{o.email ?? "—"}</td>
                        <td style={styles.td}>
                          {o.tier ? (
                            <span style={{ color: o.subscriptionStatus === "active" ? "#34d399" : "#8b9ab5" }}>
                              {o.tier} · {o.subscriptionStatus ?? "—"}
                            </span>
                          ) : <span style={{ color: "#8b9ab5" }}>None</span>}
                        </td>
                        <td style={{ ...styles.td, color: "#8b9ab5" }}>
                          {o.trialEndsAt ? new Date(o.trialEndsAt).toLocaleDateString() : "—"}
                        </td>
                        <td style={{ ...styles.td, color: "#8b9ab5" }}>
                          {new Date(o.createdAt).toLocaleDateString()}
                        </td>
                        <td style={styles.td}>
                          <button
                            onClick={() => { setGrantTrialOrg(o); setGrantTrialMsg(null); }}
                            style={{ background: "#e8b84b22", color: "#e8b84b", border: "1px solid #e8b84b44", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
                          >
                            Grant Trial
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "churn" && churn && (
          <>
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Churn Summary</div>
              <div style={styles.kpiRow}>
                <KPICard label="Total Canceled" value={churn.totalCanceled.toString()} color="#f87171" />
                <KPICard label="Churned This Month" value={churn.churnedThisMonth.toString()} color="#f87171" />
                <KPICard label="Churned Last Month" value={churn.churnedLastMonth.toString()} color="#fb923c" />
                <KPICard
                  label="Avg Lifetime"
                  value={churn.avgLifetimeDays != null ? `${churn.avgLifetimeDays}d` : "—"}
                  color="#60a5fa"
                  sub="Days before cancellation"
                />
              </div>
            </div>

            <div style={styles.section}>
              <div style={styles.sectionTitle}>Canceled Subscriptions</div>
              <div style={styles.card}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Organization</th>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Tier</th>
                      <th style={styles.th}>Canceled</th>
                      <th style={styles.th}>Lifetime</th>
                      <th style={styles.th}>Lost MRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {churn.canceled.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ ...styles.td, textAlign: "center", color: "#34d399", padding: 32 }}>
                          🎉 No cancellations yet
                        </td>
                      </tr>
                    ) : churn.canceled.map((c: any) => (
                      <tr key={c.subId}>
                        <td style={styles.td}>{c.orgName ?? "—"}</td>
                        <td style={{ ...styles.td, color: "#8b9ab5" }}>{c.email ?? "—"}</td>
                        <td style={styles.td}>
                          <span style={{ color: TIER_COLORS[c.tierId] ?? "#8b9ab5" }}>{c.tierName}</span>
                        </td>
                        <td style={{ ...styles.td, color: "#8b9ab5" }}>
                          {c.cancelledAt ? new Date(c.cancelledAt).toLocaleDateString() : "—"}
                        </td>
                        <td style={{ ...styles.td, color: "#8b9ab5" }}>
                          {c.lifetimeDays != null ? `${c.lifetimeDays}d` : "—"}
                        </td>
                        <td style={{ ...styles.td, color: "#f87171" }}>
                          {c.lostRevenue > 0 ? `-${fmt(c.lostRevenue)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === "health" && health && (
          <>
            <div style={styles.section}>
              <div style={styles.kpiRow}>
                <KPICard
                  label="Status"
                  value={health.status === "healthy" ? "Healthy" : "Degraded"}
                  color={health.status === "healthy" ? "#34d399" : "#f87171"}
                />
                <KPICard label="DB Latency" value={`${health.dbLatencyMs}ms`} color={health.dbLatencyMs < 100 ? "#34d399" : "#fb923c"} />
                <KPICard label="Uptime" value={`${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`} color="#60a5fa" />
                <KPICard label="Memory" value={`${health.memoryMb} MB`} color={health.memoryMb > 512 ? "#fb923c" : "#34d399"} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Database Records</div>
                <div style={styles.card}>
                  {[
                    { label: "Subscriptions", value: health.counts.subscriptions },
                    { label: "Organizations", value: health.counts.organizations },
                    { label: "Users", value: health.counts.users },
                  ].map((row) => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <span style={{ color: "#8b9ab5", fontSize: 13 }}>{row.label}</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionTitle}>Background Schedulers</div>
                <div style={styles.card}>
                  {Object.entries(health.schedulers).map(([name, interval]) => (
                    <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <span style={{ color: "#8b9ab5", fontSize: 13, textTransform: "capitalize" }}>
                        {name.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#34d399", display: "inline-block" }} />
                        <span style={{ color: "#34d399" }}>Running · {interval as string}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={styles.section}>
              <div style={styles.sectionTitle}>Environment</div>
              <div style={styles.card}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {[
                    { label: "Node.js", value: health.nodeVersion },
                    { label: "Environment", value: health.env },
                    { label: "DB Connection", value: "PostgreSQL · Connected" },
                    { label: "AI Provider", value: "OpenAI (gpt-4o-mini / gpt-5-mini)" },
                  ].map((row) => (
                    <div key={row.label}>
                      <div style={{ fontSize: 11, color: "#8b9ab5", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{row.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{row.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "agents" && (
          <div>
            {/* Email config warning */}
            {agents.length > 0 && !agents[0]?.emailConfigured && (
              <div style={{ background: "#78350f22", border: "1px solid #d9770644", borderRadius: 10, padding: "12px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 600, color: "#fb923c", fontSize: 13 }}>Email not configured — agents are running in simulation mode</div>
                  <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>Add a <code style={{ color: "#e8b84b" }}>RESEND_API_KEY</code> secret to enable real email delivery. All other agent logic is active.</div>
                </div>
              </div>
            )}

            {/* Agent cards */}
            <div style={{ ...styles.section }}>
              <div style={styles.sectionTitle}>Autonomous Agents</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {agents.map((agent: any) => (
                  <div key={agent.name} style={{ ...styles.card, padding: "20px 22px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#e2e8f0" }}>{agent.label}</div>
                      <span style={{ background: "#16a34a22", color: "#4ade80", border: "1px solid #16a34a44", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>ACTIVE</span>
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>{agent.description}</div>
                    <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
                      <div><span style={{ color: "#64748b" }}>Schedule</span><br /><span style={{ color: "#e8b84b", fontWeight: 600 }}>{agent.schedule}</span></div>
                      <div><span style={{ color: "#64748b" }}>Actions today</span><br /><span style={{ color: "#e8b84b", fontWeight: 600 }}>{agent.actionsToday}</span></div>
                      <div><span style={{ color: "#64748b" }}>Errors</span><br /><span style={{ color: agent.totalErrors > 0 ? "#f87171" : "#4ade80", fontWeight: 600 }}>{agent.totalErrors}</span></div>
                    </div>
                    {agent.lastRun && (
                      <div style={{ marginTop: 12, fontSize: 11, color: "#475569" }}>Last run: {new Date(agent.lastRun).toLocaleString()}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Activity log */}
            <div style={{ ...styles.section }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={styles.sectionTitle}>Activity Log</div>
                <select
                  value={agentFilter}
                  onChange={e => setAgentFilter(e.target.value)}
                  style={{ background: "#0f1e35", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", marginTop: -4 }}
                >
                  <option value="all">All agents</option>
                  <option value="customerSuccess">Customer Success</option>
                  <option value="operations">Operations</option>
                  <option value="content">Content</option>
                  <option value="outreach">Outreach</option>
                </select>
              </div>
              <div style={{ ...styles.card, padding: 0, overflow: "hidden" }}>
                {agentLogs.filter((l: any) => agentFilter === "all" || l.agentName === agentFilter).slice(0, 30).length === 0 ? (
                  <div style={{ padding: "32px", textAlign: "center", color: "#64748b", fontSize: 13 }}>No activity yet — agents will log their work here as they run.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        {["Time", "Agent", "Action", "Target", "Status"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontWeight: 600, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agentLogs.filter((l: any) => agentFilter === "all" || l.agentName === agentFilter).slice(0, 30).map((log: any) => (
                        <tr key={log.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "9px 14px", color: "#64748b" }}>{new Date(log.createdAt).toLocaleTimeString()}</td>
                          <td style={{ padding: "9px 14px" }}>
                            <span style={{ background: "#e8b84b22", color: "#e8b84b", borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 600 }}>{log.agentName}</span>
                          </td>
                          <td style={{ padding: "9px 14px", color: "#cbd5e1" }}>{log.action.replace(/_/g, " ")}</td>
                          <td style={{ padding: "9px 14px", color: "#64748b", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.targetEmail ?? log.targetId ?? "—"}</td>
                          <td style={{ padding: "9px 14px" }}>
                            <span style={{
                              background: log.status === "success" ? "#16a34a22" : log.status === "error" ? "#dc262622" : "#64748b22",
                              color: log.status === "success" ? "#4ade80" : log.status === "error" ? "#f87171" : "#94a3b8",
                              borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 600,
                            }}>{log.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Content queue */}
            <div style={{ ...styles.section }}>
              <div style={styles.sectionTitle}>Content Queue — Marketing Posts ({contentQueue.filter((c: any) => c.status === "draft").length} drafts pending)</div>
              {contentQueue.length === 0 ? (
                <div style={{ ...styles.card, padding: "28px", textAlign: "center", color: "#64748b", fontSize: 13 }}>No content yet. The Content agent generates 5 posts daily. First batch runs within 24 hours.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {contentQueue.map((item: any) => (
                    <div key={item.id} style={{ ...styles.card, padding: "16px 20px", borderLeft: `3px solid ${item.platform === "linkedin" ? "#0077b5" : item.platform === "facebook" ? "#1877f2" : "#e8b84b"}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#64748b" }}>{item.platform}</span>
                            {item.angle && <span style={{ fontSize: 11, color: "#475569" }}>· {item.angle}</span>}
                          </div>
                          <div style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{item.content}</div>
                          {item.hashtags && <div style={{ marginTop: 8, color: "#60a5fa", fontSize: 12 }}>{item.hashtags}</div>}
                        </div>
                        {item.status === "draft" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={async () => {
                                const updated = await apiFetch(`/api/admin/content-queue/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) });
                                setContentQueue(prev => prev.map(c => c.id === item.id ? updated : c));
                              }}
                              style={{ background: "#16a34a22", color: "#4ade80", border: "1px solid #16a34a44", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}
                            >Approve</button>
                            <button
                              onClick={async () => {
                                const updated = await apiFetch(`/api/admin/content-queue/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "rejected" }) });
                                setContentQueue(prev => prev.map(c => c.id === item.id ? updated : c));
                              }}
                              style={{ background: "#dc262622", color: "#f87171", border: "1px solid #dc262644", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}
                            >Reject</button>
                          </div>
                        )}
                        {item.status !== "draft" && (
                          <span style={{
                            background: item.status === "approved" ? "#16a34a22" : item.status === "posted" ? "#7c3aed22" : "#dc262622",
                            color: item.status === "approved" ? "#4ade80" : item.status === "posted" ? "#a78bfa" : "#f87171",
                            border: `1px solid ${item.status === "approved" ? "#16a34a44" : item.status === "posted" ? "#7c3aed44" : "#dc262644"}`,
                            borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const,
                          }}>{item.status}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outreach prospects */}
            <div style={{ ...styles.section }}>
              <div style={styles.sectionTitle}>Outreach Prospects ({prospects.filter((p: any) => p.status === "pending").length} pending · {prospects.filter((p: any) => p.status === "contacted").length} contacted · {prospects.filter((p: any) => p.status === "converted").length} converted)</div>
              {/* Add prospect form */}
              <div style={{ ...styles.card, padding: "18px 20px", marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#e2e8f0", marginBottom: 12 }}>Add prospect</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                  {[
                    { key: "orgName", label: "Organization name *" },
                    { key: "orgType", label: "Type (lodge / hoa / nonprofit…)" },
                    { key: "contactName", label: "Contact name" },
                    { key: "contactRole", label: "Role (Secretary, President…)" },
                    { key: "contactEmail", label: "Email *" },
                    { key: "currentWebsite", label: "Current website (optional)" },
                  ].map(f => (
                    <input
                      key={f.key}
                      placeholder={f.label}
                      value={prospectForm[f.key] ?? ""}
                      onChange={e => setProspectForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      style={{ background: "#0c1526", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0", borderRadius: 6, padding: "7px 12px", fontSize: 12, outline: "none" }}
                    />
                  ))}
                </div>
                <textarea
                  placeholder="Notes (optional)"
                  value={prospectForm.notes ?? ""}
                  onChange={e => setProspectForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  style={{ width: "100%", background: "#0c1526", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0", borderRadius: 6, padding: "7px 12px", fontSize: 12, resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: 10 }}
                />
                <button
                  disabled={prospectAdding || !prospectForm.orgName || !prospectForm.contactEmail}
                  onClick={async () => {
                    setProspectAdding(true);
                    try {
                      const row = await apiFetch("/api/admin/prospects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prospectForm) });
                      setProspects(prev => [row, ...prev]);
                      setProspectForm({});
                    } catch {}
                    setProspectAdding(false);
                  }}
                  style={{ background: "#e8b84b", color: "#0c1526", border: "none", borderRadius: 7, padding: "8px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: prospectAdding ? 0.6 : 1 }}
                >
                  {prospectAdding ? "Adding…" : "Add to outreach queue"}
                </button>
              </div>
              {/* Prospects table */}
              {prospects.length === 0 ? (
                <div style={{ ...styles.card, padding: "28px", textAlign: "center", color: "#64748b", fontSize: 13 }}>No prospects yet. Add organizations above and the Outreach agent will contact them automatically.</div>
              ) : (
                <div style={{ ...styles.card, padding: 0, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        {["Organization", "Contact", "Email", "Type", "Emails sent", "Status", ""].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontWeight: 600, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.05em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {prospects.map((p: any) => {
                        const statusColors: Record<string, [string, string]> = {
                          pending: ["#64748b", "#1e293b"],
                          contacted: ["#3b82f6", "#1e3a5f"],
                          replied: ["#a78bfa", "#2d1b69"],
                          converted: ["#4ade80", "#14532d"],
                          noresponse: ["#6b7280", "#111827"],
                          unsubscribed: ["#f87171", "#450a0a"],
                        };
                        const [sc, sb] = statusColors[p.status] ?? ["#64748b", "#1e293b"];
                        return (
                          <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "9px 14px", fontWeight: 600, color: "#e2e8f0" }}>{p.orgName}</td>
                            <td style={{ padding: "9px 14px", color: "#94a3b8" }}>{p.contactName ?? "—"}{p.contactRole ? `, ${p.contactRole}` : ""}</td>
                            <td style={{ padding: "9px 14px", color: "#60a5fa" }}>{p.contactEmail}</td>
                            <td style={{ padding: "9px 14px", color: "#64748b" }}>{p.orgType ?? "—"}</td>
                            <td style={{ padding: "9px 14px", color: "#e8b84b", textAlign: "center" }}>{p.emailsSent ?? 0}</td>
                            <td style={{ padding: "9px 14px" }}>
                              <select
                                value={p.status}
                                onChange={async (e) => {
                                  const updated = await apiFetch(`/api/admin/prospects/${p.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: e.target.value }) });
                                  setProspects(prev => prev.map(x => x.id === p.id ? updated : x));
                                }}
                                style={{ background: sb, color: sc, border: `1px solid ${sc}44`, borderRadius: 5, padding: "3px 7px", fontSize: 11, cursor: "pointer" }}
                              >
                                {["pending", "contacted", "replied", "converted", "noresponse", "unsubscribed"].map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: "9px 14px" }}>
                              <button
                                onClick={async () => {
                                  await apiFetch(`/api/admin/prospects/${p.id}`, { method: "DELETE" });
                                  setProspects(prev => prev.filter(x => x.id !== p.id));
                                }}
                                style={{ background: "transparent", border: "none", color: "#475569", cursor: "pointer", fontSize: 14, padding: "2px 6px" }}
                              >✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "support" && (
          <div style={styles.section}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={styles.sectionTitle}>Support Tickets ({tickets.length})</div>
              <div style={{ display: "flex", gap: 8 }}>
                {["open", "in_progress", "resolved"].map(s => (
                  <span key={s} style={{
                    background: s === "open" ? "#dc262622" : s === "in_progress" ? "#d9770622" : "#16a34a22",
                    color: s === "open" ? "#f87171" : s === "in_progress" ? "#fb923c" : "#34d399",
                    border: `1px solid ${s === "open" ? "#dc262644" : s === "in_progress" ? "#d9770644" : "#16a34a44"}`,
                    borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 600,
                  }}>
                    {tickets.filter(t => t.status === s).length} {s.replace("_", " ")}
                  </span>
                ))}
              </div>
            </div>
            {tickets.length === 0 ? (
              <div style={{ ...styles.card, textAlign: "center", padding: "40px 24px" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                <div style={{ color: "#8b9ab5", fontSize: 14 }}>No support tickets yet</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {tickets.map((ticket: any) => (
                  <div key={ticket.id} style={{
                    ...styles.card,
                    borderLeft: `3px solid ${ticket.severity === "critical" ? "#dc2626" : ticket.severity === "high" ? "#d97706" : ticket.severity === "low" ? "#6b7280" : "#3b82f6"}`,
                    padding: "16px 20px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{ticket.subject}</span>
                          <span style={{
                            background: ticket.severity === "critical" ? "#dc262622" : ticket.severity === "high" ? "#d9770622" : "#3b82f622",
                            color: ticket.severity === "critical" ? "#f87171" : ticket.severity === "high" ? "#fb923c" : "#60a5fa",
                            border: `1px solid ${ticket.severity === "critical" ? "#dc262644" : ticket.severity === "high" ? "#d9770644" : "#3b82f644"}`,
                            borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                          }}>{ticket.severity}</span>
                        </div>
                        <div style={{ color: "#8b9ab5", fontSize: 12, marginBottom: 8 }}>
                          {ticket.orgName ?? "Unknown org"} · {ticket.userEmail ?? ticket.userId} · {new Date(ticket.createdAt).toLocaleDateString()}
                        </div>
                        <div style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{ticket.description}</div>
                        {ticket.adminNotes && (
                          <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(232,184,75,0.08)", border: "1px solid rgba(232,184,75,0.2)", borderRadius: 6, fontSize: 12, color: "#e8b84b" }}>
                            <strong>Admin notes:</strong> {ticket.adminNotes}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, minWidth: 140 }}>
                        <select
                          value={ticket.status}
                          disabled={ticketUpdating === ticket.id}
                          onChange={async (e) => {
                            const newStatus = e.target.value;
                            setTicketUpdating(ticket.id);
                            try {
                              const updated = await apiFetch(`/api/support/tickets/${ticket.id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: newStatus }),
                              });
                              setTickets(prev => prev.map(t => t.id === ticket.id ? updated : t));
                            } catch {}
                            setTicketUpdating(null);
                          }}
                          style={{
                            background: "#0f1e35", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0",
                            borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer", width: "100%",
                          }}
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
