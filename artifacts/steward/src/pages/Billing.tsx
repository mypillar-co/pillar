import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useGetOrganization,
  useGetSubscription,
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
  AlertTriangle,
  X,
} from "lucide-react";
import { toast } from "sonner";

const TIER_ICONS: Record<string, React.ElementType> = {
  tier1: Globe,
  tier1a: Share2,
  tier2: Calendar,
  tier3: Shield,
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * CancelConfirmDialog — shown before opening the Stripe portal for cancellation.
 */
function CancelConfirmDialog({
  onConfirm,
  onClose,
  loading,
}: {
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold text-white">Cancel subscription?</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          You'll be taken to the secure Stripe billing portal to confirm
          cancellation. Your access continues until the end of your current
          billing period.
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 border-white/20 text-white hover:bg-white/5"
            onClick={onClose}
            disabled={loading}
          >
            Keep plan
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              "Continue to portal"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Billing() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [changingTier, setChangingTier] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const { data: orgData, isLoading: orgLoading } = useGetOrganization();
  const { data: subData, isLoading: subLoading } = useGetSubscription();
  const { data: tiersData, isLoading: tiersLoading } = useListTiers();
  const { mutate: createCheckout, isPending: checkoutPending } =
    useCreateCheckoutSession();
  const { mutate: createPortal, isPending: portalPending } =
    useCreatePortalSession();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  if (authLoading) return null;
  if (!isAuthenticated) return null;

  const org = orgData?.organization;
  const sub = subData;
  const currentTierId = sub?.tierId ?? org?.tier ?? null;
  const tiers = tiersData?.tiers ?? [];
  const currentTier = tiers.find((t) => t.id === currentTierId);
  const hasActiveSubscription = sub?.hasSubscription && sub?.status === "active";
  const nextBillingDate = formatDate(sub?.currentPeriodEnd);

  const openPortal = (onError?: () => void) => {
    createPortal(undefined, {
      onSuccess: (data) => {
        window.location.href = data.url;
      },
      onError: () => {
        toast.error("Failed to open billing portal. Please try again.");
        onError?.();
      },
    });
  };

  /**
   * For existing subscribers: route plan changes through the Stripe Customer
   * Portal (which handles proration + subscription updates correctly).
   * For new users: start a Stripe Checkout session.
   */
  const handleChangePlan = (tierId: string) => {
    if (hasActiveSubscription) {
      // Existing subscriber — use the portal to upgrade/downgrade
      setChangingTier(tierId);
      openPortal(() => setChangingTier(null));
    } else {
      // No active subscription — start a new Checkout session
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
            toast.error("Failed to start checkout. Please try again.");
            setChangingTier(null);
          },
        },
      );
    }
  };

  const handleCancelConfirm = () => {
    openPortal(() => setShowCancelDialog(false));
  };

  const isLoading = orgLoading || subLoading || tiersLoading;

  return (
    <>
      {showCancelDialog && (
        <CancelConfirmDialog
          onConfirm={handleCancelConfirm}
          onClose={() => setShowCancelDialog(false)}
          loading={portalPending}
        />
      )}

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
                  {currentTier && hasActiveSubscription ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
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
                      <div className="pt-3 border-t border-white/10 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Next billing date
                        </span>
                        <span className="text-white font-medium">
                          {nextBillingDate}
                        </span>
                      </div>
                      <div className="pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 -ml-2"
                          onClick={() => setShowCancelDialog(true)}
                          disabled={portalPending}
                        >
                          <X className="w-3.5 h-3.5 mr-1.5" />
                          Cancel subscription
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground shrink-0" />
                      <span>No active subscription — choose a plan below to get started.</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Plan Options */}
              <Card className="border-white/10 bg-card/60 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {hasActiveSubscription ? "Change Plan" : "Choose a Plan"}
                  </CardTitle>
                  <CardDescription>
                    {hasActiveSubscription
                      ? "Upgrade or downgrade via the secure Stripe portal — changes take effect immediately with prorated billing."
                      : "Select a plan to unlock the full Steward experience."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {tiers.map((tier) => {
                      const Icon = TIER_ICONS[tier.id] ?? Globe;
                      const isCurrent = tier.id === currentTierId && hasActiveSubscription;
                      const isChanging = changingTier === tier.id;
                      const isUpgrade =
                        currentTier && tier.price > currentTier.price;
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
                                  (checkoutPending || portalPending) && changingTier !== null
                                }
                                onClick={() => handleChangePlan(tier.id)}
                              >
                                {isChanging ? (
                                  <div className="animate-spin rounded-full h-3 w-3 border-b border-current" />
                                ) : hasActiveSubscription ? (
                                  <>
                                    {isUpgrade ? "Upgrade" : "Downgrade"}
                                    <ChevronRight className="w-3 h-3 ml-1" />
                                  </>
                                ) : (
                                  <>
                                    Select
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
                  <p className="text-xs text-muted-foreground mt-4 text-center leading-relaxed">
                    {hasActiveSubscription
                      ? "Plan changes are processed via the Stripe billing portal with prorated billing."
                      : "Subscriptions renew automatically each month until cancelled. Cancel anytime — access continues until the end of your billing period."}
                  </p>
                </CardContent>
              </Card>

              {/* Billing History */}
              <Card className="border-white/10 bg-card/60 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-lg">Billing History & Invoices</CardTitle>
                  <CardDescription>
                    View past invoices, update payment methods, and manage
                    payment settings via the secure Stripe billing portal.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/5"
                    onClick={() => openPortal()}
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
                    Secure billing powered by Stripe. Cancel anytime.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
