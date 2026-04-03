import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Users, Star, ShoppingBag, Clock, CheckCircle2, XCircle, AlertCircle,
  ExternalLink, RefreshCw, DollarSign, FileText, Download, ShieldCheck,
  MapPin, Zap, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Registration = {
  id: string;
  orgId: string;
  type: "vendor" | "sponsor";
  status: "pending_payment" | "pending_approval" | "approved" | "rejected";
  name: string;
  contactName?: string | null;
  email: string;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  products?: string | null;
  needsElectricity?: boolean | null;
  eventId?: string | null;
  tier?: string | null;
  vendorType?: string | null;
  feeAmount?: number | null;
  stripePaymentStatus?: string | null;
  paidAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  servSafeUrl?: string | null;
  insuranceCertUrl?: string | null;
  createdAt: string;
};

type FeeConfig = {
  vendorFeeCents: number;
  sponsorFeeCents: number;
};

// ─── Document download row ────────────────────────────────────────────────────
function DocDownloadRow({ label, objectPath }: { label: string; objectPath: string }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // objectPath is like /objects/uploads/<uuid>
      // Serve via the authenticated admin endpoint (falls through to the standard storage endpoint)
      const path = objectPath.startsWith("/") ? objectPath : `/${objectPath}`;
      const res = await fetch(`/api/storage${path}`, { credentials: "include" });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const ext = blob.type === "application/pdf" ? ".pdf" : blob.type.split("/")[1] ? `.${blob.type.split("/")[1]}` : "";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${label.replace(/\s+/g, "_")}${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — user can try again
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
      <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
      <p className="text-sm text-slate-300 flex-1">{label}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={downloading}
        className="h-7 px-2 border-white/10 text-slate-300 hover:text-white hover:bg-white/10"
      >
        <Download className="w-3.5 h-3.5 mr-1" />
        {downloading ? "…" : "Download"}
      </Button>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Awaiting Payment",
  pending_approval: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<string, string> = {
  pending_payment: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  pending_approval: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
};

function formatFee(cents?: number | null) {
  if (!cents || cents === 0) return "Free";
  return `$${(cents / 100).toFixed(0)}`;
}

export default function Registrations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [detailReg, setDetailReg] = useState<Registration | null>(null);
  const [rejectDialogReg, setRejectDialogReg] = useState<Registration | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  const [vendorFeeInput, setVendorFeeInput] = useState("");
  const [sponsorFeeInput, setSponsorFeeInput] = useState("");

  // Load registrations
  const { data: registrations = [], isLoading, refetch } = useQuery<Registration[]>({
    queryKey: ["registrations", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all"
        ? "/api/registrations"
        : `/api/registrations?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load registrations");
      return res.json();
    },
  });

  // Load org info for fee config
  const { data: orgInfo } = useQuery<{ vendorFeeCents: number; sponsorFeeCents: number }>({
    queryKey: ["org-info"],
    queryFn: async () => {
      const res = await fetch("/api/organizations/me", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load org");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/registrations/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Approval failed"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Approved!", description: "The registration has been approved and added to your records." });
      queryClient.invalidateQueries({ queryKey: ["registrations"] });
      setDetailReg(null);
    },
    onError: (err: Error) => {
      toast({ title: "Approval failed", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const res = await fetch(`/api/registrations/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Rejection failed"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rejected", description: "The registration has been rejected." });
      queryClient.invalidateQueries({ queryKey: ["registrations"] });
      setRejectDialogReg(null);
      setDetailReg(null);
      setRejectionReason("");
    },
    onError: (err: Error) => {
      toast({ title: "Rejection failed", description: err.message, variant: "destructive" });
    },
  });

  const feeMutation = useMutation({
    mutationFn: async ({ vendorFeeCents, sponsorFeeCents }: { vendorFeeCents: number; sponsorFeeCents: number }) => {
      const res = await fetch("/api/registrations/fee-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ vendorFeeCents, sponsorFeeCents }),
      });
      if (!res.ok) throw new Error("Failed to save fees");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Fees updated", description: "Registration fees have been saved." });
      queryClient.invalidateQueries({ queryKey: ["org-info"] });
      setFeeDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to save fees", variant: "destructive" });
    },
  });

  const openFeeDialog = () => {
    setVendorFeeInput(orgInfo ? String(orgInfo.vendorFeeCents / 100) : "0");
    setSponsorFeeInput(orgInfo ? String(orgInfo.sponsorFeeCents / 100) : "0");
    setFeeDialogOpen(true);
  };

  const handleSaveFees = () => {
    const vendor = Math.round((parseFloat(vendorFeeInput) || 0) * 100);
    const sponsor = Math.round((parseFloat(sponsorFeeInput) || 0) * 100);
    feeMutation.mutate({ vendorFeeCents: vendor, sponsorFeeCents: sponsor });
  };

  const counts = {
    all: registrations.length,
    pending_payment: registrations.filter(r => r.status === "pending_payment").length,
    pending_approval: registrations.filter(r => r.status === "pending_approval").length,
    approved: registrations.filter(r => r.status === "approved").length,
    rejected: registrations.filter(r => r.status === "rejected").length,
  };

  const filtered = statusFilter === "all" ? registrations : registrations.filter(r => r.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Registrations</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage vendor and sponsor applications</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={openFeeDialog}
            className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
          >
            <DollarSign className="w-4 h-4 mr-1.5" />
            Set Fees
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: "pending_approval", label: "Pending Review", icon: Clock, color: "text-blue-400" },
          { key: "approved", label: "Approved", icon: CheckCircle2, color: "text-emerald-400" },
          { key: "rejected", label: "Rejected", icon: XCircle, color: "text-red-400" },
          { key: "pending_payment", label: "Awaiting Payment", icon: DollarSign, color: "text-yellow-400" },
        ].map(({ key, label, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
            className={`p-4 rounded-xl border text-left transition-colors ${
              statusFilter === key
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <Icon className={`w-4 h-4 ${color} mb-2`} />
            <p className="text-xl font-bold text-white">{counts[key as keyof typeof counts]}</p>
            <p className="text-xs text-slate-400">{label}</p>
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        {["all", "pending_approval", "pending_payment", "approved", "rejected"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-amber-500 text-slate-950"
                : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            {s === "all" ? `All (${counts.all})` : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Users className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-slate-400 font-medium">No registrations yet</p>
          <p className="text-slate-600 text-sm">Applications will appear here once submitted.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(reg => (
            <button
              key={reg.id}
              onClick={() => setDetailReg(reg)}
              className="w-full p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left flex items-center gap-4"
            >
              {reg.logoUrl ? (
                <img src={reg.logoUrl} alt={reg.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  {reg.type === "sponsor"
                    ? <Star className="w-5 h-5 text-amber-400" />
                    : <ShoppingBag className="w-5 h-5 text-blue-400" />}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-white truncate">{reg.name}</p>
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[reg.status]}`}>
                    {STATUS_LABELS[reg.status]}
                  </Badge>
                  <Badge variant="outline" className={`text-xs capitalize ${
                    reg.type === "sponsor"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  }`}>
                    {reg.type}
                    {reg.tier ? ` · ${reg.tier}` : ""}
                    {reg.vendorType ? ` · ${reg.vendorType}` : ""}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-sm text-slate-400 truncate">{reg.email}</p>
                  {reg.feeAmount != null && (
                    <span className="text-xs text-slate-500 flex-shrink-0">{formatFee(reg.feeAmount)}</span>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500 flex-shrink-0 hidden sm:block">
                {format(new Date(reg.createdAt), "MMM d, yyyy")}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Detail modal */}
      <Dialog open={!!detailReg} onOpenChange={(o) => { if (!o) setDetailReg(null); }}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-lg">
          {detailReg && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {detailReg.logoUrl && (
                    <img src={detailReg.logoUrl} alt={detailReg.name} className="w-8 h-8 rounded object-cover" />
                  )}
                  {detailReg.name}
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  Registration details
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Status */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`${STATUS_COLORS[detailReg.status]}`}>
                    {STATUS_LABELS[detailReg.status]}
                  </Badge>
                  <Badge variant="outline" className={`capitalize ${
                    detailReg.type === "sponsor"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  }`}>
                    {detailReg.type}
                    {detailReg.tier ? ` · ${detailReg.tier}` : ""}
                    {detailReg.vendorType ? ` · ${detailReg.vendorType}` : ""}
                  </Badge>
                  {detailReg.feeAmount != null && (
                    <span className="text-xs text-slate-400 ml-auto">{formatFee(detailReg.feeAmount)} fee</span>
                  )}
                </div>

                {/* Contact info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {detailReg.contactName && (
                    <div>
                      <p className="text-slate-500 text-xs mb-0.5">Contact</p>
                      <p className="text-white">{detailReg.contactName}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">Email</p>
                    <p className="text-white">{detailReg.email}</p>
                  </div>
                  {detailReg.phone && (
                    <div>
                      <p className="text-slate-500 text-xs mb-0.5">Phone</p>
                      <p className="text-white">{detailReg.phone}</p>
                    </div>
                  )}
                  {detailReg.website && (
                    <div className="col-span-2">
                      <p className="text-slate-500 text-xs mb-0.5">Website</p>
                      <a href={detailReg.website} target="_blank" rel="noopener noreferrer"
                        className="text-amber-400 hover:text-amber-300 flex items-center gap-1">
                        {detailReg.website}<ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Address */}
                {(detailReg.address || detailReg.city) && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-white/4 border border-white/8 text-sm">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div className="text-slate-300">
                      {detailReg.address && <p>{detailReg.address}</p>}
                      <p>{[detailReg.city, detailReg.state, detailReg.zip].filter(Boolean).join(", ")}</p>
                    </div>
                  </div>
                )}

                {/* Products / offering */}
                {detailReg.products && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-slate-400" />
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Products / Offering</p>
                    </div>
                    <p className="text-sm text-slate-300 bg-white/4 border border-white/8 rounded-lg p-3">{detailReg.products}</p>
                  </div>
                )}

                {/* Notes */}
                {detailReg.description && (
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">Notes</p>
                    <p className="text-slate-300 text-sm">{detailReg.description}</p>
                  </div>
                )}

                {/* Electricity + dates */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {detailReg.needsElectricity && (
                    <div className="col-span-2 flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
                      <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <p className="text-xs text-amber-300 font-medium">Requests electrical access</p>
                    </div>
                  )}
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">Submitted</p>
                    <p className="text-white">{format(new Date(detailReg.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                  </div>
                  {detailReg.paidAt && (
                    <div>
                      <p className="text-slate-500 text-xs mb-0.5">Paid</p>
                      <p className="text-emerald-400">{format(new Date(detailReg.paidAt), "MMM d, yyyy")}</p>
                    </div>
                  )}
                  {detailReg.rejectionReason && (
                    <div className="col-span-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <p className="text-xs text-red-400 font-medium mb-0.5">Rejection reason</p>
                      <p className="text-sm text-red-300">{detailReg.rejectionReason}</p>
                    </div>
                  )}
                </div>

                {/* Compliance checklist */}
                {detailReg.type === "vendor" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 pb-1 border-b border-white/8">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Compliance</p>
                    </div>

                    {/* COI — required for all vendors */}
                    {detailReg.insuranceCertUrl ? (
                      <DocDownloadRow label="Certificate of Insurance" objectPath={detailReg.insuranceCertUrl} />
                    ) : (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/8 border border-red-500/20">
                        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-300 flex-1">Certificate of Insurance — not submitted</p>
                      </div>
                    )}

                    {/* ServSafe — only for food vendors */}
                    {detailReg.vendorType === "food" && (
                      detailReg.servSafeUrl ? (
                        <DocDownloadRow label="ServSafe Certificate" objectPath={detailReg.servSafeUrl} />
                      ) : (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/8 border border-red-500/20">
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                          <p className="text-sm text-red-300 flex-1">ServSafe Certificate — not submitted (required for food vendors)</p>
                        </div>
                      )
                    )}

                    {/* Non-food: ServSafe not required */}
                    {detailReg.vendorType && detailReg.vendorType !== "food" && !detailReg.servSafeUrl && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/4 border border-white/8">
                        <CheckCircle2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <p className="text-sm text-slate-500 flex-1">ServSafe not required for this vendor type</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {detailReg.status === "pending_approval" && (
                <DialogFooter className="gap-2 flex-row">
                  <Button
                    variant="outline"
                    onClick={() => { setRejectDialogReg(detailReg); setDetailReg(null); }}
                    className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
                  >
                    <XCircle className="w-4 h-4 mr-1.5" />
                    Reject
                  </Button>
                  <Button
                    onClick={() => approveMutation.mutate(detailReg.id)}
                    disabled={approveMutation.isPending}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    {approveMutation.isPending ? "Approving…" : "Approve"}
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectDialogReg} onOpenChange={(o) => { if (!o) { setRejectDialogReg(null); setRejectionReason(""); } }}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Registration</DialogTitle>
            <DialogDescription className="text-slate-400">
              Optionally provide a reason for rejecting <span className="text-white">{rejectDialogReg?.name}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Reason (optional)</Label>
              <Textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="e.g. We're at capacity for this category…"
                rows={3}
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-row">
            <Button
              variant="outline"
              onClick={() => { setRejectDialogReg(null); setRejectionReason(""); }}
              className="flex-1 border-white/10 text-slate-300 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={() => rejectMutation.mutate({ id: rejectDialogReg!.id, reason: rejectionReason })}
              disabled={rejectMutation.isPending}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white"
            >
              {rejectMutation.isPending ? "Rejecting…" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fee config dialog */}
      <Dialog open={feeDialogOpen} onOpenChange={setFeeDialogOpen}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Registration Fees</DialogTitle>
            <DialogDescription className="text-slate-400">
              Set how much vendors and sponsors pay to apply. Set to 0 for free applications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-slate-300 flex items-center gap-2">
                <ShoppingBag className="w-3.5 h-3.5 text-blue-400" />
                Vendor Fee (USD)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={vendorFeeInput}
                  onChange={e => setVendorFeeInput(e.target.value)}
                  className="pl-7 bg-white/5 border-white/10 text-white"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 flex items-center gap-2">
                <Star className="w-3.5 h-3.5 text-amber-400" />
                Sponsor Fee (USD)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={sponsorFeeInput}
                  onChange={e => setSponsorFeeInput(e.target.value)}
                  className="pl-7 bg-white/5 border-white/10 text-white"
                  placeholder="0"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Stripe Connect is required to collect registration fees. If not connected, applications are always free.
            </p>
          </div>
          <DialogFooter className="gap-2 flex-row">
            <Button
              variant="outline"
              onClick={() => setFeeDialogOpen(false)}
              className="flex-1 border-white/10 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveFees}
              disabled={feeMutation.isPending}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
            >
              {feeMutation.isPending ? "Saving…" : "Save Fees"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
