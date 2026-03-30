import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  CheckCircle2, Globe, Calendar, Share2, Bot, ArrowRight,
  Shield, Zap, Clock, MessageSquare, ChevronDown,
} from "lucide-react";
import { LoginButton } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/Navbar";

export interface VerticalConfig {
  slug: string;
  orgType: string;
  heroHeadline: string;
  heroSub: string;
  painPoints: string[];
  benefits: { icon: React.ReactNode; title: string; body: string }[];
  ctaLabel: string;
  accentQuote: string;
  orgTypePlural: string;
}

const PRICING = [
  { name: "Starter", price: 29, annual: 24, highlight: false, features: ["AI-built website", "Subdomain hosting", "Chat-based updates", "500MB storage"] },
  { name: "Autopilot", price: 59, annual: 49, highlight: true, features: ["Everything in Starter", "Social media posting", "1 free custom domain", "2GB storage", "Autonomous updates"] },
  { name: "Events", price: 99, annual: 84, highlight: false, features: ["Everything in Autopilot", "Online ticket sales", "Attendee communications", "Approval workflows", "5GB storage"] },
  { name: "Total Operations", price: 149, annual: 124, highlight: false, features: ["Everything in Events", "Fully autonomous scheduling", "AI social calendar", "Priority support", "10GB storage"] },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

export function VerticalLanding({ config }: { config: VerticalConfig }) {
  const [annual, setAnnual] = useState(false);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background text-white">

        {/* Hero */}
        <section className="relative pt-36 pb-24 px-6 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(202,164,60,0.15),transparent)]" />
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <motion.div initial="hidden" animate="visible" variants={fadeUp}>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6">
                Built for {config.orgTypePlural}
              </span>
              <h1 className="text-5xl sm:text-6xl font-bold leading-tight mb-6">
                {config.heroHeadline}
              </h1>
              <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
                {config.heroSub}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <LoginButton className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-base shadow-lg shadow-primary/20 hover:bg-primary/90 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
                  {config.ctaLabel} <ArrowRight className="w-4 h-4" />
                </LoginButton>
                <Link href="/#pricing">
                  <Button variant="outline" className="border-white/20 text-white hover:bg-white/5 px-8 py-4 rounded-xl text-base h-auto">
                    See pricing
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-muted-foreground mt-4">14-day free trial · Cancel anytime · Live in 10 minutes</p>
            </motion.div>
          </div>
        </section>

        {/* Pain Points — Before / After */}
        <section className="py-16 px-6 border-y border-white/5 bg-white/[0.02]">
          <div className="max-w-4xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-center text-2xl font-bold mb-10 text-white">
                Sound familiar?
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {config.painPoints.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                    <span className="text-red-400 font-bold text-lg leading-none mt-0.5">✗</span>
                    <p className="text-sm text-slate-300 leading-relaxed">{p}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-center">
                <p className="text-emerald-400 font-semibold text-lg">Steward handles all of this — automatically.</p>
                <p className="text-sm text-slate-400 mt-1">You stay focused on your mission. We handle the digital work.</p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Accent Quote */}
        <section className="py-16 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <blockquote className="text-2xl font-medium italic text-primary/90 leading-relaxed">
                "{config.accentQuote}"
              </blockquote>
              <p className="mt-4 text-sm text-muted-foreground">— The challenge facing {config.orgTypePlural} everywhere</p>
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 px-6 bg-white/[0.02] border-y border-white/5">
          <div className="max-w-5xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-center text-3xl font-bold mb-12">Everything your {config.orgType} needs</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-6">
                {config.benefits.map((b, i) => (
                  <div key={i} className="flex gap-4 p-5 rounded-2xl border border-white/10 bg-white/[0.03] hover:border-primary/30 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {b.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">{b.title}</h3>
                      <p className="text-sm text-slate-400 leading-relaxed">{b.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-16 px-6">
          <div className="max-w-3xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-center text-3xl font-bold mb-12">Up and running in under 30 minutes</h2>
              <div className="space-y-6">
                {[
                  { n: "1", icon: <MessageSquare className="w-5 h-5" />, title: "Tell us about your organization", body: "Answer a short chat interview — your mission, meeting schedule, key contacts, and goals." },
                  { n: "2", icon: <Zap className="w-5 h-5" />, title: "AI builds everything", body: "Steward generates your website, sets up your event system, and prepares your social media — no coding needed." },
                  { n: "3", icon: <Clock className="w-5 h-5" />, title: "It runs itself", body: "Content updates, event promotions, and social posts happen automatically. You're in control whenever you want to be." },
                ].map(s => (
                  <div key={s.n} className="flex items-start gap-5">
                    <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0 text-primary font-bold">
                      {s.n}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">{s.title}</h3>
                      <p className="text-sm text-slate-400 leading-relaxed">{s.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-20 px-6 bg-white/[0.02] border-y border-white/5">
          <div className="max-w-5xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-center text-3xl font-bold mb-3">Simple, transparent pricing</h2>
              <p className="text-center text-slate-400 mb-8">Cancel anytime. No contracts.</p>

              <div className="flex items-center justify-center gap-3 mb-10">
                <span className={`text-sm font-medium ${!annual ? "text-white" : "text-muted-foreground"}`}>Monthly</span>
                <button
                  onClick={() => setAnnual(v => !v)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${annual ? "bg-primary" : "bg-white/20"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${annual ? "translate-x-7" : "translate-x-1"}`} />
                </button>
                <span className={`text-sm font-medium ${annual ? "text-white" : "text-muted-foreground"}`}>Annual <span className="text-emerald-400 text-xs">(Save ~15%)</span></span>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {PRICING.map(tier => (
                  <div key={tier.name} className={`relative rounded-2xl border p-5 flex flex-col ${tier.highlight ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-white/10 bg-white/[0.03]"}`}>
                    {tier.highlight && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full">Most Popular</span>
                    )}
                    <p className="font-semibold text-white mb-1">{tier.name}</p>
                    <p className="text-3xl font-bold text-white mb-0.5">
                      ${annual ? tier.annual : tier.price}
                      <span className="text-base font-normal text-muted-foreground">/mo</span>
                    </p>
                    {annual && <p className="text-xs text-emerald-400 mb-3">Billed annually</p>}
                    <div className="mt-4 flex-1 space-y-2">
                      {tier.features.map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          {f}
                        </div>
                      ))}
                    </div>
                    <LoginButton className={`mt-5 w-full py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${tier.highlight ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-white/10 text-white hover:bg-white/20"}`}>
                      Get started
                    </LoginButton>
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-muted-foreground mt-6">
                Subscriptions renew automatically. Cancel anytime from your billing page. <Link href="/terms" className="underline hover:text-white">Terms apply.</Link>
              </p>
            </motion.div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-4xl font-bold mb-4">Ready to put your {config.orgType} on autopilot?</h2>
              <p className="text-slate-400 mb-8 text-lg">Join the {config.orgTypePlural} already running smarter with Steward.</p>
              <LoginButton className="inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg shadow-xl shadow-primary/20 hover:bg-primary/90 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
                Start free today <ArrowRight className="w-5 h-5" />
              </LoginButton>
            </motion.div>
          </div>
        </section>

        {/* Footer links */}
        <footer className="border-t border-white/10 py-6 px-6">
          <div className="max-w-5xl mx-auto flex flex-wrap justify-center gap-6 text-xs text-muted-foreground">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/for/lodges" className="hover:text-white transition-colors">Lodges</Link>
            <Link href="/for/rotary" className="hover:text-white transition-colors">Rotary & Service Clubs</Link>
            <Link href="/for/vfw" className="hover:text-white transition-colors">Veterans Organizations</Link>
            <Link href="/for/hoa" className="hover:text-white transition-colors">HOAs</Link>
            <Link href="/for/pta" className="hover:text-white transition-colors">PTAs & Schools</Link>
            <Link href="/for/nonprofits" className="hover:text-white transition-colors">Nonprofits</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          </div>
        </footer>
      </main>
    </>
  );
}
