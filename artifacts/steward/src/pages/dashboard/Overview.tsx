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
  Sparkles,
  CreditCard,
  Settings,
  FileText,
  UserCheck,
  MessageSquare,
  Send,
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

function formatDaysUntil(dateStr: string): string {
  const days = Math.ceil((new Date(dateStr + "T00:00:00").getTime() - Date.now()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  if (days < 14) return "Next week";
  return `In ${Math.round(days / 7)} weeks`;
}

function formatTimeAgo(dateStr: string | Date): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

interface ActivityData {
  socialPostsPublished: number;
  contentDraftsGenerated: number;
  registrationsReceived: number;
  notificationsSent: number;
  upcomingEventsCount: number;
}

interface DecisionItem {
  id: string;
  label: string;
  detail: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

interface DecisionsData {
  pendingRegistrations: Array<{ id: string; name: string; type: string; createdAt: string }>;
  draftSocialPosts: Array<{ id: string; content: string; platform: string; scheduledAt: string | null }>;
  unreadNotifications: Array<{ id: string; title: string; body: string; type: string; createdAt: string }>;
  totalDecisions: number;
}

export default function Overview() {
  const { data: orgData } = useGetOrganization();
  const org = orgData?.organization;
  const { data: subscription } = useGetSubscription();
  const { mutate: createCheckout } = useCreateCheckoutSession();
  const { mutate: createPortal, isPending: portalPending } = useCreatePortalSession();

  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => api.stats.get() });
  const { data: activity } = useQuery<ActivityData>({
    queryKey: ["stats-activity"],
    queryFn: () => fetch("/api/stats/activity", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });
  const { data: decisions } = useQuery<DecisionsData>({
    queryKey: ["stats-decisions"],
    queryFn: () => fetch("/api/stats/decisions", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });
  const { data: events } = useQuery({ queryKey: ["events"], queryFn: () => api.events.list() });
  const { data: siteData } = useQuery({
    queryKey: ["site-status"],
    queryFn: () => fetch("/api/sites/my", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });
  const { data: socialAccounts } = useQuery({
    queryKey: ["social-accounts"],
    queryFn: () => fetch("/api/social/accounts", { credentials: "include" }).then(r => r.ok ? r.json() : []),
  });
  const { data: paymentData } = useQuery({
    queryKey: ["org-detail"],
    queryFn: () => fetch("/api/organizations", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });

  const currentTierId = (subscription?.tierId || org?.tier) || null;
  const hasPlan = !!currentTierId;
  const hasEvents = currentTierId ? TIER_INCLUDES_EVENTS.has(currentTierId) : false;
  const hasSocial = currentTierId ? TIER_INCLUDES_SOCIAL.has(currentTierId) : false;
  const hasSite = !!(siteData?.site?.generatedHtml);
  const socialConnected = Array.isArray(socialAccounts) && socialAccounts.length > 0;
  const stripeConnected = !!(paymentData?.organization?.stripeConnectAccountId ?? (org as unknown as { stripeConnectAccountId?: string | null })?.stripeConnectAccountId);

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const upcomingEvents: EventItem[] = events?.filter((e: EventItem) =>
    e.startDate && e.startDate >= today && e.startDate <= thirtyDaysOut
  ).slice(0, 5) ?? [];

  // Build decisions list
  const decisionItems: DecisionItem[] = [];
  if (decisions?.pendingRegistrations) {
    for (const reg of decisions.pendingRegistrations) {
      decisionItems.push({
        id: `reg-${reg.id}`,
        label: `Approve ${reg.type}: ${reg.name}`,
        detail: `Registration pending approval · received ${formatTimeAgo(reg.createdAt)}`,
        href: "/dashboard/events",
        icon: UserCheck,
        badge: "Approval needed",
      });
    }
  }
  if (decisions?.draftSocialPosts) {
    for (const post of decisions.draftSocialPosts) {
      decisionItems.push({
        id: `post-${post.id}`,
        label: `Review ${post.platform} draft`,
        detail: post.content ? `"${post.content.slice(0, 60)}${post.content.length > 60 ? "…" : ""}"` : "Draft ready for review",
        href: "/dashboard/social",
        icon: Send,
        badge: "Draft",
      });
    }
  }
  if (decisions?.unreadNotifications) {
    for (const notif of decisions.unreadNotifications) {
      if (decisionItems.length >= 6) break;
      decisionItems.push({
        id: `notif-${notif.id}`,
        label: notif.title,
        detail: notif.body,
        href: "/dashboard/settings",
        icon: Bell,
      });
    }
  }

  // Setup items (not decisions, just gaps to fill)
  const setupItems: Array<{ id: string; label: string; detail: string; href: string; icon: React.ElementType }> = [];
  if (!hasPlan) setupItems.push({ id: "no-plan", label: "No active plan", detail: "Subscribe to unlock all features.", href: "/billing", icon: CreditCard });
  if (hasPlan && hasEvents && !stripeConnected) setupItems.push({ id: "no-stripe", label: "Payments not connected", detail: "Connect Stripe to accept event payments.", href: "/dashboard/payments", icon: DollarSign });
  if (hasPlan && !hasSite) setupItems.push({ id: "no-site", label: "Website not built yet", detail: "Generate your site with AI in minutes.", href: "/dashboard/site", icon: Globe });
  if (hasPlan && hasSocial && !socialConnected) setupItems.push({ id: "no-social", label: "Social accounts not linked", detail: "Connect Facebook, Instagram, or X.", href: "/dashboard/social", icon: Share2 });

  // Activity bullets (only show non-zero)
  const activityBullets: Array<{ label: string; value: number }> = [
    { label: "social posts published", value: activity?.socialPostsPublished ?? 0 },
    { label: "content drafts prepared", value: activity?.contentDraftsGenerated ?? 0 },
    { label: "applications received", value: activity?.registrationsReceived ?? 0 },
    { label: "alerts monitored", value: activity?.notificationsSent ?? 0 },
  ].filter(b => b.value > 0);

  const totalActivityItems = activityBullets.reduce((s, b) => s + b.value, 0);

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
            <p className="text-slate-400 text-sm mt-0.5">
              {org?.type ? <span className="capitalize">{org.type}</span> : "Your organization"}
              {currentTierId && <span className="text-slate-600"> · </span>}
              {currentTierId && <span>{TIER_LABELS[currentTierId] ?? currentTierId} Plan</span>}
            </p>
          </div>
          {hasPlan && (
            <Button size="sm" variant="ghost" className="text-xs text-slate-400 hover:text-white self-start sm:self-auto" onClick={handleBillingPortal} disabled={portalPending}>
              <Settings className="w-3.5 h-3.5 mr-1.5" />Manage Billing
            </Button>
          )}
        </div>
      </motion.div>

      {/* ── AI ACTIVITY HERO ─────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-sm font-semibold text-white">
                  {hasPlan
                    ? totalActivityItems > 0
                      ? `Pillar handled ${totalActivityItems} item${totalActivityItems !== 1 ? "s" : ""} this week`
                      : "Pillar is monitoring your organization"
                    : "Pillar is ready to go to work"}
                </h2>
                {hasPlan && (
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>
              {hasPlan ? (
                activityBullets.length > 0 ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {activityBullets.map(b => (
                      <span key={b.label} className="text-xs text-slate-400">
                        <span className="text-white font-medium">{b.value}</span> {b.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">
                    No automated activity yet this week. Create events, connect social, or generate content to get started.
                  </p>
                )
              ) : (
                <p className="text-xs text-slate-400 mt-1">
                  Activate a plan and Pillar will handle reminders, social posts, approvals, and follow-ups automatically.
                </p>
              )}
            </div>
            {!hasPlan && (
              <Button size="sm" className="flex-shrink-0" onClick={() => handleUpgrade("tier1a")}>
                Activate Pillar
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── DECISIONS NEEDED ─────────────────────────────── */}
      {(decisionItems.length > 0 || setupItems.length > 0) && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Needs Your Decision</h2>
            {decisionItems.length + setupItems.length > 0 && (
              <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-xs">
                {decisionItems.length + setupItems.length}
              </Badge>
            )}
          </div>
          <div className="space-y-2">
            {decisionItems.map(item => (
              <Link href={item.href} key={item.id}>
                <div className="flex items-center gap-3 p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] hover:border-amber-500/35 hover:bg-amber-500/[0.07] cursor-pointer transition-all group">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.label}</p>
                    <p className="text-xs text-slate-400 truncate">{item.detail}</p>
                  </div>
                  {item.badge && (
                    <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-xs flex-shrink-0 hidden sm:flex">
                      {item.badge}
                    </Badge>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors flex-shrink-0" />
                </div>
              </Link>
            ))}
            {setupItems.map(item => (
              <Link href={item.href} key={item.id}>
                <div className="flex items-center gap-3 p-3.5 rounded-xl border border-red-500/20 bg-red-500/[0.04] hover:border-red-500/35 hover:bg-red-500/[0.07] cursor-pointer transition-all group">
                  <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-4 h-4 text-red-400" />
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
        </motion.div>
      )}

      {/* All-clear state when no decisions or setup needed */}
      {hasPlan && decisionItems.length === 0 && setupItems.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-white">Nothing needs your attention right now</p>
              <p className="text-xs text-slate-400 mt-0.5">Pillar is handling operations. Check back later.</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── UPCOMING TIMELINE + STATS ────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Upcoming 30-day timeline */}
          <div className="lg:col-span-3">
            <Card className="border-white/10 bg-card/40 h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    Next 30 Days
                  </CardTitle>
                  <Link href="/dashboard/events">
                    <span className="text-xs text-slate-500 hover:text-primary cursor-pointer transition-colors">View all</span>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {upcomingEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Calendar className="w-8 h-8 text-slate-700 mb-2" />
                    <p className="text-sm text-slate-500">No events in the next 30 days</p>
                    {hasPlan && hasEvents && (
                      <Link href="/dashboard/events">
                        <span className="text-xs text-primary cursor-pointer hover:text-primary/80 mt-2 inline-flex items-center gap-1">
                          <Plus className="w-3 h-3" />Create an event
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

          {/* Stats column */}
          <div className="lg:col-span-2 space-y-3">
            {[
              { label: "Members & Contacts", value: stats?.totalContacts ?? 0, icon: Users, href: "/dashboard/contacts" },
              { label: "Active Events", value: stats?.activeEvents ?? 0, icon: Calendar, href: "/dashboard/events" },
              { label: "Active Sponsors", value: stats?.totalSponsors ?? 0, icon: Star, href: "/dashboard/sponsors" },
              { label: "Revenue Collected", value: stats?.totalRevenue ? `$${(stats.totalRevenue / 100).toLocaleString()}` : "$0", icon: DollarSign, href: "/dashboard/payments" },
            ].map(stat => (
              <Link href={stat.href} key={stat.label}>
                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5 hover:border-white/20 hover:bg-white/5 cursor-pointer transition-all flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <stat.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400">{stat.label}</p>
                    <p className="text-lg font-bold text-white">{stat.value}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── QUICK ACTIONS ────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
        <div className="mb-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">What would you like to do?</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "New Event", desc: "Create and publish an event", href: "/dashboard/events", icon: Calendar, locked: !hasEvents },
            { label: "Post to Social", desc: "Schedule a social update", href: "/dashboard/social", icon: Share2, locked: !hasSocial },
            { label: "Generate Content", desc: "AI-powered content studio", href: "/dashboard/studio", icon: Sparkles, locked: !hasPlan },
            { label: "Update Website", desc: "Edit your live site", href: "/dashboard/site", icon: Globe, locked: !hasPlan },
          ].map(action => (
            <Link href={action.locked ? "/billing" : action.href} key={action.label}>
              <div className={cn(
                "rounded-xl border p-4 cursor-pointer transition-all group",
                action.locked
                  ? "border-white/5 bg-white/[0.01] opacity-50 hover:opacity-70"
                  : "border-white/8 bg-white/[0.02] hover:border-primary/30 hover:bg-primary/5"
              )}>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 transition-colors",
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
