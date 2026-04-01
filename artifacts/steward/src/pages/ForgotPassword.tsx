import React, { useState } from "react";
import { Link } from "wouter";
import { Shield, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(224,40%,8%)] flex flex-col">
      <div className="flex items-center gap-2 p-6">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <Shield className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="text-white font-bold text-lg">Pillar</span>
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">Reset your password</h1>
            <p className="text-slate-400 text-sm">
              Enter your email and we'll send you a reset link.
            </p>
          </div>

          <div className="bg-[hsl(224,40%,12%)] border border-white/8 rounded-2xl p-6 space-y-5">
            {sent ? (
              <div className="space-y-4 text-center">
                <div className="flex justify-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  </div>
                </div>
                <div>
                  <p className="text-white font-medium">Check your email</p>
                  <p className="text-slate-400 text-sm mt-1">
                    If an account exists for <span className="text-white">{email}</span>, you'll receive a reset link shortly.
                  </p>
                </div>
                <p className="text-slate-500 text-xs">
                  The link expires in 1 hour. Check your spam folder if you don't see it.
                </p>
                <Link href="/login">
                  <Button variant="outline" className="w-full border-white/10 text-slate-300 hover:text-white hover:bg-white/5">
                    Back to sign in
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-sm">Email address</Label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                    disabled={loading}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Send reset link
                </Button>

                <p className="text-center text-sm text-slate-500">
                  Remember your password?{" "}
                  <Link href="/login" className="text-primary hover:text-primary/80 font-medium">
                    Sign in
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
