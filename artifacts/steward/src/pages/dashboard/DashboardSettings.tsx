import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Save,
  Building2,
  Loader2,
  Sparkles,
  RotateCcw,
  TriangleAlert,
  Trash2,
  Mail,
  ArrowRight,
  CheckCircle2,
  Copy,
  RefreshCw,
  X,
  Forward,
  Users,
  UserPlus,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useGetOrganization } from "@workspace/api-client-react";
import { csrfHeaders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resetTour } from "@/components/GuidedTour";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const ORG_TYPES = [
  { value: "lodge", label: "Masonic Lodge" },
  { value: "rotary", label: "Rotary Club" },
  { value: "vfw", label: "VFW Post" },
  { value: "fraternal", label: "Fraternal Organization" },
  { value: "hoa", label: "Homeowners Association (HOA)" },
  { value: "pta", label: "PTA / Parent Organization" },
  { value: "nonprofit", label: "Nonprofit Organization" },
  { value: "chamber", label: "Chamber of Commerce" },
  { value: "downtown_assoc", label: "Downtown Association" },
  { value: "festival_committee", label: "Festival Committee" },
  { value: "civic_org", label: "Civic Organization" },
  { value: "other", label: "Other" },
];

type DnsRecord = {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: number;
  status?: string;
};

type EmailSettings = {
  senderEmail: string | null;
  senderName: string | null;
  senderDomainVerified: boolean;
  resendDomainId: string | null;
  emailForwardAlias: string | null;
  emailForwardDestination: string | null;
  emailForwardActive: boolean;
  domain: {
    id: string;
    domain: string;
    status: string;
    isPillarDomain: boolean;
  } | null;
  forwards: { alias: string; destination: string }[];
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="ml-2 text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
      title="Copy"
    >
      {copied ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

function DnsRecordRow({ record }: { record: DnsRecord }) {
  return (
    <div className="grid grid-cols-[80px_1fr_1fr] gap-2 text-xs py-2 border-b border-white/5 last:border-0 items-start">
      <span className="font-mono text-amber-400 font-medium pt-0.5">
        {record.type}
      </span>
      <div className="font-mono text-slate-300 break-all">
        {record.name || "@"}
      </div>
      <div className="flex items-start gap-1">
        <span className="font-mono text-slate-400 break-all leading-relaxed">
          {record.value}
        </span>
        <CopyButton value={record.value} />
      </div>
    </div>
  );
}

type OrgMember = {
  id: string;
  email: string | null;
  name?: string | null;
  role: string;
  status: "active" | "pending";
  userId: string | null;
  invitedAt?: string;
  acceptedAt?: string | null;
};

function OrgMembersCard() {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [showInviteInput, setShowInviteInput] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["org-members"],
    queryFn: () =>
      fetch(`${BASE}/api/org-members`, { credentials: "include" }).then((r) =>
        r.json(),
      ) as Promise<{ owner: OrgMember | null; members: OrgMember[] }>,
  });

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch(`${BASE}/api/org-members/invite`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrfHeaders("POST") },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        inviteUrl?: string;
        email?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to send invite");
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
      setInviteEmail("");
      setShowInviteInput(false);
      if (data.inviteUrl) {
        navigator.clipboard.writeText(data.inviteUrl ?? "").catch(() => {});
        toast.success(
          `Invite sent to ${data.email}. Link copied to clipboard.`,
        );
      } else {
        toast.success(`Invite sent to ${data.email}!`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/org-members/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { ...csrfHeaders("DELETE") },
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to remove member");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
      toast.success("Member removed.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const allMembers = [
    ...(data?.owner ? [data.owner] : []),
    ...(data?.members ?? []),
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#c9a227]" />
            <CardTitle className="text-base">Team Members</CardTitle>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5 gap-1.5"
            onClick={() => setShowInviteInput((v) => !v)}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invite
          </Button>
        </div>
        <CardDescription className="text-slate-400 text-sm">
          Invite admins to help manage your organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {showInviteInput && (
          <div className="flex gap-2 p-3 bg-white/5 rounded-lg border border-white/10">
            <Input
              type="email"
              placeholder="admin@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && inviteEmail)
                  inviteMutation.mutate(inviteEmail);
              }}
              className="bg-transparent border-white/10 text-white placeholder:text-slate-600 h-8 text-sm"
              autoFocus
            />
            <Button
              size="sm"
              onClick={() => inviteEmail && inviteMutation.mutate(inviteEmail)}
              disabled={!inviteEmail || inviteMutation.isPending}
              className="bg-[#c9a227] hover:bg-[#b8911f] text-black shrink-0 h-8"
            >
              {inviteMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Send"
              )}
            </Button>
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          </div>
        ) : allMembers.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-2">
            No team members yet.
          </p>
        ) : (
          <div className="space-y-2">
            {allMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-white/3 border border-white/5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-slate-300">
                      {(member.email ?? member.name ?? "?")[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">
                      {member.email ?? member.name ?? "Unknown"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge
                        variant="outline"
                        className="text-xs px-1.5 py-0 capitalize border-white/10 text-slate-400"
                      >
                        {member.role}
                      </Badge>
                      {member.status === "pending" && (
                        <Badge
                          variant="outline"
                          className="text-xs px-1.5 py-0 border-yellow-500/30 text-yellow-400"
                        >
                          Pending
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {member.role !== "owner" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-slate-500 hover:text-red-400 hover:bg-red-500/10 shrink-0"
                    onClick={() => removeMutation.mutate(member.id)}
                    disabled={removeMutation.isPending}
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardSettings() {
  const { data: orgData } = useGetOrganization();
  const org = orgData?.organization;
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState("");
  const [slug, setSlug] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const [forwardAlias, setForwardAlias] = useState("");
  const [forwardDest, setForwardDest] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderNameState] = useState("");
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);

  React.useEffect(() => {
    if (org) {
      setName(org.name ?? "");
      setOrgType(org.type ?? "");
      setSlug(org.slug ?? "");
      setSenderNameState(org.name ?? "");
    }
  }, [org]);

  const { data: emailSettings, refetch: refetchEmail } =
    useQuery<EmailSettings>({
      queryKey: ["emailSettings"],
      queryFn: async () => {
        const res = await fetch(`${BASE}/api/email-settings`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load email settings");
        return res.json();
      },
    });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/organizations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, type: orgType, slug }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok)
        throw new Error(data.error ?? "Failed to update organization");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["getOrganization"] });
      toast.success("Organization updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/organizations`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Failed to delete organization",
        );
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Organization deleted. Redirecting…");
      setTimeout(() => navigate("/"), 1500);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const forwardMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/email-settings/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ alias: forwardAlias, destination: forwardDest }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to set up forwarding");
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message ?? "Email forwarding set up");
      refetchEmail();
      setForwardAlias("");
      setForwardDest("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeForwardMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/email-settings/forward`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove forward");
    },
    onSuccess: () => {
      toast.success("Email forward removed");
      refetchEmail();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const senderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/email-settings/sender`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ senderEmail, senderName }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        dnsRecords?: DnsRecord[];
        message?: string;
      };
      if (!res.ok)
        throw new Error(data.error ?? "Failed to register sender domain");
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message ?? "Sender domain registered");
      if (data.dnsRecords) setDnsRecords(data.dnsRecords as DnsRecord[]);
      refetchEmail();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/email-settings/sender/verify`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as {
        verified?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      return data;
    },
    onSuccess: (data) => {
      if (data.verified) toast.success(data.message ?? "Domain verified!");
      else
        toast.info(
          data.message ?? "Not verified yet — DNS may still be propagating.",
        );
      refetchEmail();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loadDnsRecordsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/email-settings/sender/records`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        records?: DnsRecord[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load DNS records");
      return data;
    },
    onSuccess: (data) => {
      if (data.records) setDnsRecords(data.records as DnsRecord[]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const domain = emailSettings?.domain;
  const isPillarDomain = domain?.isPillarDomain ?? false;

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your organization settings
        </p>
      </div>

      {/* Organization Profile */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <CardTitle className="text-base text-white">
              Organization Profile
            </CardTitle>
          </div>
          <CardDescription className="text-slate-400 text-sm">
            Update your organization's name, type, and site URL
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-slate-300">Organization Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
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
                {ORG_TYPES.map((t) => (
                  <SelectItem
                    key={t.value}
                    value={t.value}
                    className="text-white"
                  >
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">Site URL</Label>
            <div className="flex items-center">
              <Input
                value={slug}
                onChange={(e) =>
                  setSlug(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  )
                }
                className="bg-white/5 border-white/10 text-white rounded-r-none"
                placeholder="your-org-name"
                maxLength={50}
              />
              <span className="bg-white/5 border border-l-0 border-white/10 text-slate-500 text-xs px-3 h-10 flex items-center rounded-r-md whitespace-nowrap">
                .mypillar.co
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Your site will be live at{" "}
              <span className="font-mono text-slate-400">
                {slug || "your-org"}.mypillar.co
              </span>
            </p>
          </div>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name}
            className="mt-2"
          >
            {mutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Email Settings */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            <CardTitle className="text-base text-white">
              Email Settings
            </CardTitle>
          </div>
          <CardDescription className="text-slate-400 text-sm">
            Set up email forwarding and a branded sending address for your
            domain
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Forwarding */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Forward className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-sm font-medium text-white">Email Forwarding</p>
              {emailSettings?.emailForwardActive && (
                <Badge
                  variant="outline"
                  className="border-green-500/30 text-green-400 text-xs"
                >
                  Active
                </Badge>
              )}
            </div>

            {!domain && (
              <p className="text-xs text-slate-500 bg-white/3 border border-white/8 rounded-lg px-3 py-2">
                Email forwarding requires a domain registered through Pillar.
                Set up your domain first in the{" "}
                <strong className="text-slate-400">Domains</strong> section.
              </p>
            )}

            {domain && !isPillarDomain && (
              <p className="text-xs text-slate-500 bg-white/3 border border-white/8 rounded-lg px-3 py-2">
                Automatic email forwarding is only available for domains
                registered through Pillar. For{" "}
                <strong className="text-slate-400">{domain.domain}</strong>, set
                up forwarding through your registrar.
              </p>
            )}

            {domain && isPillarDomain && emailSettings?.emailForwardActive && (
              <div className="bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-3 space-y-1">
                <p className="text-xs text-green-400 font-medium">
                  Active forward
                </p>
                <p className="text-sm text-white font-mono">
                  {emailSettings.emailForwardAlias}@{domain.domain}
                  <span className="text-slate-500 mx-2">→</span>
                  {emailSettings.emailForwardDestination}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2 mt-1"
                  onClick={() => removeForwardMutation.mutate()}
                  disabled={removeForwardMutation.isPending}
                >
                  {removeForwardMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <X className="w-3 h-3 mr-1" />
                  )}
                  Remove forward
                </Button>
              </div>
            )}

            {domain && isPillarDomain && !emailSettings?.emailForwardActive && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Route email from your domain to any inbox. Example:{" "}
                  <span className="font-mono text-slate-400">
                    contactus@{domain.domain}
                  </span>{" "}
                  → your Gmail.
                </p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-slate-400 text-xs">
                      Alias (local part)
                    </Label>
                    <div className="flex items-center">
                      <Input
                        value={forwardAlias}
                        onChange={(e) =>
                          setForwardAlias(e.target.value.toLowerCase())
                        }
                        placeholder="contactus"
                        className="bg-white/5 border-white/10 text-white text-sm rounded-r-none"
                      />
                      <span className="bg-white/5 border border-l-0 border-white/10 text-slate-500 text-xs px-2 h-10 flex items-center rounded-r-md whitespace-nowrap">
                        @{domain.domain}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-600 mb-2.5 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-slate-400 text-xs">
                      Forwards to
                    </Label>
                    <Input
                      value={forwardDest}
                      onChange={(e) => setForwardDest(e.target.value)}
                      placeholder="yourname@gmail.com"
                      className="bg-white/5 border-white/10 text-white text-sm"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => forwardMutation.mutate()}
                  disabled={
                    forwardMutation.isPending || !forwardAlias || !forwardDest
                  }
                  className="bg-primary/90 hover:bg-primary"
                >
                  {forwardMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Forward className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Set up forwarding
                </Button>
              </div>
            )}
          </div>

          <div className="border-t border-white/8" />

          {/* Branded Sender */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-sm font-medium text-white">
                Branded Sending Address
              </p>
              {emailSettings?.senderDomainVerified && (
                <Badge
                  variant="outline"
                  className="border-green-500/30 text-green-400 text-xs"
                >
                  Verified
                </Badge>
              )}
              {emailSettings?.senderEmail &&
                !emailSettings.senderDomainVerified && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 text-amber-400 text-xs"
                  >
                    Pending DNS
                  </Badge>
                )}
            </div>
            <p className="text-xs text-slate-500">
              Send Pillar emails (events, newsletters, board approvals) from
              your own domain instead of hello@mypillar.co.
            </p>

            {!emailSettings?.senderEmail ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-slate-400 text-xs">
                      Sender name
                    </Label>
                    <Input
                      value={senderName}
                      onChange={(e) => setSenderNameState(e.target.value)}
                      placeholder={org?.name ?? "My Organization"}
                      className="bg-white/5 border-white/10 text-white text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-400 text-xs">
                      Sender email
                    </Label>
                    <Input
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      placeholder="hello@myorg.com"
                      className="bg-white/5 border-white/10 text-white text-sm"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => senderMutation.mutate()}
                  disabled={senderMutation.isPending || !senderEmail}
                  className="bg-primary/90 hover:bg-primary"
                >
                  {senderMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Mail className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Register sender domain
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-white/3 border border-white/8 rounded-lg px-3 py-2.5">
                  <div>
                    <p className="text-sm text-white font-medium">
                      {emailSettings.senderEmail}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {emailSettings.senderDomainVerified
                        ? "Verified — sending from this address"
                        : "Add the DNS records below, then verify"}
                    </p>
                  </div>
                  {emailSettings.senderDomainVerified ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-slate-400"
                        onClick={() => loadDnsRecordsMutation.mutate()}
                        disabled={loadDnsRecordsMutation.isPending}
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${loadDnsRecordsMutation.isPending ? "animate-spin" : ""}`}
                        />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => verifyMutation.mutate()}
                        disabled={verifyMutation.isPending}
                        className="h-7 text-xs"
                      >
                        {verifyMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : null}
                        Verify
                      </Button>
                    </div>
                  )}
                </div>

                {!emailSettings.senderDomainVerified &&
                  dnsRecords.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-400 font-medium">
                        Add these DNS records to your registrar:
                      </p>
                      <div className="bg-black/20 border border-white/8 rounded-lg px-3 py-1">
                        <div className="grid grid-cols-[80px_1fr_1fr] gap-2 text-xs py-1.5 border-b border-white/5 mb-1">
                          <span className="text-slate-500">Type</span>
                          <span className="text-slate-500">Name</span>
                          <span className="text-slate-500">Value</span>
                        </div>
                        {dnsRecords.map((r, i) => (
                          <DnsRecordRow key={i} record={r} />
                        ))}
                      </div>
                      <p className="text-xs text-slate-600">
                        DNS changes can take up to 48 hours to propagate. Click
                        Verify once you've added the records.
                      </p>
                    </div>
                  )}

                {!emailSettings.senderDomainVerified &&
                  dnsRecords.length === 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10 text-slate-400 h-7 text-xs"
                      onClick={() => loadDnsRecordsMutation.mutate()}
                      disabled={loadDnsRecordsMutation.isPending}
                    >
                      {loadDnsRecordsMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                      ) : (
                        <RefreshCw className="w-3 h-3 mr-1.5" />
                      )}
                      Show DNS records to add
                    </Button>
                  )}
              </div>
            )}
          </div>
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

      {/* Account */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-white">Account</CardTitle>
          <CardDescription className="text-slate-400 text-sm">
            Your account is connected to this organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            To change your account details, update your profile in your account
            settings.
          </p>
        </CardContent>
      </Card>

      {/* Team Members */}
      <OrgMembersCard />

      {/* Danger Zone */}
      <Card className="border-red-500/20 bg-red-950/10">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TriangleAlert className="w-4 h-4 text-red-400" />
            <CardTitle className="text-base text-red-400">
              Danger Zone
            </CardTitle>
          </div>
          <CardDescription className="text-slate-400 text-sm">
            Permanently delete your organization and all associated data. This
            cannot be undone.
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

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-[hsl(224,30%,12%)] border-white/10 max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <TriangleAlert className="w-4 h-4 text-red-400" />
              </div>
              <DialogTitle className="text-white text-lg">
                Delete organization
              </DialogTitle>
            </div>
            <DialogDescription className="text-slate-400 text-sm leading-relaxed">
              This will permanently delete{" "}
              <span className="text-white font-medium">{org?.name}</span> and
              all of its data. This action{" "}
              <span className="text-red-400 font-medium">cannot be undone</span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Label className="text-slate-300 text-sm">
              Type{" "}
              <span className="font-mono text-white bg-white/8 px-1.5 py-0.5 rounded text-xs">
                {org?.name}
              </span>{" "}
              to confirm
            </Label>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
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
              disabled={
                deleteConfirmText !== org?.name || deleteMutation.isPending
              }
              className="bg-red-600 hover:bg-red-700 text-white border-0"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete permanently
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
