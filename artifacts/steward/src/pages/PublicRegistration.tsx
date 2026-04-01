import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Building2, Star, ShoppingBag, CheckCircle2, AlertCircle, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type OrgInfo = {
  orgId: string;
  orgName: string;
  orgType: string;
  vendorFeeCents: number;
  sponsorFeeCents: number;
  acceptsPayments: boolean;
};

const SPONSOR_TIERS = ["Presenting", "Gold", "Silver", "Bronze", "Community"];
const VENDOR_TYPES = [
  { value: "food", label: "Food & Beverage" },
  { value: "merchandise", label: "Merchandise & Retail" },
  { value: "service", label: "Services" },
  { value: "entertainment", label: "Entertainment & Activities" },
  { value: "other", label: "Other" },
];

function formatDollars(cents: number) {
  return cents === 0 ? "Free" : `$${(cents / 100).toFixed(0)}`;
}

export default function PublicRegistration() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [, navigate] = useLocation();

  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [step, setStep] = useState<"type" | "form" | "submitting" | "success" | "free_success">("type");
  const [regType, setRegType] = useState<"vendor" | "sponsor" | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [tier, setTier] = useState("");
  const [vendorType, setVendorType] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgSlug) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("cancelled")) {
      setStep("type");
    }
    fetch(`/api/public/orgs/${orgSlug}/register-info`)
      .then(r => r.json())
      .then((data: OrgInfo & { error?: string }) => {
        if (data.error) { setOrgError(data.error); return; }
        setOrgInfo(data);
      })
      .catch(() => setOrgError("Could not load organization info."))
      .finally(() => setLoadingOrg(false));
  }, [orgSlug]);

  const handleTypeSelect = (t: "vendor" | "sponsor") => {
    setRegType(t);
    setStep("form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) { setFormError("Name is required."); return; }
    if (!email.trim()) { setFormError("Email is required."); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setFormError("Please enter a valid email."); return; }
    if (regType === "sponsor" && !tier) { setFormError("Please select a sponsorship tier."); return; }
    if (regType === "vendor" && !vendorType) { setFormError("Please select a vendor type."); return; }

    setStep("submitting");
    try {
      const res = await fetch(`/api/public/orgs/${orgSlug}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: regType,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          website: website.trim() || undefined,
          logoUrl: logoUrl.trim() || undefined,
          description: description.trim() || undefined,
          tier: regType === "sponsor" ? tier : undefined,
          vendorType: regType === "vendor" ? vendorType : undefined,
        }),
      });
      const data = await res.json() as { checkoutUrl?: string; free?: boolean; error?: string };
      if (!res.ok) { setStep("form"); setFormError(data.error ?? "Submission failed. Please try again."); return; }
      if (data.free || !data.checkoutUrl) {
        setStep("free_success");
      } else {
        window.location.href = data.checkoutUrl!;
      }
    } catch {
      setStep("form");
      setFormError("Network error. Please try again.");
    }
  };

  const params = new URLSearchParams(window.location.search);
  const cancelled = params.get("cancelled");

  if (loadingOrg) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  if (orgError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <p className="text-white font-semibold text-lg">{orgError}</p>
          <p className="text-slate-400 text-sm">Please check the URL and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-lg mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 mb-4">
            <Building2 className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">{orgInfo!.orgName}</h1>
          <p className="text-slate-400 mt-1.5 text-sm">Vendor & Sponsor Registration</p>
        </div>

        {cancelled && step === "type" && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300">Payment was cancelled. Please try again.</p>
          </div>
        )}

        {/* Step: Choose Type */}
        {step === "type" && (
          <div className="space-y-4">
            <p className="text-center text-slate-300 text-sm mb-6">
              Choose your registration type to get started.
            </p>
            <button
              onClick={() => handleTypeSelect("sponsor")}
              className="w-full p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-left flex items-start gap-4 group"
            >
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Star className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">Become a Sponsor</p>
                  <span className="text-sm font-semibold text-amber-400">
                    {formatDollars(orgInfo!.sponsorFeeCents)}
                  </span>
                </div>
                <p className="text-slate-400 text-sm mt-1">
                  Get your logo and website featured prominently. Boost your brand visibility in the community.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors self-center flex-shrink-0" />
            </button>

            <button
              onClick={() => handleTypeSelect("vendor")}
              className="w-full p-5 rounded-xl border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 transition-colors text-left flex items-start gap-4 group"
            >
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">Register as a Vendor</p>
                  <span className="text-sm font-semibold text-blue-400">
                    {formatDollars(orgInfo!.vendorFeeCents)}
                  </span>
                </div>
                <p className="text-slate-400 text-sm mt-1">
                  Participate at our events and reach our community directly with your products or services.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors self-center flex-shrink-0" />
            </button>
          </div>
        )}

        {/* Step: Form */}
        {step === "form" && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center gap-2 mb-6">
              <button
                type="button"
                onClick={() => setStep("type")}
                className="text-slate-400 hover:text-white text-sm transition-colors"
              >
                ← Back
              </button>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1.5">
                {regType === "sponsor"
                  ? <Star className="w-4 h-4 text-amber-400" />
                  : <ShoppingBag className="w-4 h-4 text-blue-400" />}
                <span className="text-sm font-medium text-white capitalize">{regType} Registration</span>
                <span className="text-sm text-slate-500">
                  — {formatDollars(regType === "sponsor" ? orgInfo!.sponsorFeeCents : orgInfo!.vendorFeeCents)}
                </span>
              </div>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-300">{formError}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-slate-300">Organization / Business Name <span className="text-red-400">*</span></Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Acme Corp"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">Contact Email <span className="text-red-400">*</span></Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">Phone</Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="text-slate-300">Website</Label>
                <Input
                  type="url"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  placeholder="https://yourcompany.com"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="text-slate-300">Logo URL</Label>
                <Input
                  type="url"
                  value={logoUrl}
                  onChange={e => setLogoUrl(e.target.value)}
                  placeholder="https://yourcompany.com/logo.png"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
                />
                <p className="text-[11px] text-slate-500">Paste a link to your logo image (PNG, JPG, or SVG)</p>
              </div>

              {regType === "sponsor" && (
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-slate-300">Sponsorship Tier <span className="text-red-400">*</span></Label>
                  <Select value={tier} onValueChange={setTier}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
                      {SPONSOR_TIERS.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {regType === "vendor" && (
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-slate-300">Vendor Type <span className="text-red-400">*</span></Label>
                  <Select value={vendorType} onValueChange={setVendorType}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {VENDOR_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="col-span-2 space-y-1.5">
                <Label className="text-slate-300">Tell us about yourself</Label>
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={regType === "sponsor"
                    ? "What does your company do? Why do you want to sponsor us?"
                    : "What products or services do you offer?"}
                  rows={3}
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 resize-none"
                />
              </div>
            </div>

            <div className="pt-2 space-y-3">
              {(regType === "sponsor" ? orgInfo!.sponsorFeeCents : orgInfo!.vendorFeeCents) > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                  <span className="text-sm text-slate-300">Registration fee</span>
                  <span className="text-sm font-semibold text-white">
                    {formatDollars(regType === "sponsor" ? orgInfo!.sponsorFeeCents : orgInfo!.vendorFeeCents)}
                  </span>
                </div>
              )}
              <p className="text-xs text-slate-500 text-center">
                Your application will be reviewed by {orgInfo!.orgName} before approval.
                {(regType === "sponsor" ? orgInfo!.sponsorFeeCents : orgInfo!.vendorFeeCents) > 0 &&
                  " Payment is required to submit your application."}
              </p>
              <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold h-11">
                {(regType === "sponsor" ? orgInfo!.sponsorFeeCents : orgInfo!.vendorFeeCents) > 0
                  ? "Pay & Submit Application →"
                  : "Submit Application →"}
              </Button>
            </div>
          </form>
        )}

        {/* Step: Submitting */}
        {step === "submitting" && (
          <div className="text-center space-y-4 py-12">
            <Loader2 className="w-10 h-10 text-amber-400 animate-spin mx-auto" />
            <p className="text-white font-semibold">Submitting your application…</p>
            <p className="text-slate-400 text-sm">Please don't close this window.</p>
          </div>
        )}

        {/* Step: Free success */}
        {step === "free_success" && (
          <div className="text-center space-y-5 py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Application Submitted!</h2>
              <p className="text-slate-400 mt-2 text-sm">
                Your application has been submitted to <span className="text-white">{orgInfo!.orgName}</span>. 
                They'll review it and be in touch.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function RegistrationSuccess() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 mx-auto">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Payment Received!</h2>
          <p className="text-slate-400 mt-2 text-sm">
            Your application and payment have been submitted. The organization will review your application and reach out soon.
          </p>
        </div>
        <p className="text-xs text-slate-600">You can close this window.</p>
      </div>
    </div>
  );
}
