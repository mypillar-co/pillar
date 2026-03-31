import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle2,
  CreditCard,
  AlertTriangle,
  Building2,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ConnectStatus = {
  hasConnectAccount: boolean;
  connectAccountId: string | null;
  onboarded: boolean;
  accountStatus: string | null;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  isNonprofit: boolean;
  totalRevenue: number;
  totalSales: number;
};

type Transaction = {
  id: string;
  eventId: string;
  attendeeName: string;
  attendeeEmail: string | null;
  quantity: number;
  amountPaid: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  eventName: string | null;
};

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-green-500/15 text-green-400 border-green-500/20" },
    pending: { label: "Pending Review", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" },
    incomplete: { label: "Setup Incomplete", className: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
    error: { label: "Error", className: "bg-red-500/15 text-red-400 border-red-500/20" },
  };
  const s = map[status] ?? { label: status, className: "bg-gray-500/15 text-gray-400 border-gray-500/20" };
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}

export default function Payments() {
  const qc = useQueryClient();

  const { data: connect, isLoading, isError, refetch } = useQuery<ConnectStatus>({
    queryKey: ["connect-status"],
    queryFn: () => req<ConnectStatus>("/api/connect/status"),
  });

  const { data: txData } = useQuery<{ transactions: Transaction[] }>({
    queryKey: ["connect-transactions"],
    queryFn: () => req<{ transactions: Transaction[] }>("/api/connect/transactions"),
  });

  const onboardMutation = useMutation({
    mutationFn: () => req<{ url: string }>("/api/connect/onboard", { method: "POST" }),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  const dashboardMutation = useMutation({
    mutationFn: () => req<{ url: string }>("/api/connect/dashboard", { method: "POST" }),
    onSuccess: (data) => {
      window.open(data.url, "_blank");
    },
  });

  if (isError) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-white font-medium mb-1">Failed to load payment data</p>
          <p className="text-sm text-muted-foreground mb-4">Please check your connection and try again.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  const transactions = txData?.transactions ?? [];
  const isOnboarded = connect?.onboarded && connect.accountStatus === "active";

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Payments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Collect ticket sales, vendor fees, and sponsorship payments</p>
        </div>
        {isOnboarded && (
          <Button
            variant="outline"
            size="sm"
            className="border-white/10"
            onClick={() => dashboardMutation.mutate()}
            disabled={dashboardMutation.isPending}
          >
            {dashboardMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <ExternalLink className="w-4 h-4 mr-1.5" />}
            Stripe Dashboard
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !connect?.hasConnectAccount ? (
        <>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">Set Up Payment Collection</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Connect your bank account through Stripe to accept ticket sales, vendor booth fees, and sponsorship payments.
                    Money goes directly to your account — Pillar takes a small 2.9% + $0.30 platform fee per transaction.
                  </p>
                  <div className="flex flex-wrap gap-3 mb-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span>Ticket sales</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span>Vendor fees</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span>Sponsorship payments</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span>Nonprofit support</span>
                    </div>
                  </div>
                  <Button
                    data-tour="connect-stripe-btn"
                    onClick={() => onboardMutation.mutate()}
                    disabled={onboardMutation.isPending}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {onboardMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
                    Connect with Stripe
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <TaxNoticeCard />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-white/10 bg-card/60">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">Payment Account</p>
                  <StatusBadge status={connect.accountStatus} />
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" />
                  <p className="text-lg font-semibold text-white">
                    {isOnboarded ? "Connected" : "Setup Required"}
                  </p>
                </div>
                {!isOnboarded && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 border-primary/30 text-primary text-xs"
                    onClick={() => onboardMutation.mutate()}
                    disabled={onboardMutation.isPending}
                  >
                    {onboardMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Complete Setup
                  </Button>
                )}
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-card/60">
              <CardContent className="pt-5 pb-4">
                <p className="text-sm text-muted-foreground mb-2">Total Revenue</p>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                  <p className="text-2xl font-bold text-white">${(connect.totalRevenue ?? 0).toFixed(2)}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">From {connect.totalSales ?? 0} transactions</p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-card/60">
              <CardContent className="pt-5 pb-4">
                <p className="text-sm text-muted-foreground mb-2">Payouts</p>
                <div className="flex items-center gap-2">
                  {connect.payoutsEnabled ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                      <p className="text-lg font-semibold text-white">Enabled</p>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-5 h-5 text-yellow-400" />
                      <p className="text-lg font-semibold text-white">Not Active</p>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {connect.payoutsEnabled ? "Funds transfer to your bank automatically" : "Complete Stripe setup to enable payouts"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-white/10 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Receipt className="w-4 h-4" />
                Transaction History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <div className="text-center py-12">
                  <DollarSign className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No transactions yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                    Transactions will appear here as attendees purchase tickets and vendors pay fees.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-5 gap-4 text-xs text-muted-foreground font-medium px-3 py-2">
                    <span>Attendee</span>
                    <span>Event</span>
                    <span>Amount</span>
                    <span>Status</span>
                    <span>Date</span>
                  </div>
                  {transactions.map((tx) => (
                    <div key={tx.id} className="grid grid-cols-5 gap-4 text-sm px-3 py-2.5 rounded-md hover:bg-white/5">
                      <div>
                        <p className="text-white truncate">{tx.attendeeName}</p>
                        {tx.attendeeEmail && <p className="text-xs text-muted-foreground truncate">{tx.attendeeEmail}</p>}
                      </div>
                      <p className="text-muted-foreground truncate">{tx.eventName ?? "—"}</p>
                      <p className="text-white font-medium">${tx.amountPaid.toFixed(2)}</p>
                      <div>
                        <Badge variant="outline" className={
                          tx.paymentStatus === "paid" ? "bg-green-500/15 text-green-400 border-green-500/20" :
                          tx.paymentStatus === "pending" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" :
                          "bg-gray-500/15 text-gray-400 border-gray-500/20"
                        }>
                          {tx.paymentStatus}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <TaxNoticeCard />
        </>
      )}
    </div>
  );
}

function TaxNoticeCard() {
  return (
    <Card className="border-yellow-500/20 bg-yellow-500/5">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <Building2 className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-white mb-1">Tax & Nonprofit Information</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-white/80">Tax liability:</strong> Your organization is responsible for reporting and paying applicable taxes on revenue collected through this platform. Pillar does not withhold taxes or file tax returns on your behalf.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-2">
              <strong className="text-white/80">Nonprofits:</strong> If your organization has 501(c)(3) or equivalent tax-exempt status, you can indicate this during Stripe onboarding. Stripe will verify your nonprofit status and may apply reduced processing fees. Consult your tax advisor for guidance on donation receipts and reporting requirements.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-2">
              <strong className="text-white/80">1099-K reporting:</strong> Stripe issues 1099-K forms to organizations that meet IRS reporting thresholds. You will receive this form directly from Stripe if applicable.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
