import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import {
  Building2, Star, ShoppingBag, CheckCircle2, AlertCircle, ChevronRight,
  Loader2, UploadCloud, FileText, X, Image as ImageIcon,
} from "lucide-react";
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

// ─── Simple document uploader ────────────────────────────────────────────────

type DocUploadState = "idle" | "uploading" | "done" | "error";

function DocUploadField({
  label,
  hint,
  accept,
  onUploaded,
  required,
}: {
  label: string;
  hint?: string;
  accept?: string;
  onUploaded: (objectPath: string, fileName: string) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<DocUploadState>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setErr("File must be 10 MB or smaller.");
      return;
    }
    const type = file.type || "application/octet-stream";
    const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(type.toLowerCase())) {
      setErr("Only PDF and image files are accepted.");
      return;
    }

    setErr(null);
    setState("uploading");
    setProgress(10);
    setFileName(file.name);

    try {
      // Step 1: Get presigned URL
      const urlRes = await fetch("/api/public/registration-docs/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: type }),
      });
      if (!urlRes.ok) {
        const d = await urlRes.json();
        throw new Error(d.error ?? "Could not get upload URL");
      }
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

      setProgress(30);

      // Step 2: Upload directly to GCS
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": type },
      });
      if (!uploadRes.ok) throw new Error("Upload to storage failed");

      setProgress(100);
      setState("done");
      onUploaded(objectPath, file.name);
    } catch (e: unknown) {
      setState("error");
      setErr(e instanceof Error ? e.message : "Upload failed. Please try again.");
    }
  }, [onUploaded]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const clear = () => {
    setState("idle");
    setFileName(null);
    setProgress(0);
    setErr(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </Label>

      {state === "done" && fileName ? (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
          <FileText className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <p className="text-sm text-emerald-300 flex-1 truncate">{fileName}</p>
          <button type="button" onClick={clear} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className={`relative cursor-pointer rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
            state === "uploading"
              ? "border-amber-500/40 bg-amber-500/5"
              : state === "error"
              ? "border-red-500/40 bg-red-500/5 hover:bg-red-500/8"
              : "border-white/15 bg-white/3 hover:border-white/30 hover:bg-white/6"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept ?? ".pdf,.jpg,.jpeg,.png,.webp"}
            onChange={handleChange}
            className="sr-only"
          />
          {state === "uploading" ? (
            <div className="space-y-2">
              <Loader2 className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Uploading {fileName}…</p>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <UploadCloud className={`w-6 h-6 mx-auto ${state === "error" ? "text-red-400" : "text-slate-500"}`} />
              <p className="text-xs text-slate-400">
                Drop file here or <span className="text-amber-400">click to browse</span>
              </p>
              <p className="text-[11px] text-slate-600">PDF, JPG, or PNG · max 10 MB</p>
            </div>
          )}
        </div>
      )}

      {err && (
        <div className="flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-400">{err}</p>
        </div>
      )}
      {hint && !err && (
        <p className="text-[11px] text-slate-500">{hint}</p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PublicRegistration() {
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [step, setStep] = useState<"type" | "form" | "submitting" | "free_success">("type");
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
  const [servSafeUrl, setServSafeUrl] = useState<string | null>(null);
  const [servSafeName, setServSafeName] = useState<string | null>(null);
  const [insuranceCertUrl, setInsuranceCertUrl] = useState<string | null>(null);
  const [insuranceName, setInsuranceName] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const cancelled = new URLSearchParams(window.location.search).get("cancelled");

  useEffect(() => {
    if (!orgSlug) return;
    if (cancelled) setStep("type");
    fetch(`/api/public/orgs/${orgSlug}/register-info`)
      .then(r => r.json())
      .then((data: OrgInfo & { error?: string }) => {
        if (data.error) { setOrgError(data.error); return; }
        setOrgInfo(data);
      })
      .catch(() => setOrgError("Could not load organization info."))
      .finally(() => setLoadingOrg(false));
  }, [orgSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) { setFormError("Name is required."); return; }
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { setFormError("A valid email is required."); return; }
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
          servSafeUrl: servSafeUrl ?? undefined,
          insuranceCertUrl: insuranceCertUrl ?? undefined,
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

  const fee = orgInfo! && (regType === "sponsor" ? orgInfo.sponsorFeeCents : orgInfo.vendorFeeCents);

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
            <p className="text-center text-slate-300 text-sm mb-6">Choose your registration type to get started.</p>

            <button
              onClick={() => { setRegType("sponsor"); setStep("form"); }}
              className="w-full p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-left flex items-start gap-4 group"
            >
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Star className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">Become a Sponsor</p>
                  <span className="text-sm font-semibold text-amber-400">{formatDollars(orgInfo!.sponsorFeeCents)}</span>
                </div>
                <p className="text-slate-400 text-sm mt-1">Featured logo, website visibility, and community recognition.</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors self-center flex-shrink-0" />
            </button>

            <button
              onClick={() => { setRegType("vendor"); setStep("form"); }}
              className="w-full p-5 rounded-xl border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 transition-colors text-left flex items-start gap-4 group"
            >
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">Register as a Vendor</p>
                  <span className="text-sm font-semibold text-blue-400">{formatDollars(orgInfo!.vendorFeeCents)}</span>
                </div>
                <p className="text-slate-400 text-sm mt-1">Sell at our events and connect directly with the community.</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors self-center flex-shrink-0" />
            </button>
          </div>
        )}

        {/* Step: Form */}
        {step === "form" && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center gap-2 mb-4">
              <button type="button" onClick={() => setStep("type")} className="text-slate-400 hover:text-white text-sm">← Back</button>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1.5">
                {regType === "sponsor" ? <Star className="w-4 h-4 text-amber-400" /> : <ShoppingBag className="w-4 h-4 text-blue-400" />}
                <span className="text-sm font-medium text-white capitalize">{regType} Registration</span>
                {fee != null && <span className="text-sm text-slate-500">— {formatDollars(fee)}</span>}
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
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" required />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">Contact Email <span className="text-red-400">*</span></Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" required />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">Phone</Label>
                <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="text-slate-300">Website</Label>
                <Input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourcompany.com"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="text-slate-300">Logo URL</Label>
                <Input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://yourcompany.com/logo.png"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
                <p className="text-[11px] text-slate-500">Link to your logo (PNG, JPG, or SVG)</p>
              </div>

              {regType === "sponsor" && (
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-slate-300">Sponsorship Tier <span className="text-red-400">*</span></Label>
                  <Select value={tier} onValueChange={setTier}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
                      {SPONSOR_TIERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
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
                      {VENDOR_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="col-span-2 space-y-1.5">
                <Label className="text-slate-300">Tell us about yourself</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder={regType === "sponsor" ? "What does your company do? Why sponsor us?" : "What products or services do you offer?"}
                  rows={3} className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 resize-none" />
              </div>

              {/* Compliance documents — vendors only */}
              {regType === "vendor" && (
                <>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/8">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <h3 className="text-sm font-medium text-slate-300">Compliance Documents</h3>
                      <span className="text-xs text-slate-500 ml-1">(optional — you may be asked to provide these before approval)</span>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <DocUploadField
                      label="ServSafe Certificate"
                      hint="Upload your ServSafe food handler certification (PDF or image)"
                      onUploaded={(path, fileName) => { setServSafeUrl(path); setServSafeName(fileName); }}
                    />
                  </div>

                  <div className="col-span-2">
                    <DocUploadField
                      label="Certificate of Insurance"
                      hint="Upload your current Certificate of Insurance (COI) showing general liability coverage"
                      onUploaded={(path, fileName) => { setInsuranceCertUrl(path); setInsuranceName(fileName); }}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="pt-2 space-y-3">
              {fee != null && fee > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                  <span className="text-sm text-slate-300">Registration fee</span>
                  <span className="text-sm font-semibold text-white">{formatDollars(fee)}</span>
                </div>
              )}
              <p className="text-xs text-slate-500 text-center">
                Your application will be reviewed by {orgInfo!.orgName} before approval.
                {fee != null && fee > 0 && " Payment is required to submit."}
              </p>
              <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold h-11">
                {fee != null && fee > 0 ? "Pay & Submit Application →" : "Submit Application →"}
              </Button>
            </div>
          </form>
        )}

        {step === "submitting" && (
          <div className="text-center space-y-4 py-12">
            <Loader2 className="w-10 h-10 text-amber-400 animate-spin mx-auto" />
            <p className="text-white font-semibold">Submitting your application…</p>
            <p className="text-slate-400 text-sm">Please don't close this window.</p>
          </div>
        )}

        {step === "free_success" && (
          <div className="text-center space-y-5 py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Application Submitted!</h2>
              <p className="text-slate-400 mt-2 text-sm">
                Your application has been received by <span className="text-white">{orgInfo!.orgName}</span>.
                They'll review it and be in touch soon.
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
