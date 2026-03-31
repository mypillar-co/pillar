import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Shield, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default function Register() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [honeypot, setHoneypot] = useState("");
  const formLoadTime = useState(() => Date.now())[0];
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/auth/google/status`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setGoogleEnabled(!!d.enabled))
      .catch(() => setGoogleEnabled(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.email || !form.password) {
      setError("Email and password are required.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, _gotcha: honeypot, _ft: formLoadTime }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed. Please try again.");
      } else {
        navigate("/onboard");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const signUpWithGoogle = () => {
    window.location.href = `${BASE}/api/auth/google?returnTo=/onboard`;
  };

  return (
    <div className="min-h-screen bg-[hsl(224,40%,8%)] flex flex-col">
      <div className="flex items-center gap-2 p-6">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <Shield className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="text-white font-bold text-lg">Steward</span>
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">Create your account</h1>
            <p className="text-slate-400 text-sm">Get started with your 14-day free trial</p>
          </div>

          <div className="bg-[hsl(224,40%,12%)] border border-white/8 rounded-2xl p-6 space-y-5">
            {googleEnabled && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-white/15 bg-white/5 hover:bg-white/10 text-white gap-2"
                  onClick={signUpWithGoogle}
                >
                  <GoogleIcon />
                  Continue with Google
                </Button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-slate-500">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
              </>
            )}

            <form onSubmit={submit} className="space-y-4">
              {/* Bot honeypot — hidden from humans, filled by bots */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden", opacity: 0 }}>
                <label htmlFor="website">Website</label>
                <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-sm">First name</Label>
                  <Input
                    placeholder="Jane"
                    autoComplete="given-name"
                    value={form.firstName}
                    onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-sm">Last name</Label>
                  <Input
                    placeholder="Smith"
                    autoComplete="family-name"
                    value={form.lastName}
                    onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">Email</Label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">Password <span className="text-slate-500 font-normal">(min. 8 characters)</span></Label>
                <div className="relative">
                  <Input
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 pr-10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create account
              </Button>
            </form>

            <p className="text-center text-xs text-slate-500 leading-relaxed">
              By creating an account you agree to our{" "}
              <Link href="/terms" className="text-slate-400 hover:text-white underline">Terms</Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-slate-400 hover:text-white underline">Privacy Policy</Link>.
            </p>

            <p className="text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:text-primary/80 font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
