import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetOrganization,
  useListTiers,
  useCreateCheckoutSession,
  useCreatePortalSession,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  Share2,
  Calendar,
  Shield,
  CreditCard,
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  ChevronRight,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

const TIER_ICONS: Record<string, React.ElementType> = {
  tier1: Globe,
  tier1a: Share2,
  tier2: Calendar,
  tier3: Shield,
};

export default function Billing() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [changingTier, setChangingTier] = useState<string | null>(null);

  const { data: orgData, isLoading: orgLoading } = useGetOrganization();
  const { data: tiersData, isLoading: tiersLoading } = useListTiers();
  const { mutate: createCheckout, isPending: checkoutPending } =
    useCreateCheckoutSession();
  const { mutate: createPortal, isPending: portalPending } =
    useCreatePortalSession();

  if (!isAuthenticated) {
    setLocation("/");
    return null;
  }

  const org = orgData?.organization;
  const currentTierId = org?.tier ?? null;
  const tiers = tiersData?.tiers ?? [];
  const currentTier = tiers.find((t) => t.id === currentTierId);

  const handleChangePlan = (tierId: string) => {
    setChangingTier(tierId);
    createCheckout(
      { data: { tierId } },
      {
        onSuccess: (data) => {
          if (data.url) {
            window.location.href = data.url;
          }
        },
        onError: () => {
          toast.error("Failed to start plan change. Please try again.");
          setChangingTier(null);
        },
      },
    );
  };

  const handleOpenPortal = () => {
    createPortal(
      undefined,
      {
        onSuccess: (data) => {
          if (data.url) {
            window.location.href = data.url;
          }
        },
        onError: () => {
          toast.error("Failed to open billing portal. Please try again.");
        },
      },
    );
  };

  const isLoading = orgLoading || tiersLoading;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-white"
            onClick={() => setLocation("/dashboard")}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Dashboard
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-primary" />
            Billing & Plan
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your subscription, upgrade or downgrade, and access billing
            history.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Plan */}
            <Card className="border-white/10 bg-card/60 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  Current Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                {currentTier ? (
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-white">
                          {currentTier.name}
                        </span>
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                          Active
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-sm mt-1">
                        {currentTier.description}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-white">
                        ${currentTier.price}
                        <span className="text-sm font-normal text-muted-foreground">
                          /mo
                        </span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                    <span>No active subscription</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Plan Options */}
            <Card className="border-white/10 bg-card/60 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg">
                  {currentTierId ? "Change Plan" : "Choose a Plan"}
                </CardTitle>
                <CardDescription>
                  {currentTierId
                    ? "Upgrade or downgrade at any time — changes take effect immediately."
                    : "Select a plan to unlock the full Steward experience."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tiers.map((tier) => {
                    const Icon = TIER_ICONS[tier.id] ?? Globe;
                    const isCurrent = tier.id === currentTierId;
                    const isChanging = changingTier === tier.id;
                    return (
                      <div
                        key={tier.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                          isCurrent
                            ? "border-primary bg-primary/5"
                            : tier.highlight
                              ? "border-white/20 hover:border-primary/50 hover:bg-primary/5"
                              : "border-white/10 hover:border-white/20 hover:bg-white/5"
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            isCurrent ? "bg-primary/20" : "bg-secondary/60"
                          }`}
                        >
                          <Icon
                            className={`w-5 h-5 ${isCurrent ? "text-primary" : "text-muted-foreground"}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-white text-sm">
                              {tier.name}
                            </p>
                            {isCurrent && (
                              <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                                Current
                              </Badge>
                            )}
                            {tier.highlight && !isCurrent && (
                              <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">
                                Most Popular
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {tier.description}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-3">
                          <p className="font-bold text-white text-sm">
                            ${tier.price}
                            <span className="text-muted-foreground font-normal text-xs">
                              /mo
                            </span>
                          </p>
                          {isCurrent ? (
                            <CheckCircle2 className="w-5 h-5 text-primary" />
                          ) : (
                            <Button
                              size="sm"
                              variant={tier.highlight ? "default" : "outline"}
                              className="h-8 px-3 text-xs"
                              disabled={
                                checkoutPending || changingTier !== null
                              }
                              onClick={() => handleChangePlan(tier.id)}
                            >
                              {isChanging ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b border-current" />
                              ) : (
                                <>
                                  {currentTierId
                                    ? tier.price >
                                      (currentTier?.price ?? 0)
                                      ? "Upgrade"
                                      : "Downgrade"
                                    : "Select"}
                                  <ChevronRight className="w-3 h-3 ml-1" />
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Billing Actions */}
            <Card className="border-white/10 bg-card/60 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg">Billing History & Management</CardTitle>
                <CardDescription>
                  View past invoices, update payment methods, or cancel your
                  subscription via the secure Stripe billing portal.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/5"
                  onClick={handleOpenPortal}
                  disabled={portalPending}
                >
                  {portalPending ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  ) : (
                    <ExternalLink className="w-4 h-4 mr-2" />
                  )}
                  Open Billing Portal
                </Button>
                <p className="text-xs text-muted-foreground self-center">
                  Secure billing powered by Stripe. Cancel anytime — no hidden
                  fees.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
