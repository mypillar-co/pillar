import React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  Users,
  Star,
  ArrowRight,
  Plus,
  Globe,
  Share2,
  DollarSign,
  Bell,
  ChevronRight,
  Clock,
  TrendingUp,
  Activity,
  Sparkles,
  CreditCard,
  Settings,
} from "lucide-react";
import { useGetOrganization, useGetSubscription, useCreateCheckoutSession, useCreatePortalSession } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, type EventItem } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TIER_INCLUDES_EVENTS = new Set(["tier2", "tier3"]);
const TIER_INCLUDES_SOCIAL = new Set(["tier1a", "tier2", "tier3"]);

const TIER_LABELS: Record<string, string> = {
  tier1: "Starter", tier1a: "Autopilot", tier2: "Events", tier3: "Total Operations",
};

type HealthLevel = "good" | "attention" | "critical";

const HEALTH_CONFIG: Record<HealthLevel, {
  color: string; bg: string; border: string; dot: string; label: string; Icon: React.ElementType
}> = {
  good: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25", dot: "bg-emerald-400", label: "Running well", Icon: CheckCircle2 },
  attention: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/25", dot: "bg-amber-400", label: "Needs attention", Icon: AlertTriangle },
  critical: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/25", dot: "bg-red-400", label: "Action required", Icon: XCircle },
};

function formatDaysUntil(dateStr: string): string {
  const days = Math.ceil((new Date(dateStr + "T00:00:00").getTime() - Date.now()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  if (days < 14) return "Next week";
  return `In ${Math.round(days / 7)} weeks`;
}

interface AttentionItem {
  id: string;
  label: string;
  detail: string;
  href: string;
  severity: "error" | "warning";
  icon: React.ElementType;
}

export default function Overview() {
  const { data: orgData } = useGetOrganization();
  const org = orgData?.organization;
  const { data: subscription } = useGetSubscription();
  const { mutate: createCheckout } = useCreateCheckoutSession();
  const { mutate: createPortal, isPending: portalPending } = useCreatePortalSession();

  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => api.stats.get() });
  const { data: events } = useQuery({ queryKey: ["events"], queryFn: () => api.events.list() });
  const { data: siteData } = useQuery({
    queryKey: ["site-status"],
    queryFn: () => fetch("/api/sites/my", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });
  const { data: socialAccounts } = useQuery({
    queryKey: ["social-accounts"],
    queryFn: () => fetch("/api/social/accounts", { credentials: "include" }).then(r => r.ok ? r.json() : []),
  });
  const { data: notifData } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetch("/api/notifications", { credentials: "include" }).then(r => r.ok ? r.json() : { notifications: [], unreadCount: 0 }),
  });
  const { data: paymentData } = useQuery({
    queryKey: ["org-detail"],
    queryFn: () => fetch("/api/organizations", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });

  const currentTierId = subscription?.tierId ?? org?.tier ?? null;
  const hasPlan = !!currentTierId;
  const hasEvents = currentTierId ? TIER_INCLUDES_EVENTS.has(currentTierId) : false;
  const hasSocial = currentTierId ? TIER_INCLUDES_SOCIAL.has(currentTierId) : false;
  const hasSite = !!(siteData?.site?.generatedHtml);
  const socialConnected = Array.isArray(socialAccounts) && socialAccounts.length > 0;
  const stripeConnected = !!(paymentData?.organization?.stripeConnectAccountId ?? (org as unknown as { stripeConnectAccountId?: string | null })?.stripeConnectAccountId);
  const unreadNotifications: Array<{ id: string; title: string; message: string }> = notifData?.notifications?.filter((n: { isRead: boolean }) => !n.isRead)?.slice(0, 3) ?? [];

  const today = new Date().toISOString().split("T")[0];
  const upcomingEvents: EventItem[] = events?.filter((e: EventItem) => e.startDate && e.startDate >= today).slice(0, 4) ?? [];

  // Build attention items
  const attentionItems: AttentionItem[] = [];
  if (!hasPlan) {
    attentionItems.push({ id: "no-plan", label: "No active plan", detail: "Subscribe to unlock all Pillar features.", href: "/billing", severity: "error", icon: CreditCard });
  }
  if (hasPlan && hasEvents && !stripeConnected) {
    attentionItems.push({ id: "no-stripe", label: "Payments not connected", detail: "Connect Stripe to accept ticket sales and payments.", href: "/dashboard/payments", severity: "error", icon: DollarSign });
  }
  if (hasPlan && !hasSite) {
    attentionItems.push({ id: "no-site", label: "Website not set up", detail: "Build your organization's website in minutes with AI.", href: "/dashboard/site", severity: "warning", icon: Globe });
  }
  if (hasPlan && hasSocial && !socialConnected) {
    attentionItems.push({ id: "no-social", label: "Social media not connected", detail: "Link Facebook, Instagram, or X for automated posting.", href: "/dashboard/social", severity: "warning", icon: Share2 });
  }
  for (const n of unreadNotifications) {
    if (attentionItems.length >= 5) break;
    attentionItems.push({ id: n.id, label: n.title, detail: n.message, href: "/dashboard/settings", severity: "warning", icon: Bell });
  }

  // Compute health
  const errorCount = attentionItems.filter(i => i.severity === "error").length;
  const healthLevel: HealthLevel = !hasPlan ? "critical" : errorCount > 0 ? "critical" : attentionItems.length > 0 ? "attention" : "good";
  const hConfig = HEALTH_CONFIG[healthLevel];

  const healthReasons: string[] = healthLevel === "good"
    ? [hasSite && "Website live", stripeConnected && "Payments connected", upcomingEvents.length > 0 && `${upcomingEvents.length} upcoming event${upcomingEvents.length !== 1 ? "s" : ""}`, socialConnected && "Social connected"].filter(Boolean) as string[]
    : attentionItems.slice(0, 2).map(i => i.label);

  const handleUpgrade = (tierId: string) => {
    createCheckout({ data: { tierId } }, {
      onSuccess: (d) => { if (d.url) window.location.href = d.url; },
      onError: () => toast.error("Failed to start checkout. Please try again."),
    });
  };

  const handleBillingPortal = () => {
    createPortal(undefined, {
      onSuccess: (d) => { if (d.url) window.location.href = d.url; },
      onError: () => toast.error("Failed to open billing portal."),
    });
  };

  return (
    <div className="p-6 pb-10 space-y-6 max-w-6xl mx-auto">

      {/* Page header */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {org?.name ? org.name : "Command Center"}
            </h1>
            <p className="text-slate-400 text-sm mt-0.5 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              {org?.type ? <span className="capitalize">{org.type}</span> : "Your organization"}
              {currentTierId && (
                <span className="text-slate-600">·</span>
              )}
              {currentTierId && (
                <span>{TIER_LABELS[currentTierId] ?? currentTierId} Plan</span>
              )}
            </p>
          </div>
          {hasPlan && (
            <Button size="sm" variant="ghost" className="text-xs text-slate-400 hover:text-white self-start sm:self-auto" onClick={handleBillingPortal} disabled={portalPending}>
              <Settings className="w-3.5 h-3.5 mr-1.5" />Manage Billing
            </Button>
          )}
        </div>
      </motion.div>

      {/* Health Banner */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
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
                  {healthReasons.length > 0 ? healthReasons.join(" · ") : "Everything is running smoothly"}
                </p>
              </div>
            </div>
            {!hasPlan && (
              <Button size="sm" className="flex-shrink-0" onClick={() => handleUpgrade("tier1a")}>
                Activate Pillar
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Stats Row */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Contacts", value: stats?.totalContacts ?? 0, icon: Users, href: "/dashboard/contacts" },
            { label: "Active Events", value: stats?.activeEvents ?? 0, icon: Calendar, href: "/dashboard/events" },
            { label: "Sponsors", value: stats?.totalSponsors ?? 0, icon: Star, href: "/dashboard/sponsors" },
            { label: "Revenue", value: stats?.totalRevenue ? `$${(stats.totalRevenue / 100).toLocaleString()}` : "$0", icon: DollarSign, href: "/dashboard/payments" },
          ].map(stat => (
            <Link href={stat.href} key={stat.label}>
              <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 hover:border-white/20 hover:bg-white/5 cursor-pointer transition-all">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs text-slate-400">{stat.label}</span>
                </div>
                <p className="text-xl font-bold text-white">{stat.value}</p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Needs Attention + Upcoming grid */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Needs Attention */}
          <div className="lg:col-span-3">
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
                {attentionItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <CheckCircle2 className="w-9 h-9 text-emerald-400 mb-2" />
                    <p className="text-sm font-medium text-white">All clear</p>
                    <p className="text-xs text-slate-500 mt-1">No action items right now. Well done!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {attentionItems.map(item => (
                      <Link href={item.href} key={item.id}>
                        <div className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:border-white/25 hover:bg-white/5 group",
                          item.severity === "error"
                            ? "border-red-500/20 bg-red-500/[0.04]"
                            : "border-amber-500/20 bg-amber-500/[0.04]"
                        )}>
                          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                            item.severity === "error" ? "bg-red-500/15" : "bg-amber-500/15")}>
                            <item.icon className={cn("w-4 h-4", item.severity === "error" ? "text-red-400" : "text-amber-400")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{item.label}</p>
                            <p className="text-xs text-slate-400 truncate">{item.detail}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors flex-shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Upcoming Events */}
          <div className="lg:col-span-2">
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
                {upcomingEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Calendar className="w-7 h-7 text-slate-600 mb-2" />
                    <p className="text-sm text-slate-500">No upcoming events</p>
                    {hasPlan && (
                      <Link href="/dashboard/events">
                        <span className="text-xs text-primary cursor-pointer hover:text-primary/80 mt-2 inline-flex items-center gap-1">
                          <Plus className="w-3 h-3" />Create one
                        </span>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcomingEvents.map((event: EventItem) => (
                      <Link href={`/dashboard/events/${event.id}`} key={event.id}>
                        <div className="flex items-center gap-3 p-3 rounded-xl border border-white/8 bg-white/[0.02] hover:border-white/20 hover:bg-white/5 cursor-pointer transition-all group">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Calendar className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{event.name}</p>
                            <p className="text-xs text-primary/70">{event.startDate ? formatDaysUntil(event.startDate) : "Date TBD"}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 flex-shrink-0 transition-colors" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
        <div className="mb-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "New Event", desc: "Create and manage events", href: "/dashboard/events", icon: Calendar, locked: !hasEvents },
            { label: "Post to Social", desc: "Schedule social updates", href: "/dashboard/social", icon: Share2, locked: !hasSocial },
            { label: "Generate Content", desc: "AI-powered content studio", href: "/dashboard/studio", icon: Sparkles, locked: !hasPlan },
            { label: "Update Website", desc: "Edit your live site", href: "/dashboard/site", icon: Globe, locked: !hasPlan },
          ].map(action => (
            <Link href={action.locked ? "/billing" : action.href} key={action.label}>
              <div className={cn(
                "rounded-xl border p-4 cursor-pointer transition-all group",
                action.locked
                  ? "border-white/5 bg-white/[0.01] opacity-60 hover:opacity-80"
                  : "border-white/8 bg-white/[0.02] hover:border-primary/30 hover:bg-primary/5"
              )}>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2 transition-colors",
                  action.locked ? "bg-white/5" : "bg-primary/10 group-hover:bg-primary/20")}>
                  <action.icon className={cn("w-4 h-4", action.locked ? "text-slate-600" : "text-primary")} />
                </div>
                <p className="text-sm font-medium text-white">{action.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{action.locked ? "Upgrade to unlock" : action.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Upgrade CTA (if no plan) */}
      {!hasPlan && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }}>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">Put {org?.name ?? "your organization"} on autopilot</p>
                <p className="text-xs text-slate-400 mt-0.5">14-day free trial · No credit card required · Cancel anytime</p>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button size="sm" onClick={() => handleUpgrade("tier1a")}>
                Start free trial
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
              <Link href="/billing">
                <Button size="sm" variant="outline" className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5">
                  View plans
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
