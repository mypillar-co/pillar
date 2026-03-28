import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string) {
  const res = await fetch(`${API}${path}`, { credentials: "include" });
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

  const [tab, setTab] = useState<"overview" | "financials" | "subscribers" | "churn" | "health">("overview");
  const [overview, setOverview] = useState<any>(null);
  const [financials, setFinancials] = useState<any>(null);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [churn, setChurn] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subFilter, setSubFilter] = useState("");

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
    ])
      .then(([ov, fin, subs, ch, he]) => {
        setOverview(ov);
        setFinancials(fin);
        setSubscribers(subs);
        setChurn(ch);
        setHealth(he);
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
    { key: "health", label: "Server Health" },
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
          Steward
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
      </main>
    </div>
  );
}
