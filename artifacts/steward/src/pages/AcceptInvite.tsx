import React, { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { Loader2, CheckCircle2, XCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/api";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type InviteInfo = {
  email: string;
  orgName: string;
  orgType: string | null;
  role: string;
};

export default function AcceptInvite() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE}/api/org-members/accept/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setInviteInfo(data);
        }
      })
      .catch(() => setError("Failed to load invite details."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!user) {
      sessionStorage.setItem("pillar_post_login_redirect", `/accept-invite/${token}`);
      navigate("/login");
      return;
    }
    setAccepting(true);
    try {
      const res = await fetch(`${BASE}/api/org-members/accept/${token}`, {
        method: "POST",
        credentials: "include",
        headers: { ...csrfHeaders("POST") },
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to accept invite.");
      } else {
        setAccepted(true);
        toast.success("You've joined the organization!");
        setTimeout(() => navigate("/dashboard"), 2000);
      }
    } catch {
      setError("Failed to accept invite. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(222,47%,8%)]">
        <Loader2 className="h-8 w-8 animate-spin text-[#c9a227]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(222,47%,8%)] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-2xl font-bold text-white mb-2">
            <span className="text-[#c9a227]">Pillar</span>
          </div>
        </div>

        <div className="bg-[hsl(224,30%,14%)] border border-[hsl(222,25%,20%)] rounded-xl p-8">
          {error ? (
            <div className="text-center">
              <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Invite not valid</h2>
              <p className="text-gray-400 mb-6">{error}</p>
              <Button onClick={() => navigate("/login")} variant="outline">
                Go to sign in
              </Button>
            </div>
          ) : accepted ? (
            <div className="text-center">
              <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Welcome aboard!</h2>
              <p className="text-gray-400">Redirecting you to the dashboard...</p>
            </div>
          ) : inviteInfo ? (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-[#c9a227]/20 flex items-center justify-center">
                  <Users className="h-5 w-5 text-[#c9a227]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">You've been invited</h2>
                  <p className="text-sm text-gray-400">to manage an organization on Pillar</p>
                </div>
              </div>

              <div className="bg-[hsl(222,47%,10%)] rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-400 mb-1">Organization</p>
                <p className="text-white font-semibold">{inviteInfo.orgName}</p>
                <p className="text-sm text-gray-400 mt-3 mb-1">Your role</p>
                <p className="text-white capitalize">{inviteInfo.role}</p>
                <p className="text-sm text-gray-400 mt-3 mb-1">Invited email</p>
                <p className="text-white">{inviteInfo.email}</p>
              </div>

              {user ? (
                <>
                  <p className="text-sm text-gray-400 mb-4">
                    Signed in as <span className="text-white">{user.email ?? user.firstName ?? "you"}</span>
                  </p>
                  <Button
                    onClick={handleAccept}
                    disabled={accepting}
                    className="w-full bg-[#c9a227] hover:bg-[#b8911f] text-black font-semibold"
                  >
                    {accepting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Accept invitation
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-400 mb-4">
                    Sign in to accept your invitation.
                  </p>
                  <Button
                    onClick={handleAccept}
                    className="w-full bg-[#c9a227] hover:bg-[#b8911f] text-black font-semibold"
                  >
                    Sign in to accept
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
