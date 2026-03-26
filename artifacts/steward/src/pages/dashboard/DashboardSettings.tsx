import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useGetOrganization } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ORG_TYPES = [
  { value: "chamber", label: "Chamber of Commerce" },
  { value: "downtown_assoc", label: "Downtown Association" },
  { value: "nonprofit", label: "Nonprofit Organization" },
  { value: "lodge", label: "Masonic Lodge" },
  { value: "festival_committee", label: "Festival Committee" },
  { value: "civic_org", label: "Civic Organization" },
  { value: "other", label: "Other" },
];

export default function DashboardSettings() {
  const { data: orgData } = useGetOrganization();
  const org = orgData?.organization;
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState("");

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
    </div>
  );
}
