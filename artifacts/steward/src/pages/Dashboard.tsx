import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { 
  Building2, 
  CreditCard, 
  Settings, 
  ExternalLink, 
  Activity,
  CheckCircle2,
  Calendar,
  Globe
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { 
  useGetOrganization, 
  useGetSubscription, 
  useListTiers, 
  useCreateCheckoutSession, 
  useCreatePortalSession 
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function Dashboard() {
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  
  const { data: orgData, isLoading: orgLoading } = useGetOrganization({
    query: { enabled: isAuthenticated }
  });
  
  const { data: subData, isLoading: subLoading, refetch: refetchSub } = useGetSubscription({
    query: { enabled: !!orgData?.organization }
  });
  
  const { data: tiersData } = useListTiers({
    query: { enabled: !subData?.hasSubscription }
  });

  const { mutate: createCheckout, isPending: checkoutPending } = useCreateCheckoutSession();
  const { mutate: createPortal, isPending: portalPending } = useCreatePortalSession();

  // Route protection
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    } else if (!orgLoading && !authLoading && !orgData?.organization) {
      setLocation("/onboard");
    }
  }, [isAuthenticated, authLoading, orgData, orgLoading, setLocation]);

  // Handle Stripe callbacks
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const billingStatus = searchParams.get('billing');
    
    if (billingStatus === 'success') {
      toast.success("Subscription updated successfully!");
      refetchSub();
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (billingStatus === 'cancelled') {
      toast.info("Checkout cancelled.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [refetchSub]);

  const handleSubscribe = (tierId: string) => {
    createCheckout({ data: { tierId } }, {
      onSuccess: (data) => {
        window.location.href = data.url;
      },
      onError: (err) => {
        toast.error("Failed to start checkout. " + (err as any)?.message);
      }
    });
  };

  const handleManageBilling = () => {
    createPortal(undefined, {
      onSuccess: (data) => {
        window.location.href = data.url;
      },
      onError: () => {
        toast.error("Failed to open billing portal.");
      }
    });
  };

  if (authLoading || orgLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const org = orgData?.organization;
  const isSubscribed = subData?.hasSubscription;

  if (!org) return null; // Will redirect

  return (
    <div className="min-h-screen bg-background pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
              Welcome back, {user?.firstName || 'Steward'}
            </h1>
            <p className="text-muted-foreground text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {org.name}
              <Badge variant="outline" className="ml-2 bg-secondary/50">{org.type}</Badge>
            </p>
          </div>
          
          {isSubscribed && (
            <div className="flex items-center gap-3">
              <Badge variant="success" className="px-4 py-1.5 text-sm flex items-center gap-1.5 shadow-emerald-500/20 shadow-lg">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                System Active
              </Badge>
              <Button variant="outline" onClick={handleManageBilling} disabled={portalPending} className="border-white/10 hover:bg-white/5">
                <Settings className="w-4 h-4 mr-2" />
                Manage Billing
              </Button>
            </div>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column - Org Status & Sub */}
          <div className="lg:col-span-1 space-y-8">
            <Card className="border-white/10 bg-card/60">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  Subscription Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isSubscribed ? (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Current Plan</p>
                      <p className="text-lg font-semibold text-white">{subData.tierName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Status</p>
                      <p className="text-white capitalize">{subData.status}</p>
                    </div>
                    {subData.currentPeriodEnd && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Renews On</p>
                        <p className="text-white">{new Date(parseInt(subData.currentPeriodEnd) * 1000).toLocaleDateString()}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                      <CreditCard className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-white font-medium mb-1">No Active Subscription</p>
                    <p className="text-sm text-muted-foreground">Select a plan to activate your digital operations.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {isSubscribed && (
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-lg text-primary">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="secondary" className="w-full justify-start text-left bg-secondary/50 hover:bg-secondary border border-white/5">
                    <Globe className="w-4 h-4 mr-3 text-muted-foreground" />
                    Update Website Content
                  </Button>
                  <Button variant="secondary" className="w-full justify-start text-left bg-secondary/50 hover:bg-secondary border border-white/5">
                    <Calendar className="w-4 h-4 mr-3 text-muted-foreground" />
                    Create New Event
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Action / Empty States */}
          <div className="lg:col-span-2">
            {!isSubscribed ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-2">Activate Steward</h3>
                  <p className="text-muted-foreground">Choose a plan to put your organization on autopilot.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {tiersData?.tiers.map((tier) => (
                    <Card key={tier.id} className={`relative flex flex-col ${tier.highlight ? 'border-primary shadow-xl shadow-primary/10' : 'border-white/10'}`}>
                      {tier.highlight && (
                        <Badge className="absolute -top-3 right-6 bg-primary text-primary-foreground">
                          Recommended
                        </Badge>
                      )}
                      <CardHeader>
                        <CardTitle>{tier.name.split('—')[0].trim()}</CardTitle>
                        <div className="flex items-baseline gap-1 mt-2">
                          <span className="text-3xl font-bold text-white">${tier.price}</span>
                          <span className="text-muted-foreground">/mo</span>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1">
                        <ul className="space-y-3">
                          {tier.features.slice(0, 4).map((f, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
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
                          {checkoutPending ? "Processing..." : "Subscribe"}
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <Card className="h-full min-h-[400px] border-white/5 border-dashed bg-gradient-to-br from-card to-background flex flex-col items-center justify-center text-center p-8">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <Globe className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Your Autopilot is Running</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-8 leading-relaxed">
                  Steward is currently managing your presence. When new features like the Event Dashboard and Social Automation are fully released, they will appear here.
                </p>
                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                  <div className="p-4 rounded-xl bg-secondary/50 border border-white/5 flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    <span className="text-sm font-medium text-white">Website Live</span>
                  </div>
                  <div className="p-4 rounded-xl bg-secondary/50 border border-white/5 flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    <span className="text-sm font-medium text-white">AI Assistant Ready</span>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
