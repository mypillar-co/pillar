import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Building2, Loader2, Sparkles, RotateCcw, TriangleAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useGetOrganization } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resetTour } from "@/components/GuidedTour";

const ORG_TYPES = [
  { value: "lodge", label: "Masonic Lodge" },
  { value: "rotary", label: "Rotary Club" },
  { value: "vfw", label: "VFW Post" },
  { value: "hoa", label: "Homeowners Association (HOA)" },
  { value: "pta", label: "PTA / Parent Organization" },
  { value: "nonprofit", label: "Nonprofit Organization" },
  { value: "chamber", label: "Chamber of Commerce" },
  { value: "downtown_assoc", label: "Downtown Association" },
  { value: "festival_committee", label: "Festival Committee" },
  { value: "civic_org", label: "Civic Organization" },
  { value: "other", label: "Other" },
];

export default function DashboardSettings() {
  const { data: orgData } = useGetOrganization();
  const org = orgData?.organization;
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  React.useEffect(() => {
    if (org) {
      setName(org.name ?? "");
      setOrgType(org.type ?? "");
    }
  }, [org]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/organizations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, type: orgType }),
      });
      if (!res.ok) throw new Error("Failed to update organization");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["getOrganization"] });
      toast.success("Organization updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/organizations`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to delete organization");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Organization deleted. Redirecting…");
      setTimeout(() => navigate("/"), 1500);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your organization settings</p>
      </div>

      <Card className="border-white/10 bg-card/60">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <CardTitle className="text-base text-white">Organization Profile</CardTitle>
          </div>
          <CardDescription className="text-slate-400 text-sm">
            Update your organization's name and type
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-slate-300">Organization Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
              placeholder="Your organization name"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">Organization Type</Label>
            <Select value={orgType} onValueChange={setOrgType}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent className="bg-[hsl(224,30%,16%)] border-white/10">
                {ORG_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-white">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name}
            className="mt-2"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Guided Tour */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <CardTitle className="text-base text-white">Guided Tour</CardTitle>
          </div>
          <CardDescription className="text-slate-400 text-sm">
            Replay the onboarding walkthrough that highlights each feature
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
            onClick={() => {
              resetTour();
              window.location.href = "/dashboard";
            }}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-2" />
            Restart Tour
          </Button>
        </CardContent>
      </Card>

      {/* Account info */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-white">Account</CardTitle>
          <CardDescription className="text-slate-400 text-sm">
            Your Replit account is connected to this organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Authentication is managed by Replit. To change your account details, visit your Replit profile settings.
          </p>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-500/20 bg-red-950/10">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TriangleAlert className="w-4 h-4 text-red-400" />
            <CardTitle className="text-base text-red-400">Danger Zone</CardTitle>
          </div>
          <CardDescription className="text-slate-400 text-sm">
            Permanently delete your organization and all associated data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
            onClick={() => {
              setDeleteConfirmText("");
              setShowDeleteDialog(true);
            }}
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Delete Organization
          </Button>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-[hsl(224,30%,12%)] border-white/10 max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <TriangleAlert className="w-4 h-4 text-red-400" />
              </div>
              <DialogTitle className="text-white text-lg">Delete organization</DialogTitle>
            </div>
            <DialogDescription className="text-slate-400 text-sm leading-relaxed">
              This will permanently delete <span className="text-white font-medium">{org?.name}</span> and all of its data — events, contacts, social accounts, site content, payments, and more. This action <span className="text-red-400 font-medium">cannot be undone</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <Label className="text-slate-300 text-sm">
              Type <span className="font-mono text-white bg-white/8 px-1.5 py-0.5 rounded text-xs">{org?.name}</span> to confirm
            </Label>
            <Input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={org?.name ?? ""}
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
              autoComplete="off"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(false)}
              className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteConfirmText !== org?.name || deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white border-0"
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Deleting…</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5 mr-2" />Delete permanently</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
