import React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Users, Star, ArrowRight, Plus, Globe, Contact2, Share2, Lock, Sparkles } from "lucide-react";
import { useGetOrganization, useGetSubscription, useCreateCheckoutSession } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, type EventItem } from "@/lib/api";
import { toast } from "sonner";

const TIER_INCLUDES_EVENTS = new Set(["tier2", "tier3"]);
const TIER_INCLUDES_SOCIAL = new Set(["tier1a", "tier2", "tier3"]);

function FeatureCard({
  icon: Icon, title, description, href, available, requiredTier, onUpgrade,
}: {
  icon: React.ElementType; title: string; description: string; href?: string;
  available: boolean; requiredTier?: string; onUpgrade?: () => void;
}) {
  const content = (
    <Card className={`flex flex-col border h-full ${available ? "border-white/10 bg-card/60" : "border-white/5 bg-card/30 opacity-80"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${available ? "bg-primary/15" : "bg-white/5"}`}>
            <Icon className={`w-5 h-5 ${available ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          {available
            ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-xs">Active</Badge>
            : <Lock className="w-4 h-4 text-muted-foreground/40 mt-1" />}
        </div>
        <CardTitle className={`text-base mt-3 ${available ? "text-white" : "text-muted-foreground"}`}>{title}</CardTitle>
        <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1" />
      <CardFooter>
        {available ? (
          <Button variant="secondary" className="w-full border border-white/5 bg-secondary/50 hover:bg-secondary text-sm">
            Open <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button variant="outline" className="w-full border-white/10 text-muted-foreground hover:text-white hover:bg-white/5 text-sm" onClick={onUpgrade}>
            Upgrade to {requiredTier} <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
  return available && href ? <Link href={href} className="h-full">{content}</Link> : <div className="h-full">{content}</div>;
}

function StatCard({ title, value, icon: Icon, sub }: { title: string; value: number | string; icon: React.ElementType; sub?: string }) {
  return (
    <Card className="border-white/10 bg-card/60">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">{title}</p>
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
        <p className="text-2xl font-bold text-white">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function Overview() {
  const { data: orgData } = useGetOrganization();
  const org = orgData?.organization;
  const { data: subscription } = useGetSubscription();
  const { mutate: createCheckout } = useCreateCheckoutSession();
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => api.stats.get() });
  const { data: events } = useQuery({ queryKey: ["events"], queryFn: () => api.events.list() });

  const upcomingEvents = events
    ?.filter((e: EventItem) => e.startDate && e.startDate >= new Date().toISOString().split("T")[0])
    .slice(0, 5) ?? [];

  const currentTierId = subscription?.tierId ?? org?.tier ?? null;
  const hasPlan = !!currentTierId;
  const hasEvents = currentTierId ? TIER_INCLUDES_EVENTS.has(currentTierId) : false;
  const hasSocial = currentTierId ? TIER_INCLUDES_SOCIAL.has(currentTierId) : false;

  const handleUpgrade = (tierId: string) => {
    createCheckout({ data: { tierId } }, {
      onSuccess: (data) => { if (data.url) window.location.href = data.url; },
      onError: () => toast.error("Failed to start checkout. Please try again."),
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Welcome back{org ? `, ${org.name}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Here's what's happening with your organization.</p>
        </div>
        {subscription?.tierId && (
          <Badge variant="outline" className="border-primary/30 text-primary capitalize text-xs">
            {subscription.tierId.replace(/_/g, " ")} Plan
          </Badge>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Events" value={stats?.activeEvents ?? 0} icon={Calendar} sub="Published events" />
        <StatCard title="Vendors" value={stats?.totalVendors ?? 0} icon={Users} sub="Active vendors" />
        <StatCard title="Sponsors" value={stats?.totalSponsors ?? 0} icon={Star} sub="Active sponsors" />
        <StatCard title="Contacts" value={stats?.totalContacts ?? 0} icon={Contact2} sub="In your database" />
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Upcoming Events */}
        <div className="lg:col-span-2">
          <Card className="border-white/10 bg-card/60 h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-white">Upcoming Events</CardTitle>
                <Link href="/dashboard/events">
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-white h-7">
                    View all <ArrowRight className="ml-1 w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {upcomingEvents.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No upcoming events yet</p>
                  <Link href="/dashboard/events">
                    <Button size="sm" className="mt-3">
                      <Plus className="w-4 h-4 mr-1.5" /> Create event
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingEvents.map((event: EventItem) => (
                    <Link key={event.id} href={`/dashboard/events/${event.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Calendar className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{event.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {event.startDate ? new Date(event.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Date TBD"}
                              {event.location ? ` · ${event.location}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge
                            variant="outline"
                            className={`text-xs capitalize ${event.status === "published" ? "border-emerald-500/30 text-emerald-400" : "border-white/20 text-muted-foreground"}`}
                          >
                            {event.status}
                          </Badge>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <Card className="border-white/10 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-white">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/dashboard/events">
                <Button variant="outline" className="w-full justify-start border-white/10 hover:bg-white/5 text-slate-300 hover:text-white h-9">
                  <Calendar className="w-4 h-4 mr-2 text-primary" /> New Event
                </Button>
              </Link>
              <Link href="/dashboard/vendors">
                <Button variant="outline" className="w-full justify-start border-white/10 hover:bg-white/5 text-slate-300 hover:text-white h-9">
                  <Users className="w-4 h-4 mr-2 text-primary" /> Add Vendor
                </Button>
              </Link>
              <Link href="/dashboard/sponsors">
                <Button variant="outline" className="w-full justify-start border-white/10 hover:bg-white/5 text-slate-300 hover:text-white h-9">
                  <Star className="w-4 h-4 mr-2 text-primary" /> Add Sponsor
                </Button>
              </Link>
              <Link href="/dashboard/site">
                <Button variant="outline" className="w-full justify-start border-white/10 hover:bg-white/5 text-slate-300 hover:text-white h-9">
                  <Globe className="w-4 h-4 mr-2 text-primary" /> Build Your Site
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Feature Sections — org name + tier + Website/Events/Automation placeholder cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Your Digital Operations</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasPlan
                ? `Everything Steward is managing for ${org?.name ?? "your organization"}.`
                : "Choose a plan to activate these features."}
            </p>
          </div>
          {hasPlan && subscription?.tierId && (
            <Badge variant="outline" className="border-primary/30 text-primary capitalize text-xs">
              {subscription.tierId.replace(/_/g, " ")} Plan
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard
            icon={Globe}
            title="Website"
            description="Your AI-generated website is live. Chat with Steward to request updates, add pages, or change content."
            href="/dashboard/site"
            available={hasPlan}
            requiredTier="Tier 1"
            onUpgrade={() => handleUpgrade("tier1")}
          />
          <FeatureCard
            icon={Calendar}
            title="Event Dashboard"
            description="Create and manage events, track ticket sales, handle approvals, and send communications to attendees."
            href="/dashboard/events"
            available={hasEvents}
            requiredTier="Tier 2"
            onUpgrade={() => handleUpgrade("tier2")}
          />
          <FeatureCard
            icon={Share2}
            title="Automation"
            description="Automatically post updates to social media and keep your site current based on your organization's schedule."
            available={hasSocial}
            requiredTier="Tier 1a"
            onUpgrade={() => handleUpgrade("tier1a")}
          />
        </div>
        {!hasPlan && (
          <div className="mt-4 p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-primary flex-shrink-0" />
              <p className="text-sm text-slate-300">
                Activate Steward to put <span className="text-white font-medium">{org?.name ?? "your organization"}</span> on autopilot.
              </p>
            </div>
            <Link href="/billing">
              <Button size="sm" className="flex-shrink-0 ml-4">View Plans</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
