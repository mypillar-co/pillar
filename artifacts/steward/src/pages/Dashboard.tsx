import React, { useEffect, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  DollarSign,
  Users,
  ArrowRight,
  Bell,
  Zap,
  TrendingUp,
  Globe,
  Share2,
  Sparkles,
  ChevronRight,
  CreditCard,
  Lock,
  Activity,
  Settings,
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useGetOrganization,
  useGetSubscription,
  useListTiers,
  useCreateCheckoutSession,
  useCreatePortalSession,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type HealthLevel = "good" | "attention" | "critical";

interface AttentionItem {
  id: string;
  label: string;
  description: string;
  href: string;
  severity: "warning" | "error";
  icon: React.ElementType;
}

interface UpcomingItem {
  id: string;
  label: string;
  sublabel: string;
  date?: string;
  href: string;
  icon: React.ElementType;
}

interface DashboardData {
  unreadNotifications: number;
  notifications: Array<{ id: string; type: string; title: string; message: string; isRead: boolean; createdAt: string }>;
  upcomingEvents: Array<{ id: string; title: string; date: string; ticketCount?: number }>;
  stats: { activeEvents: number; totalVendors: number; totalSponsors: number; totalRevenue: number; totalContacts: number };
  hasSite: boolean;
}

function useCommandCenterData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [notifRes, eventsRes, statsRes, sitesRes] = await Promise.allSettled([
        fetch(`${BASE}/api/notifications`, { credentials: "include" }),
        fetch(`${BASE}/api/events`, { credentials: "include" }),
        fetch(`${BASE}/api/stats`, { credentials: "include" }),
        fetch(`${BASE}/api/community-site/status`, { credentials: "include" }),
      ]);

      const notifData = notifRes.status === "fulfilled" && notifRes.value.ok
        ? (await notifRes.value.json()) as { notifications?: DashboardData["notifications"]; unreadCount?: number }
        : { notifications: [], unreadCount: 0 };

      const eventsData = eventsRes.status === "fulfilled" && eventsRes.value.ok
        ? (await eventsRes.value.json()) as { events?: DashboardData["upcomingEvents"] }
        : { events: [] };

      const statsData = statsRes.status === "fulfilled" && statsRes.value.ok
        ? (await statsRes.value.json()) as DashboardData["stats"]
        : { activeEvents: 0, totalVendors: 0, totalSponsors: 0, totalRevenue: 0, totalContacts: 0 };

      const siteStatusData = sitesRes.status === "fulfilled" && sitesRes.value.ok
        ? (await sitesRes.value.json()) as { url?: string | null }
        : { url: null };

      const now = new Date();
      const upcoming = (eventsData.events ?? [])
        .filter(e => e.date && new Date(e.date) > now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 5);

      setData({
        unreadNotifications: notifData.unreadCount ?? (notifData.notifications ?? []).filter(n => !n.isRead).length,
        notifications: (notifData.notifications ?? []).filter(n => !n.isRead).slice(0, 5),
        upcomingEvents: upcoming,
        stats: statsData,
        hasSite: !!(siteStatusData.url),
      });
    } catch {
      // Gracefully degrade
      setData({
        unreadNotifications: 0,
        notifications: [],
        upcomingEvents: [],
        stats: { activeEvents: 0, totalVendors: 0, totalSponsors: 0, totalRevenue: 0, totalContacts: 0 },
        hasSite: false,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);
  return { data, loading, refetch: fetchAll };
}

function computeHealth(
  data: DashboardData | null,
  isSubscribed: boolean,
  stripeConnected: boolean,
): { level: HealthLevel; reasons: string[] } {
  if (!isSubscribed) return { level: "attention", reasons: ["No active plan — subscribe to activate Pillar"] };
  const reasons: string[] = [];
  if (!stripeConnected) reasons.push("Stripe not connected — payments are unavailable");
  if ((data?.unreadNotifications ?? 0) > 5) reasons.push(`${data?.unreadNotifications} unread notifications`);
  if (!data?.hasSite) reasons.push("Website not yet set up");
  if (reasons.length === 0) {
    const positives: string[] = [];
    if (data?.hasSite) positives.push("Website is live");
    if (stripeConnected) positives.push("Payments connected");
    if ((data?.upcomingEvents?.length ?? 0) > 0) positives.push(`${data?.upcomingEvents.length} upcoming event${data?.upcomingEvents.length === 1 ? "" : "s"}`);
    return { level: "good", reasons: positives };
  }
  return { level: reasons.length >= 2 ? "critical" : "attention", reasons };
}

function buildAttentionItems(data: DashboardData | null, stripeConnected: boolean, isSubscribed: boolean): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (!isSubscribed) {
    items.push({ id: "no-sub", label: "No active plan", description: "Subscribe to unlock all features.", href: "/billing", severity: "error", icon: CreditCard });
  }
  if (!stripeConnected && isSubscribed) {
    items.push({ id: "no-stripe", label: "Payments not connected", description: "Connect Stripe to accept payments and ticket sales.", href: "/dashboard/payments", severity: "error", icon: DollarSign });
  }
  if (!data?.hasSite && isSubscribed) {
    items.push({ id: "no-site", label: "Website not set up", description: "Build your organization's website with AI.", href: "/dashboard/site", severity: "warning", icon: Globe });
  }
  for (const n of (data?.notifications ?? [])) {
    if (items.length >= 5) break;
    items.push({ id: n.id, label: n.title, description: n.message, href: "/dashboard/settings", severity: "warning", icon: Bell });
  }
  return items;
}

function buildUpcomingItems(data: DashboardData | null): UpcomingItem[] {
  return (data?.upcomingEvents ?? []).map(e => ({
    id: e.id,
    label: e.title,
    sublabel: `${e.ticketCount ?? 0} registrations`,
    date: e.date,
    href: `/dashboard/events/${e.id}`,
    icon: Calendar,
  }));
}

function formatDaysUntil(dateStr: string): string {
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  if (days < 14) return "Next week";
  return `In ${Math.round(days / 7)} weeks`;
}

const HEALTH_CONFIG: Record<HealthLevel, { color: string; bg: string; border: string; dot: string; label: string; Icon: React.ElementType }> = {
  good: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25", dot: "bg-emerald-400", label: "Running well", Icon: CheckCircle2 },
  attention: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/25", dot: "bg-amber-400", label: "Needs attention", Icon: AlertTriangle },
  critical: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/25", dot: "bg-red-400", label: "Action required", Icon: XCircle },
};

const QUICK_ACTIONS = [
  { label: "New Event", href: "/dashboard/events", icon: Calendar, description: "Create and manage events" },
  { label: "Post to Social", href: "/dashboard/social", icon: Share2, description: "Schedule social updates" },
  { label: "Generate Content", href: "/dashboard/studio", icon: Sparkles, description: "AI-powered content" },
  { label: "Update Website", href: "/dashboard/site", icon: Globe, description: "Edit your live site" },
];

// ─── Command Center (subscribed) ─────────────────────────────────────────────

function CommandCenter({ org, subData }: { org: { name: string; type?: string | null; stripeAccountId?: string | null }; subData: { hasSubscription: boolean; tierId?: string | null; tierName?: string | null; status?: string | null } }) {
  const { data, loading } = useCommandCenterData();
  const { mutate: createPortal, isPending: portalPending } = useCreatePortalSession();

  const stripeConnected = !!(org.stripeAccountId);
  const { level, reasons } = computeHealth(data, subData.hasSubscription, stripeConnected);
  const attentionItems = buildAttentionItems(data, stripeConnected, subData.hasSubscription);
  const upcomingItems = buildUpcomingItems(data);
  const hConfig = HEALTH_CONFIG[level];

  const handleManageBilling = () => {
    createPortal(undefined, {
      onSuccess: (d) => { if (d.url) window.location.href = d.url; },
      onError: () => toast.error("Failed to open billing portal."),
    });
  };

  return (
    <div className="space-y-6">
      {/* Health Banner */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className={cn("rounded-2xl border p-5", hConfig.bg, hConfig.border)}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", hConfig.bg)}>
                <hConfig.Icon className={cn("w-5 h-5", hConfig.color)} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full animate-pulse", hConfig.dot)} />
                  <span className={cn("font-semibold text-sm", hConfig.color)}>
                    Organization Health: {hConfig.label}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {reasons.slice(0, 2).join(" · ") || "Everything is running smoothly"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge className="bg-white/5 text-slate-300 border-white/10 text-xs">
                {subData.tierName ?? subData.tierId ?? "Active"}
              </Badge>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400 hover:text-white" onClick={handleManageBilling} disabled={portalPending}>
                <Settings className="w-3 h-3 mr-1" />Billing
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Needs Attention */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }} className="lg:col-span-2">
          <Card className="border-white/10 bg-card/40 h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-400" />
                  Needs Attention
                </CardTitle>
                {attentionItems.length > 0 && (
                  <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-xs">
                    {attentionItems.length}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : attentionItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                  <p className="text-sm font-medium text-white">All clear</p>
                  <p className="text-xs text-slate-500 mt-1">No action items right now.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {attentionItems.map(item => (
                    <Link href={item.href} key={item.id}>
                      <div className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:border-white/20 hover:bg-white/5 group",
                        item.severity === "error" ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"
                      )}>
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                          item.severity === "error" ? "bg-red-500/15" : "bg-amber-500/15")}>
                          <item.icon className={cn("w-4 h-4", item.severity === "error" ? "text-red-400" : "text-amber-400")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{item.label}</p>
                          <p className="text-xs text-slate-400 truncate">{item.description}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors flex-shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Upcoming */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}>
          <Card className="border-white/10 bg-card/40 h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Upcoming
                </CardTitle>
                <Link href="/dashboard/events">
                  <span className="text-xs text-slate-500 hover:text-primary cursor-pointer transition-colors">View all</span>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2].map(i => <div key={i} className="h-14 rounded-lg bg-white/5 animate-pulse" />)}
                </div>
              ) : upcomingItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Calendar className="w-7 h-7 text-slate-600 mb-2" />
                  <p className="text-sm text-slate-500">No upcoming events</p>
                  <Link href="/dashboard/events">
                    <span className="text-xs text-primary cursor-pointer hover:text-primary/80 mt-1 inline-block">Create one →</span>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingItems.map(item => (
                    <Link href={item.href} key={item.id}>
                      <div className="flex items-center gap-3 p-3 rounded-xl border border-white/8 bg-white/[0.02] hover:border-white/20 hover:bg-white/5 cursor-pointer transition-all group">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Calendar className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{item.label}</p>
                          <p className="text-xs text-primary/70">{formatDaysUntil(item.date!)}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 flex-shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Stats Row */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.15 }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Contacts", value: data?.stats.totalContacts ?? 0, icon: Users, href: "/dashboard/contacts" },
            { label: "Active Events", value: data?.stats.activeEvents ?? 0, icon: Calendar, href: "/dashboard/events" },
            { label: "Sponsors", value: data?.stats.totalSponsors ?? 0, icon: TrendingUp, href: "/dashboard/sponsors" },
            { label: "Total Revenue", value: data?.stats.totalRevenue ? `$${(data.stats.totalRevenue / 100).toLocaleString()}` : "$0", icon: DollarSign, href: "/dashboard/payments" },
          ].map(stat => (
            <Link href={stat.href} key={stat.label}>
              <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 hover:border-white/20 hover:bg-white/5 cursor-pointer transition-all">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs text-slate-400">{stat.label}</span>
                </div>
                <p className="text-xl font-bold text-white">{loading ? "—" : stat.value}</p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }}>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map(action => (
            <Link href={action.href} key={action.label}>
              <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 hover:border-primary/30 hover:bg-primary/5 cursor-pointer transition-all group">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                  <action.icon className="w-4 h-4 text-primary" />
                </div>
                <p className="text-sm font-medium text-white">{action.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{action.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Pricing Grid (no subscription) ──────────────────────────────────────────

function PricingGrid({ orgName }: { orgName: string }) {
  const { data: tiersData } = useListTiers();
  const { mutate: createCheckout, isPending: checkoutPending } = useCreateCheckoutSession();
  const handleSubscribe = (tierId: string) => {
    createCheckout({ data: { tierId } }, {
      onSuccess: (d) => { if (d.url) window.location.href = d.url; },
      onError: (err) => toast.error("Failed to start checkout. " + (err instanceof Error ? err.message : "Please try again.")),
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium mb-4">
          <Zap className="w-3 h-3" />
          14-day free trial — no credit card required
        </div>
        <h2 className="text-2xl font-bold text-white">Activate Pillar for {orgName}</h2>
        <p className="text-slate-400 mt-1">Choose the plan that fits how your organization operates.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {tiersData?.tiers.map((tier) => (
          <Card key={tier.id} className={cn("relative flex flex-col", tier.highlight ? "border-primary shadow-xl shadow-primary/10" : "border-white/10")}>
            {tier.highlight && (
              <div className="absolute -top-3 inset-x-0 flex justify-center">
                <Badge className="bg-primary text-primary-foreground px-3 text-xs">Most Popular</Badge>
              </div>
            )}
            <CardHeader className="pb-3">
              <CardTitle className="text-base leading-tight">{tier.name.split("—")[0].trim()}</CardTitle>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-bold text-white">${tier.price}</span>
                <span className="text-slate-400 text-sm">/mo</span>
              </div>
              <CardDescription className="text-xs leading-relaxed">{tier.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-3">
              <ul className="space-y-2">
                {tier.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full" variant={tier.highlight ? "default" : "secondary"} onClick={() => handleSubscribe(tier.id)} disabled={checkoutPending}>
                {checkoutPending ? "Processing..." : <><Zap className="w-4 h-4 mr-2" />Get started</>}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="mt-6 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
        <Lock className="w-3.5 h-3.5" />
        Billed monthly. Cancel anytime. No setup fees.
      </div>
    </motion.div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: orgData, isLoading: orgLoading } = useGetOrganization();
  const { data: subData, isLoading: subLoading, refetch: refetchSub } = useGetSubscription();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/");
    else if (!orgLoading && !authLoading && !orgData?.organization) setLocation("/onboard");
  }, [isAuthenticated, authLoading, orgData, orgLoading, setLocation]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (billing === "success") { toast.success("Subscription updated successfully!"); void refetchSub(); }
    else if (billing === "cancelled") toast.info("Checkout cancelled.");
    if (billing) window.history.replaceState({}, document.title, window.location.pathname);
  }, [refetchSub]);

  if (authLoading || orgLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  const org = orgData?.organization;
  if (!org) return null;

  const isSubscribed = subData?.hasSubscription === true;

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Page Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {user?.firstName ? `Good to see you, ${user.firstName}` : "Command Center"}
              </h1>
              <p className="text-slate-400 text-sm mt-0.5 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                {org.name}
                {org.type && <span className="text-slate-600">·</span>}
                {org.type && <span className="capitalize">{org.type}</span>}
              </p>
            </div>
            {isSubscribed && (
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/15 text-primary border-primary/20 gap-1.5 px-3 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Autopilot Active
                </Badge>
              </div>
            )}
          </div>
        </motion.div>

        {isSubscribed ? (
          <CommandCenter org={org as { name: string; type?: string | null; stripeAccountId?: string | null }} subData={{ hasSubscription: true, tierId: subData?.tierId ?? null, tierName: subData?.tierName ?? null, status: subData?.status ?? null }} />
        ) : (
          <PricingGrid orgName={org.name ?? "your organization"} />
        )}
      </div>
    </div>
  );
}
