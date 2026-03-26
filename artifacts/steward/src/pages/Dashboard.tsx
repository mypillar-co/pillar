import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Building2,
  CreditCard,
  Settings,
  Activity,
  CheckCircle2,
  Calendar,
  Globe,
  Share2,
  Lock,
  ArrowRight,
  Zap,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// Which tiers include which features
const TIER_INCLUDES_EVENTS = new Set(["tier2", "tier3"]);
const TIER_INCLUDES_SOCIAL = new Set(["tier1a", "tier3"]);

function FeatureCard({
  icon: Icon,
  title,
  description,
  available,
  requiredTier,
  onUpgrade,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  available: boolean;
  requiredTier?: string;
  onUpgrade?: () => void;
}) {
  return (
    <Card
      className={`flex flex-col border ${
        available ? "border-white/10 bg-card/60" : "border-white/5 bg-card/30"
      }`}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              available ? "bg-primary/15" : "bg-secondary/40"
            }`}
          >
            <Icon
              className={`w-5 h-5 ${available ? "text-primary" : "text-muted-foreground"}`}
            />
          </div>
          {available ? (
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
              Active
            </Badge>
          ) : (
            <Lock className="w-4 h-4 text-muted-foreground/50 mt-1" />
          )}
        </div>
        <CardTitle
          className={`text-lg mt-3 ${available ? "text-white" : "text-muted-foreground"}`}
        >
          {title}
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1" />
      <CardFooter>
        {available ? (
          <Button
            variant="secondary"
            className="w-full border border-white/5 bg-secondary/50 hover:bg-secondary"
          >
            Open
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full border-white/10 text-muted-foreground hover:text-white hover:bg-white/5"
            onClick={onUpgrade}
          >
            Upgrade to {requiredTier}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const { data: orgData, isLoading: orgLoading } = useGetOrganization();

  const { data: subData, isLoading: subLoading, refetch: refetchSub } =
    useGetSubscription();

  const { data: tiersData } = useListTiers();

  const { mutate: createCheckout, isPending: checkoutPending } =
    useCreateCheckoutSession();
  const { mutate: createPortal, isPending: portalPending } =
    useCreatePortalSession();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    } else if (!orgLoading && !authLoading && !orgData?.organization) {
      setLocation("/onboard");
    }
  }, [isAuthenticated, authLoading, orgData, orgLoading, setLocation]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const billingStatus = searchParams.get("billing");
    if (billingStatus === "success") {
      toast.success("Subscription updated successfully!");
      void refetchSub();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (billingStatus === "cancelled") {
      toast.info("Checkout cancelled.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [refetchSub]);

  const handleSubscribe = (tierId: string) => {
    createCheckout(
      { data: { tierId } },
      {
        onSuccess: (data) => {
          if (data.url) window.location.href = data.url;
        },
        onError: (err) => {
          const message =
            err instanceof Error ? err.message : "Please try again.";
          toast.error("Failed to start checkout. " + message);
        },
      },
    );
  };

  const handleManageBilling = () => {
    createPortal(undefined, {
      onSuccess: (data) => {
        if (data.url) window.location.href = data.url;
      },
      onError: () => {
        toast.error("Failed to open billing portal.");
      },
    });
  };

  if (authLoading || orgLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  const org = orgData?.organization;
  if (!org) return null;

  const isSubscribed = subData?.hasSubscription === true;
  const currentTierId = subData?.tierId ?? null;

  const hasEvents = isSubscribed && currentTierId
    ? TIER_INCLUDES_EVENTS.has(currentTierId)
    : false;
  const hasSocial = isSubscribed && currentTierId
    ? TIER_INCLUDES_SOCIAL.has(currentTierId)
    : false;

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-background pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-4"
        >
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
              {user?.firstName ? `Welcome, ${user.firstName}` : "Dashboard"}
            </h1>
            <p className="text-muted-foreground text-lg flex items-center gap-2 flex-wrap">
              <Building2 className="w-5 h-5" />
              {org.name}
              <Badge
                variant="outline"
                className="ml-1 bg-secondary/50 text-xs"
              >
                {org.type}
              </Badge>
            </p>
          </div>

          {isSubscribed && (
            <div className="flex items-center gap-3">
              <Badge className="px-4 py-1.5 text-sm flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Autopilot Active
              </Badge>
              <Button
                variant="outline"
                onClick={handleManageBilling}
                disabled={portalPending}
                className="border-white/10 hover:bg-white/5"
              >
                <Settings className="w-4 h-4 mr-2" />
                Manage Billing
              </Button>
            </div>
          )}
        </motion.div>

        {/* Subscription status strip */}
        {isSubscribed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-5 pb-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                        Current Plan
                      </p>
                      <p className="font-semibold text-white">
                        {subData.tierName ?? currentTierId}
                      </p>
                    </div>
                  </div>
                  <div className="h-6 w-px bg-white/10 hidden sm:block" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                      Status
                    </p>
                    <p className="font-semibold text-white capitalize">
                      {subData.status}
                    </p>
                  </div>
                  {subData.currentPeriodEnd && (
                    <>
                      <div className="h-6 w-px bg-white/10 hidden sm:block" />
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                          Renews
                        </p>
                        <p className="font-semibold text-white">
                          {formatDate(subData.currentPeriodEnd)}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Feature Sections */}
        {isSubscribed ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">
                Your Digital Operations
              </h2>
              <p className="text-muted-foreground mt-1">
                Everything Steward is managing on your behalf.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FeatureCard
                icon={Globe}
                title="Website"
                description="Your AI-generated website is live. Chat with Steward to request updates, add pages, or change content."
                available={true}
              />
              <FeatureCard
                icon={Calendar}
                title="Event Dashboard"
                description="Create and manage events, track ticket sales, handle approval workflows, and send communications to attendees."
                available={hasEvents}
                requiredTier="Tier 2"
                onUpgrade={() => handleSubscribe("tier2")}
              />
              <FeatureCard
                icon={Share2}
                title="Social Media"
                description="Automatically post updates to Facebook, Instagram, and X based on your organization's schedule."
                available={hasSocial}
                requiredTier="Tier 1a"
                onUpgrade={() => handleSubscribe("tier1a")}
              />
            </div>
          </motion.div>
        ) : (
          /* No subscription — show pricing cards */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">
                Activate Steward
              </h2>
              <p className="text-muted-foreground mt-1">
                Choose a plan to put{" "}
                <span className="text-white font-medium">{org.name}</span> on
                autopilot.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {tiersData?.tiers.map((tier) => (
                <Card
                  key={tier.id}
                  className={`relative flex flex-col ${
                    tier.highlight
                      ? "border-primary shadow-xl shadow-primary/10"
                      : "border-white/10"
                  }`}
                >
                  {tier.highlight && (
                    <div className="absolute -top-3 inset-x-0 flex justify-center">
                      <Badge className="bg-primary text-primary-foreground px-3">
                        Most Popular
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base leading-tight">
                      {tier.name.split("—")[0].trim()}
                    </CardTitle>
                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-3xl font-bold text-white">
                        ${tier.price}
                      </span>
                      <span className="text-muted-foreground text-sm">/mo</span>
                    </div>
                    <CardDescription className="text-xs leading-relaxed">
                      {tier.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 pb-3">
                    <ul className="space-y-2">
                      {tier.features.map((f, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-xs text-muted-foreground"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full"
                      variant={tier.highlight ? "default" : "secondary"}
                      onClick={() => handleSubscribe(tier.id)}
                      disabled={checkoutPending}
                    >
                      {checkoutPending ? (
                        "Processing..."
                      ) : (
                        <>
                          <Zap className="w-4 h-4 mr-2" />
                          Subscribe
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>

            <div className="mt-8 text-center">
              <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
                <CreditCard className="w-4 h-4" />
                <span>
                  Billed monthly. Cancel anytime. No setup fees.
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
