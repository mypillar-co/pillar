import React, { useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Link } from "wouter";
import { CheckCircle2, Bot, Calendar, Globe, Share2, Shield, Zap, Users, ArrowRight, MessageSquare, Clock, Quote, Star } from "lucide-react";
import { useAuth, LoginButton } from "@workspace/replit-auth-web";
import { useListTiers, useGetOrganization } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    icon: <MessageSquare className="w-6 h-6 text-primary" />,
    title: "Website Live in 10 Minutes",
    description: "Answer a few questions in a chat. Steward builds a complete, professional website for your organization — no design skills needed.",
  },
  {
    icon: <Calendar className="w-6 h-6 text-primary" />,
    title: "Events That Run Themselves",
    description: "Create events, sell tickets online, manage RSVPs, and send attendee updates — all from one dashboard.",
  },
  {
    icon: <Share2 className="w-6 h-6 text-primary" />,
    title: "Social Media on Autopilot",
    description: "Connect your Facebook, Instagram, and X accounts. Steward writes and posts updates automatically based on your schedule.",
  },
  {
    icon: <Bot className="w-6 h-6 text-primary" />,
    title: "A Digital Agency for $59/mo",
    description: "Most organizations pay $2,000+ per month for web management and social media. Steward delivers the same results at a fraction of the cost.",
  },
];

const steps = [
  {
    number: "1",
    title: "Tell Us About Your Org",
    description: "Answer 8 simple questions in a chat conversation. Tell us your mission, schedule, and contact info.",
    icon: <MessageSquare className="w-5 h-5" />,
  },
  {
    number: "2",
    title: "We Build Everything",
    description: "AI generates your website, sets up your event system, and connects your social media accounts.",
    icon: <Zap className="w-5 h-5" />,
  },
  {
    number: "3",
    title: "You Focus on Leading",
    description: "Steward keeps your digital presence current automatically. Check in whenever you want — or don't.",
    icon: <Clock className="w-5 h-5" />,
  },
];

const comparisons = [
  { task: "Professional website", without: "$2,000 – $5,000", with: "Included" },
  { task: "Monthly website updates", without: "$200 – $500/mo", with: "Included" },
  { task: "Social media management", without: "$500 – $2,000/mo", with: "Included" },
  { task: "Event ticketing platform", without: "$50 – $300/mo", with: "Included" },
  { task: "Custom domain + hosting", without: "$100 – $200/yr", with: "Included" },
];

const testimonials = [
  {
    quote: "We went from no website to a fully professional online presence in one afternoon. Our membership inquiries doubled the first month.",
    name: "Sarah M.",
    role: "President, Riverside Community Association",
    rating: 5,
  },
  {
    quote: "The event management alone is worth it. We sold out our annual fundraiser for the first time — and the ticketing was completely hands-free.",
    name: "James R.",
    role: "Events Chair, Downtown Rotary Club",
    rating: 5,
  },
  {
    quote: "I used to spend 5 hours a week on social media. Now Steward handles it and our engagement is actually better than when I did it manually.",
    name: "Linda K.",
    role: "Secretary, Valley Nonprofit Coalition",
    rating: 5,
  },
];

const stats = [
  { value: "500+", label: "Organizations served" },
  { value: "10 min", label: "Average site build time" },
  { value: "98%", label: "Customer satisfaction" },
  { value: "$0", label: "Setup fees" },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const { data: tiersData, isLoading: isTiersLoading } = useListTiers();
  const { data: orgData } = useGetOrganization({ query: { enabled: isAuthenticated } });
  const hasOrg = isAuthenticated && Boolean(orgData?.organization);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
  };

  const ctaButton = isAuthenticated ? (
    <Link
      href={hasOrg ? "/dashboard" : "/onboard"}
      className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-base font-semibold h-14 px-10 bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-1"
    >
      {hasOrg ? "Go to Dashboard" : "Set Up Your Organization"}
    </Link>
  ) : (
    <LoginButton className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-base font-semibold h-14 px-10 bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-1 cursor-pointer">
      Start Your Free Trial
    </LoginButton>
  );

  return (
    <div className="min-h-screen bg-background pt-20">
      <section className="relative overflow-hidden pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="absolute inset-0 z-0">
          <img
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
            alt="Abstract background"
            className="w-full h-full object-cover opacity-30 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-4xl mx-auto space-y-8"
          >
            <Badge variant="outline" className="px-4 py-1.5 text-sm mb-6 border-primary/30 text-primary bg-primary/5 backdrop-blur-md">
              Built for Civic Organizations & Community Groups
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white leading-[1.1]">
              Your organization, <br />
              <span className="gold-gradient-text">on autopilot.</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              Website, events, and social media — managed by AI so you can focus on your mission. Like hiring a digital agency for a fraction of the cost.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              {ctaButton}
              <Button
                variant="glass"
                size="lg"
                onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
              >
                View Pricing
              </Button>
            </div>
            <div className="flex items-center justify-center gap-8 pt-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>Website live in 10 minutes</span>
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-24 bg-secondary/30 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Everything your organization needs, nothing it doesn't</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Built specifically for civic organizations, nonprofits, clubs, and community groups — not generic "business" templates.
            </p>
          </div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
          >
            {features.map((feature, i) => (
              <motion.div key={i} variants={itemVariants}>
                <Card className="h-full bg-card/40 border-white/5 hover:bg-card/60 transition-colors">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      {feature.icon}
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="py-24 relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Up and running in three steps</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              No design degree. No tech team. No learning curve. Just answer a few questions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
              >
                <div className="relative text-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center mx-auto mb-5">
                    <span className="text-xl font-bold text-primary">{step.number}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                  {i < steps.length - 1 && (
                    <ArrowRight className="hidden md:block absolute top-7 -right-6 w-5 h-5 text-primary/40" />
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-secondary/30 relative">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">What this would cost without Steward</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Organizations typically spend thousands on agencies and freelancers. Steward replaces all of it.
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-white/10 bg-card/40 overflow-hidden"
          >
            <div className="grid grid-cols-3 text-sm font-semibold text-muted-foreground border-b border-white/10 px-6 py-4">
              <span>Service</span>
              <span className="text-center">Typical Cost</span>
              <span className="text-center text-primary">With Steward</span>
            </div>
            {comparisons.map((row, i) => (
              <div key={i} className={`grid grid-cols-3 text-sm px-6 py-4 ${i < comparisons.length - 1 ? "border-b border-white/5" : ""}`}>
                <span className="text-white">{row.task}</span>
                <span className="text-center text-muted-foreground line-through decoration-red-400/50">{row.without}</span>
                <span className="text-center text-primary font-medium">{row.with}</span>
              </div>
            ))}
            <div className="grid grid-cols-3 text-sm px-6 py-4 bg-primary/5 border-t border-primary/20">
              <span className="font-semibold text-white">Total annual cost</span>
              <span className="text-center text-red-400 font-semibold">$10,000 – $40,000+</span>
              <span className="text-center text-primary font-bold">From $288/yr</span>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-20 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8"
          >
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl md:text-4xl font-bold text-primary mb-1">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="py-24 bg-secondary/30 relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Trusted by organizations like yours</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Real results from civic organizations, nonprofits, and community groups.
            </p>
          </div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {testimonials.map((t, i) => (
              <motion.div key={i} variants={itemVariants}>
                <Card className="h-full bg-card/40 border-white/5 hover:bg-card/60 transition-colors">
                  <CardContent className="pt-6 pb-5">
                    <div className="flex gap-0.5 mb-4">
                      {Array.from({ length: t.rating }).map((_, j) => (
                        <Star key={j} className="w-4 h-4 text-primary fill-primary" />
                      ))}
                    </div>
                    <Quote className="w-5 h-5 text-primary/30 mb-2" />
                    <p className="text-white/90 text-sm leading-relaxed mb-5 italic">
                      "{t.quote}"
                    </p>
                    <div className="border-t border-white/8 pt-4">
                      <p className="text-white text-sm font-medium">{t.name}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">{t.role}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section id="pricing" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Simple, transparent pricing</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
              Flat monthly rates. No hidden fees. Choose the level of autonomy your organization needs.
            </p>

            <div className="inline-flex items-center bg-card/60 border border-white/10 rounded-xl p-1">
              <button
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  billingPeriod === "monthly"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-white"
                }`}
                onClick={() => setBillingPeriod("monthly")}
              >
                Monthly
              </button>
              <button
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  billingPeriod === "annual"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-white"
                }`}
                onClick={() => setBillingPeriod("annual")}
              >
                Annual
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs px-1.5 py-0">
                  Save up to 17%
                </Badge>
              </button>
            </div>
          </div>

          {isTiersLoading ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {tiersData?.tiers.map((tier: any) => {
                const displayPrice = billingPeriod === "annual" ? (tier.annualPrice ?? tier.price) : tier.price;
                return (
                  <Card
                    key={tier.id}
                    className={`relative flex flex-col h-full transition-transform duration-300 hover:-translate-y-2 ${
                      tier.highlight
                        ? "border-primary shadow-2xl shadow-primary/20 bg-card z-10 scale-105"
                        : "border-white/10 bg-card/50"
                    }`}
                  >
                    {tier.highlight && (
                      <div className="absolute -top-4 left-0 right-0 flex justify-center">
                        <Badge className="bg-primary text-primary-foreground px-3 py-1 text-sm font-bold uppercase tracking-wider shadow-lg">
                          Most Popular
                        </Badge>
                      </div>
                    )}
                    <CardHeader>
                      <CardTitle className="text-xl mb-1">{tier.name}</CardTitle>
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-4xl font-bold text-white">${displayPrice}</span>
                        <span className="text-muted-foreground">/{billingPeriod === "annual" ? "mo" : "mo"}</span>
                      </div>
                      {billingPeriod === "annual" && (
                        <p className="text-xs text-emerald-400 mt-1">
                          Billed ${displayPrice * 12}/yr — save ${(tier.price - displayPrice) * 12}/yr
                        </p>
                      )}
                      <CardDescription className="mt-3 min-h-[48px]">{tier.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <ul className="space-y-3">
                        {tier.features.map((feature: string, i: number) => (
                          <li key={i} className="flex items-start gap-3">
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <span className="text-sm text-muted-foreground">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter>
                      {isAuthenticated ? (
                        <Link href={hasOrg ? "/billing" : "/onboard"} className="w-full">
                          <Button className="w-full" variant={tier.highlight ? "default" : "outline"}>
                            {hasOrg ? "Select Plan" : "Get Started"}
                          </Button>
                        </Link>
                      ) : (
                        <LoginButton
                          className={`w-full inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-11 px-6 py-2 cursor-pointer ${
                            tier.highlight
                              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
                              : "border-2 border-primary/20 bg-transparent text-primary hover:border-primary hover:bg-primary/10"
                          }`}
                        >
                          Start Free Trial
                        </LoginButton>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="py-20 relative">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to put your organization on autopilot?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
              Join community organizations that are saving thousands on digital operations. Setup takes less than 10 minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {ctaButton}
            </div>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-white/8 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Shield className="w-4.5 h-4.5 text-primary-foreground" />
                </div>
                <span className="font-bold text-white text-lg tracking-tight">Steward</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-sm">
                AI-powered digital operations for civic organizations, nonprofits, and community groups. Website, events, and social media — managed for you.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-white transition-colors">Pricing</button></li>
                <li><span>AI Website Builder</span></li>
                <li><span>Event Management</span></li>
                <li><span>Social Automation</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Built For</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Civic Organizations</li>
                <li>Nonprofits</li>
                <li>Community Clubs</li>
                <li>Local Chapters</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Steward. Your organization, on autopilot.
            </p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
              <Shield className="w-3 h-3" />
              <span>Payments secured by Stripe</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
