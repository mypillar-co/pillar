import React, { useState, useEffect } from "react";
import { Globe, Search, CheckCircle2, XCircle, Clock, ShoppingCart, Loader2, Trash2, ExternalLink, Gift, AlertCircle } from "lucide-react";
import { useGetOrganization, useGetSubscription } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Link } from "wouter";

type Domain = {
  id: string;
  domain: string;
  status: string;
  purchasedAt?: string;
  expiresAt?: string;
  registrarRef?: string;
};

type CheckResult = {
  domain: string;
  available: boolean;
  isFreeForTier: boolean;
  price: number;
  priceFormatted: string;
  reason?: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active:          { label: "Active",           color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", icon: CheckCircle2 },
  pending:         { label: "Processing",       color: "text-amber-400 border-amber-500/30 bg-amber-500/10",       icon: Clock },
  pending_payment: { label: "Awaiting Payment", color: "text-amber-400 border-amber-500/30 bg-amber-500/10",       icon: Clock },
  pending_manual:  { label: "Being Registered", color: "text-blue-400 border-blue-500/30 bg-blue-500/10",         icon: Clock },
  failed:          { label: "Failed",           color: "text-red-400 border-red-500/30 bg-red-500/10",             icon: XCircle },
};

const FREE_DOMAIN_TIERS = new Set(["tier1a", "tier2", "tier3"]);
const ADDON_TIERS = new Set(["tier1"]);

export default function Domains() {
  const { data: orgData } = useGetOrganization();
  const { data: subData } = useGetSubscription();
  const org = orgData?.organization;
  const tier = subData?.tierId ?? org?.tier ?? null;

  const isFreeForTier = tier ? FREE_DOMAIN_TIERS.has(tier) : false;
  const isAddonAvailable = tier ? ADDON_TIERS.has(tier) : false;
  const hasNoSubscription = !tier;

  const [domains, setDomains] = useState<Domain[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const activeDomain = domains.find(d => d.status === "active");
  const hasDomain = domains.length > 0;

  useEffect(() => {
    fetch("/api/domains", { credentials: "include" })
      .then(r => r.json())
      .then((data: { domains: Domain[] }) => setDomains(data.domains ?? []))
      .catch(() => null)
      .finally(() => setLoadingDomains(false));
  }, []);

  const handleCheck = async () => {
    if (!searchInput.trim()) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch("/api/domains/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ domain: searchInput.trim() }),
      });
      const data = await res.json() as CheckResult & { error?: string };
      if (!res.ok) { toast.error(data.error ?? "Check failed"); return; }
      setCheckResult(data);
    } catch {
      toast.error("Could not check domain availability");
    } finally {
      setChecking(false);
    }
  };

  const handlePurchase = async () => {
    if (!checkResult?.domain) return;
    setPurchasing(true);
    try {
      const res = await fetch("/api/domains/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ domain: checkResult.domain }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) { toast.error(data.error ?? "Checkout failed"); return; }
      if (data.url) window.location.href = data.url;
    } catch {
      toast.error("Could not start checkout");
    } finally {
      setPurchasing(false);
    }
  };

  const handleClaim = async () => {
    if (!checkResult?.domain) return;
    setClaiming(true);
    try {
      const res = await fetch("/api/domains/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ domain: checkResult.domain }),
      });
      const data = await res.json() as { domain?: Domain; message?: string; error?: string };
      if (!res.ok) { toast.error(data.error ?? "Claim failed"); return; }
      toast.success(data.message ?? `${checkResult.domain} is being registered!`);
      if (data.domain) setDomains(prev => [...prev, data.domain!]);
      setCheckResult(null);
      setSearchInput("");
    } catch {
      toast.error("Could not claim domain");
    } finally {
      setClaiming(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/domains/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { toast.error("Could not remove domain"); return; }
      setDomains(prev => prev.filter(d => d.id !== id));
      toast.success("Domain removed");
    } catch {
      toast.error("Could not remove domain");
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Custom Domain</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect a professional domain to your Steward website.
        </p>
      </div>

      {/* Plan notice */}
      {hasNoSubscription && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">No active plan</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Subscribe to a plan to get a domain.{" "}
              <Link href="/billing" className="underline hover:text-amber-300">View plans →</Link>
            </p>
          </div>
        </div>
      )}

      {isFreeForTier && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <Gift className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-300">Free domain included with your plan</p>
            <p className="text-xs text-emerald-400/70 mt-0.5">Search below to claim your domain — 1 free .com/year.</p>
          </div>
        </div>
      )}

      {isAddonAvailable && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
          <Globe className="w-5 h-5 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-white">Domain add-on — $24/year</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Search and purchase a custom domain below. Upgrade to Tier 1a for a free included domain.
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      {(isFreeForTier || isAddonAvailable) && !activeDomain && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCheck(); }}
              placeholder="e.g. grandlodge123.com or myclub.org"
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
            />
            <Button onClick={handleCheck} disabled={!searchInput.trim() || checking} className="flex-shrink-0 gap-2">
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Check
            </Button>
          </div>

          {checkResult && (
            <div className={`p-4 rounded-xl border ${checkResult.available ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {checkResult.available
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    : <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />}
                  <div>
                    <p className="font-medium text-white text-sm">{checkResult.domain}</p>
                    {checkResult.available
                      ? <p className="text-xs text-emerald-400/80">{checkResult.priceFormatted}</p>
                      : <p className="text-xs text-red-400/80">{checkResult.reason ?? "Not available"}</p>}
                  </div>
                </div>
                {checkResult.available && (
                  isFreeForTier ? (
                    <Button size="sm" onClick={handleClaim} disabled={claiming} className="gap-2">
                      {claiming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />}
                      Claim Free Domain
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handlePurchase} disabled={purchasing} className="gap-2">
                      {purchasing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                      Purchase $24/yr
                    </Button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Registered domains */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Your Domains</h2>
        {loadingDomains ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : domains.length === 0 ? (
          <div className="text-center py-10 rounded-xl border border-dashed border-white/10">
            <Globe className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No domains registered yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {domains.map(d => {
              const cfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const expiry = d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : null;
              return (
                <div key={d.id} className="flex items-center justify-between p-4 rounded-xl border border-white/8 bg-card/40">
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-white">{d.domain}</p>
                      {expiry && <p className="text-xs text-muted-foreground">Expires {expiry}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs flex items-center gap-1 ${cfg.color}`}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </Badge>
                    {d.status === "active" && (
                      <a href={`https://${d.domain}`} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-white">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    )}
                    {d.status !== "active" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-red-400"
                        onClick={() => handleDelete(d.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DNS instructions for active domain */}
      {activeDomain && (
        <div className="p-4 rounded-xl border border-white/10 bg-card/30 space-y-3">
          <h3 className="text-sm font-semibold text-white">DNS Configuration</h3>
          <p className="text-xs text-muted-foreground">
            Your domain is registered and managed by Steward. Point your domain's nameservers to our servers to go live.
            DNS changes can take up to 48 hours to propagate.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2 rounded-lg bg-white/5 border border-white/8">
              <p className="text-muted-foreground mb-0.5">Nameserver 1</p>
              <p className="text-white">ns1.steward.app</p>
            </div>
            <div className="p-2 rounded-lg bg-white/5 border border-white/8">
              <p className="text-muted-foreground mb-0.5">Nameserver 2</p>
              <p className="text-white">ns2.steward.app</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
