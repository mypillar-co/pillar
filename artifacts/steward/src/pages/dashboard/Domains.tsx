import React, { useState, useEffect, useCallback } from "react";
import {
  Globe,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ShoppingCart,
  Loader2,
  Trash2,
  ExternalLink,
  Gift,
  AlertCircle,
  RefreshCw,
  Plus,
  Link2,
  ToggleLeft,
  ToggleRight,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Copy,
} from "lucide-react";
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
  dnsStatus?: string | null;
  sslStatus?: string | null;
  purchasedAt?: string | null;
  expiresAt?: string | null;
  registrarRef?: string | null;
  registrar?: string | null;
  isExternal?: boolean | null;
  autoRenew?: boolean | null;
};

type DomainsResponse = {
  domains: Domain[];
  subdomain?: string | null;
  cnameTarget?: string;
};

type CheckResult = {
  domain: string;
  available: boolean;
  isFreeForTier: boolean;
  price: number;
  priceFormatted: string;
  reason?: string;
  isPremium?: boolean;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active:          { label: "Active",           color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", icon: CheckCircle2 },
  pending:         { label: "Processing",       color: "text-amber-400 border-amber-500/30 bg-amber-500/10",       icon: Clock },
  pending_payment: { label: "Awaiting Payment", color: "text-amber-400 border-amber-500/30 bg-amber-500/10",       icon: Clock },
  pending_manual:  { label: "Configuring DNS",  color: "text-blue-400 border-blue-500/30 bg-blue-500/10",         icon: Clock },
  failed:          { label: "Failed",           color: "text-red-400 border-red-500/30 bg-red-500/10",             icon: XCircle },
};

const DNS_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:     { label: "DNS Pending",     color: "text-slate-400 border-slate-500/30 bg-slate-500/10",   icon: Clock },
  propagating: { label: "DNS Propagating", color: "text-amber-400 border-amber-500/30 bg-amber-500/10",   icon: Clock },
  live:        { label: "DNS Live",        color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", icon: CheckCircle2 },
  failed:      { label: "DNS Error",       color: "text-red-400 border-red-500/30 bg-red-500/10",         icon: XCircle },
};

const SSL_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "SSL Pending",  color: "text-slate-400 border-slate-500/30 bg-slate-500/10",    icon: Shield },
  active:  { label: "SSL Active",   color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", icon: ShieldCheck },
  failed:  { label: "SSL Error",    color: "text-red-400 border-red-500/30 bg-red-500/10",          icon: ShieldAlert },
};

const FREE_DOMAIN_TIERS = new Set(["tier1a", "tier2", "tier3"]);
const ADDON_TIERS = new Set(["tier1"]);

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="text-muted-foreground hover:text-white transition-colors ml-1"
      title="Copy"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function Domains() {
  const { data: orgData } = useGetOrganization();
  const { data: subData } = useGetSubscription();
  const org = orgData?.organization;
  const tier = subData?.tierId ?? org?.tier ?? null;

  const isFreeForTier = tier ? FREE_DOMAIN_TIERS.has(tier) : false;
  const isAddonAvailable = tier ? ADDON_TIERS.has(tier) : false;
  const hasAnyTier = !!tier;
  const hasNoSubscription = !tier;

  const [domains, setDomains] = useState<Domain[]>([]);
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [cnameTarget, setCnameTarget] = useState<string>("proxy.steward.app");
  const [loadingDomains, setLoadingDomains] = useState(true);

  const [searchInput, setSearchInput] = useState("");
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const [byodInput, setByodInput] = useState("");
  const [addingExternal, setAddingExternal] = useState(false);
  const [showByodForm, setShowByodForm] = useState(false);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDomains = useCallback(() => {
    fetch("/api/domains", { credentials: "include" })
      .then(r => r.json())
      .then((data: DomainsResponse) => {
        setDomains(data.domains ?? []);
        setSubdomain(data.subdomain ?? null);
        setCnameTarget(data.cnameTarget ?? "proxy.steward.app");
      })
      .catch(() => null)
      .finally(() => setLoadingDomains(false));
  }, []);

  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  // Handle ?domain_success=<sessionId> redirect back from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("domain_success");
    if (!sessionId) return;

    window.history.replaceState({}, "", window.location.pathname);

    fetch("/api/domains/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sessionId }),
    })
      .then(r => r.json())
      .then((data: { domain?: Domain; message?: string; error?: string }) => {
        if (data.error) {
          toast.error(data.error);
        } else {
          toast.success(data.message ?? "Domain payment confirmed! Setting up your domain now.");
          loadDomains();
        }
      })
      .catch(() => toast.error("Could not confirm domain payment. Please contact support."));
  }, [loadDomains]);

  const activeDomain = domains.find(d => d.status === "active");
  const pendingDomain = domains.find(d => d.status !== "active" && d.status !== "failed");
  const hasDomain = domains.length > 0;
  const showSearch = (isFreeForTier || isAddonAvailable) && !hasDomain;

  // Show in-app expiry warning for non-auto-renew domains expiring within 30 days
  const expiringDomain = domains.find(d => {
    if (!d.expiresAt || d.isExternal) return false;
    const daysLeft = Math.ceil((new Date(d.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 30;
  });

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
      loadDomains();
      setCheckResult(null);
      setSearchInput("");
    } catch {
      toast.error("Could not claim domain");
    } finally {
      setClaiming(false);
    }
  };

  const handleAddExternal = async () => {
    if (!byodInput.trim()) return;
    setAddingExternal(true);
    try {
      const res = await fetch("/api/domains/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ domain: byodInput.trim() }),
      });
      const data = await res.json() as { domain?: Domain; message?: string; cnameTarget?: string; error?: string };
      if (!res.ok) { toast.error(data.error ?? "Could not add domain"); return; }
      toast.success(data.message ?? "Domain added! Follow the DNS instructions below.");
      loadDomains();
      setByodInput("");
      setShowByodForm(false);
    } catch {
      toast.error("Could not add domain");
    } finally {
      setAddingExternal(false);
    }
  };

  const handleVerifyDns = async (id: string) => {
    setVerifyingId(id);
    try {
      const res = await fetch(`/api/domains/${id}/verify`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json() as { domain?: Domain; dnsLive?: boolean; message?: string; error?: string };
      if (!res.ok) { toast.error(data.error ?? "Verification failed"); return; }
      if (data.dnsLive) {
        toast.success(data.message ?? "DNS is live! Your domain is connected.");
      } else {
        toast.info(data.message ?? "DNS is still propagating. Check back in a few hours.");
      }
      loadDomains();
    } catch {
      toast.error("Could not verify DNS");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleToggleAutoRenew = async (d: Domain) => {
    setTogglingId(d.id);
    try {
      const res = await fetch(`/api/domains/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ autoRenew: !d.autoRenew }),
      });
      const data = await res.json() as Domain & { error?: string };
      if (!res.ok) { toast.error((data as { error?: string }).error ?? "Update failed"); return; }
      setDomains(prev => prev.map(x => x.id === d.id ? { ...x, autoRenew: data.autoRenew } : x));
      toast.success(`Auto-renew ${data.autoRenew ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Could not update auto-renew");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/domains/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        toast.error(data.error ?? "Could not remove domain");
        return;
      }
      setDomains(prev => prev.filter(d => d.id !== id));
      toast.success("Domain removed");
    } catch {
      toast.error("Could not remove domain");
    } finally {
      setDeletingId(null);
    }
  };

  const needsDnsSetup = (d: Domain) =>
    d.status !== "active" && (d.dnsStatus === "pending" || d.dnsStatus === "propagating" || d.status === "pending_manual");

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Custom Domain</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect a professional domain to your Steward website.
        </p>
      </div>

      {/* Free subdomain banner */}
      {subdomain && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-white/8 bg-card/30">
          <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Your free subdomain</p>
            <p className="text-sm font-mono text-white truncate">{subdomain}</p>
          </div>
          <a href={`https://${subdomain}`} target="_blank" rel="noopener noreferrer">
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-white flex-shrink-0">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </a>
        </div>
      )}

      {/* Domain expiry warning banner */}
      {expiringDomain && expiringDomain.expiresAt && (() => {
        const daysLeft = Math.ceil((new Date(expiringDomain.expiresAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const isExpired = daysLeft <= 0;
        return (
          <div className={`flex items-start gap-3 p-4 rounded-xl border ${isExpired ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
            <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isExpired ? "text-red-400" : "text-amber-400"}`} />
            <div>
              <p className={`text-sm font-medium ${isExpired ? "text-red-300" : "text-amber-300"}`}>
                {isExpired ? "Domain expired" : `Domain expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`}
              </p>
              <p className={`text-xs mt-0.5 ${isExpired ? "text-red-400/70" : "text-amber-400/70"}`}>
                {isExpired
                  ? `${expiringDomain.domain} has expired. Enable auto-renew or contact support to restore.`
                  : `${expiringDomain.domain} will expire soon. Enable auto-renew to keep it active automatically.`}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Plan banners */}
      {hasNoSubscription && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">No active plan</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Subscribe to a plan to get a custom domain.{" "}
              <Link href="/billing" className="underline hover:text-amber-300">View plans →</Link>
            </p>
          </div>
        </div>
      )}

      {isFreeForTier && !hasDomain && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <Gift className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-300">Free domain included with your plan</p>
            <p className="text-xs text-emerald-400/70 mt-0.5">Search below to claim your free .com, .org, or .net domain.</p>
          </div>
        </div>
      )}

      {isAddonAvailable && !hasDomain && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
          <Globe className="w-5 h-5 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-white">Domain add-on — $24/year</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Purchase a custom domain below, or bring your own. Upgrade to Tier 1a for a free included domain.
            </p>
          </div>
        </div>
      )}

      {/* Domain search (register new) */}
      {showSearch && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCheck(); }}
              placeholder="e.g. myorg.com or myclub.org"
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
                    <Button size="sm" onClick={handleClaim} disabled={claiming} className="gap-2 flex-shrink-0">
                      {claiming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />}
                      Claim Free
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handlePurchase} disabled={purchasing} className="gap-2 flex-shrink-0">
                      {purchasing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                      Buy $24/yr
                    </Button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bring your own domain (BYOD) */}
      {hasAnyTier && !hasDomain && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Already own a domain?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Connect a domain you registered elsewhere.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-white/10 hover:bg-white/5"
              onClick={() => setShowByodForm(v => !v)}
            >
              <Link2 className="w-3.5 h-3.5" />
              {showByodForm ? "Cancel" : "Connect Domain"}
            </Button>
          </div>

          {showByodForm && (
            <div className="flex gap-2">
              <Input
                value={byodInput}
                onChange={e => setByodInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddExternal(); }}
                placeholder="e.g. myexistingdomain.com"
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
              />
              <Button
                onClick={handleAddExternal}
                disabled={!byodInput.trim() || addingExternal}
                className="flex-shrink-0 gap-2"
              >
                {addingExternal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add
              </Button>
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
            {hasNoSubscription && (
              <p className="text-xs text-muted-foreground mt-1">
                <Link href="/billing" className="underline hover:text-white">Subscribe to get started →</Link>
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {domains.map(d => {
              const cfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              const expiry = d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : null;
              const dnsStatusCfg = d.dnsStatus ? (DNS_STATUS_CONFIG[d.dnsStatus] ?? DNS_STATUS_CONFIG.pending) : null;
              const sslStatusCfg = d.sslStatus ? (SSL_STATUS_CONFIG[d.sslStatus] ?? SSL_STATUS_CONFIG.pending) : null;
              const isVerifying = verifyingId === d.id;
              const isToggling = togglingId === d.id;
              const isDeleting = deletingId === d.id;

              return (
                <div key={d.id} className="rounded-xl border border-white/8 bg-card/40 overflow-hidden">
                  {/* Main row */}
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">{d.domain}</p>
                          {d.isExternal && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-slate-500/30 text-slate-400">
                              External
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          {expiry && <p className="text-xs text-muted-foreground">Expires {expiry}</p>}
                          {d.registrar && d.registrar !== "external" && (
                            <p className="text-xs text-muted-foreground capitalize">via {d.registrar}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className={`text-xs flex items-center gap-1 ${cfg.color}`}>
                        <StatusIcon className="w-3 h-3" />
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
                          disabled={isDeleting}
                        >
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* DNS/SSL status row */}
                  {(dnsStatusCfg || sslStatusCfg) && (
                    <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                      {dnsStatusCfg && (
                        <Badge variant="outline" className={`text-[10px] flex items-center gap-1 ${dnsStatusCfg.color}`}>
                          <dnsStatusCfg.icon className="w-2.5 h-2.5" />
                          {dnsStatusCfg.label}
                        </Badge>
                      )}
                      {sslStatusCfg && (
                        <Badge variant="outline" className={`text-[10px] flex items-center gap-1 ${sslStatusCfg.color}`}>
                          <sslStatusCfg.icon className="w-2.5 h-2.5" />
                          {sslStatusCfg.label}
                        </Badge>
                      )}
                      {needsDnsSetup(d) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-2 text-muted-foreground hover:text-white gap-1"
                          onClick={() => handleVerifyDns(d.id)}
                          disabled={isVerifying}
                        >
                          {isVerifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Check DNS
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Auto-renew row (non-external domains with expiry) */}
                  {!d.isExternal && d.expiresAt && (
                    <div className="px-4 pb-3 flex items-center gap-2 border-t border-white/5 pt-3">
                      <button
                        onClick={() => handleToggleAutoRenew(d)}
                        disabled={isToggling}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors"
                      >
                        {isToggling ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : d.autoRenew ? (
                          <ToggleRight className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="w-4 h-4" />
                        )}
                        Auto-renew {d.autoRenew ? "on" : "off"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DNS setup instructions */}
      {(activeDomain || pendingDomain) && (() => {
        const d = activeDomain ?? pendingDomain!;
        return (
          <div className="p-4 rounded-xl border border-white/10 bg-card/30 space-y-4">
            <h3 className="text-sm font-semibold text-white">DNS Configuration</h3>
            {d.isExternal ? (
              <>
                <p className="text-xs text-muted-foreground">
                  To connect <span className="text-white font-mono">{d.domain}</span> to your Steward site, add the following
                  CNAME record in your domain registrar's DNS settings. Changes can take up to 48 hours to propagate.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-white/5 border border-white/8">
                    <p className="text-muted-foreground mb-0.5">Type</p>
                    <p className="text-white">CNAME</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/5 border border-white/8">
                    <p className="text-muted-foreground mb-0.5">Name / Host</p>
                    <p className="text-white">@ (or www)</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/5 border border-white/8">
                    <p className="text-muted-foreground mb-0.5 flex items-center gap-1">
                      Value / Target
                      <CopyButton value={cnameTarget} />
                    </p>
                    <p className="text-white break-all">{cnameTarget}</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Your domain is registered. To point it at your Steward site, add this CNAME record in Porkbun's DNS manager,
                  or contact support if you need help.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-white/5 border border-white/8">
                    <p className="text-muted-foreground mb-0.5">Type</p>
                    <p className="text-white">CNAME</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/5 border border-white/8">
                    <p className="text-muted-foreground mb-0.5">Name / Host</p>
                    <p className="text-white">@</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/5 border border-white/8">
                    <p className="text-muted-foreground mb-0.5 flex items-center gap-1">
                      Value / Target
                      <CopyButton value={cnameTarget} />
                    </p>
                    <p className="text-white break-all">{cnameTarget}</p>
                  </div>
                </div>
              </>
            )}
            {(d.dnsStatus === "pending" || d.dnsStatus === "propagating") && (
              <Button
                size="sm"
                variant="outline"
                className="border-white/10 hover:bg-white/5 gap-2 text-xs"
                onClick={() => handleVerifyDns(d.id)}
                disabled={verifyingId === d.id}
              >
                {verifyingId === d.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <RefreshCw className="w-3.5 h-3.5" />}
                Verify DNS
              </Button>
            )}
          </div>
        );
      })()}
    </div>
  );
}
