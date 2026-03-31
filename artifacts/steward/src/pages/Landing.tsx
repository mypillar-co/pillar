import React, { useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Link } from "wouter";
import { CheckCircle2, Bot, Calendar, Globe, Share2, Shield, Zap, Users, ArrowRight, MessageSquare, Clock, Building2, Heart, Trophy, Megaphone, TreePine, Coffee, GraduationCap, DollarSign, Lock, RefreshCw, Star } from "lucide-react";
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

const orgTypes = [
  { icon: <Building2 className="w-5 h-5" />, label: "Chambers of Commerce" },
  { icon: <Heart className="w-5 h-5" />, label: "Nonprofits" },
  { icon: <Trophy className="w-5 h-5" />, label: "Civic Clubs" },
  { icon: <Megaphone className="w-5 h-5" />, label: "Community Groups" },
  { icon: <TreePine className="w-5 h-5" />, label: "Conservation Orgs" },
  { icon: <Coffee className="w-5 h-5" />, label: "Business Associations" },
  { icon: <Users className="w-5 h-5" />, label: "Fraternal Organizations" },
  { icon: <GraduationCap className="w-5 h-5" />, label: "Alumni Chapters" },
];

const painPoints = [
  {
    before: "Paying $200–$500/mo to update a website",
    after: "AI updates your site in seconds, for free",
  },
  {
    before: "Posting on social media manually every week",
    after: "Steward writes and schedules posts automatically",
  },
  {
    before: "Using 4 different tools for events, payments, and contacts",
    after: "One dashboard. Everything connected.",
  },
  {
    before: "Events don't appear on your website until someone updates it",
    after: "Events publish to your website the moment you create them",
  },
];

const scenarios = [
  {
    icon: <Calendar className="w-5 h-5 text-primary" />,
    org: "Annual Gala Planning",
    headline: "From zero to sold-out in an afternoon",
    description: "Create the event, set ticket tiers, publish to your website, and share it on social media — all without leaving the dashboard.",
    tags: ["Events", "Ticketing", "Social Posts"],
  },
  {
    icon: <Globe className="w-5 h-5 text-primary" />,
    org: "New Chapter Launch",
    headline: "Professional website live before your kickoff meeting",
    description: "Answer 8 questions in a chat. Steward generates a complete, branded website in minutes. No designer needed.",
    tags: ["AI Website", "Domain", "Publishing"],
  },
  {
    icon: <Share2 className="w-5 h-5 text-primary" />,
    org: "Weekly Communications",
    headline: "Consistent presence without the Monday scramble",
    description: "Connect your accounts once. Steward drafts your posts, you approve or adjust, and they go out on schedule — automatically.",
    tags: ["Social Media", "Scheduling", "AI Content"],
  },
  {
    icon: <DollarSign className="w-5 h-5 text-emerald-400" />,
    org: "Dues & Donations",
    headline: "Collect payments without a separate platform",
    description: "Accept membership dues, event fees, and one-time donations directly through your Steward dashboard. All in one place.",
    tags: ["Payments", "Stripe", "Reporting"],
  },
];

const highlights = [
  { value: "10 min", label: "Average website build time" },
  { value: "80%", label: "Less time on digital admin" },
  { value: "3-in-1", label: "Website + Events + Social" },
  { value: "$0", label: "Setup or hidden fees" },
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
                <span>14-day free trial</span>
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

      {/* Trust signals strip */}
      <section className="border-b border-white/6 bg-[hsl(224,40%,8%)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {[
              { icon: <Shield className="w-4 h-4 text-primary" />, text: "14-day free trial — no credit card required" },
              { icon: <RefreshCw className="w-4 h-4 text-primary" />, text: "Cancel anytime, no questions asked" },
              { icon: <Lock className="w-4 h-4 text-primary" />, text: "Payments secured by Stripe" },
              { icon: <Star className="w-4 h-4 text-primary" />, text: "Satisfaction guaranteed" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-400">
                {item.icon}
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Built for section */}
      <section className="py-14 border-y border-white/6 bg-secondary/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground mb-8 uppercase tracking-widest font-medium">Built for civic &amp; community organizations</p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            {orgTypes.map((org, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 bg-white/4 text-sm text-slate-300 hover:border-primary/30 hover:text-white hover:bg-primary/5 transition-all"
              >
                <span className="text-primary">{org.icon}</span>
                {org.label}
              </motion.div>
            ))}
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

      {/* Pain Points / Before-After */}
      <section className="py-24 bg-secondary/30 relative">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Stop doing it the hard way</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Most civic organizations are managing their digital presence with outdated, expensive, or time-consuming tools. Here's what changes with Steward.
            </p>
          </div>
          <div className="space-y-4">
            {painPoints.map((point, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
              >
                <div className="flex items-start gap-3 px-5 py-4 rounded-xl border border-red-500/15 bg-red-500/5">
                  <span className="text-red-400 mt-0.5 flex-shrink-0 text-lg leading-none">✗</span>
                  <p className="text-sm text-slate-400 leading-relaxed">{point.before}</p>
                </div>
                <div className="flex items-start gap-3 px-5 py-4 rounded-xl border border-primary/20 bg-primary/5">
                  <span className="text-primary mt-0.5 flex-shrink-0 text-lg leading-none">✓</span>
                  <p className="text-sm text-slate-200 leading-relaxed font-medium">{point.after}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof — Scenario Cards */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/3 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-16">
            <Badge variant="outline" className="px-3 py-1 text-xs mb-4 border-primary/25 text-primary bg-primary/5">
              Real-world workflows
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              See exactly what Steward does for your org
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Every civic organization has the same recurring pain points. Here's how Steward handles them automatically.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-20">
            {scenarios.map((scenario, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="group relative rounded-2xl border border-white/8 bg-card/40 p-6 hover:border-primary/25 hover:bg-card/60 transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                    {scenario.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-primary font-medium mb-1 uppercase tracking-wide">{scenario.org}</p>
                    <h3 className="text-lg font-semibold text-white mb-2 leading-snug">{scenario.headline}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">{scenario.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {scenario.tags.map((tag, j) => (
                        <span key={j} className="text-xs px-2.5 py-1 rounded-full border border-white/8 bg-white/4 text-slate-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Key metrics strip */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 py-10 px-8 rounded-2xl border border-white/8 bg-secondary/30"
          >
            {highlights.map((h, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl md:text-4xl font-bold text-primary mb-1">{h.value}</p>
                <p className="text-sm text-muted-foreground">{h.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-secondary/20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-y-1/2" />
          <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-primary/4 rounded-full blur-3xl" />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-14">
            <Badge variant="outline" className="px-3 py-1 text-xs mb-4 border-primary/25 text-primary bg-primary/5">
              Organizations like yours
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Civic leaders love Steward
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              From Masonic lodges to HOAs to nonprofits — here's what administrators say after their first month.
            </p>
          </div>

          <motion.div
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.12 } },
            }}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {[
              {
                quote: "We spent $400/month on a web designer who took two weeks to update our events page. Steward updates it automatically the moment we add an event. We haven't touched it in three months.",
                name: "Robert H.",
                title: "Secretary, Riverside Lodge #412",
                org: "Masonic Lodge",
                initial: "R",
              },
              {
                quote: "Our HOA newsletter used to take me half a Saturday. Now I tell Steward what happened at the board meeting and it writes the update, posts it to Facebook, and sends the email. I get my weekends back.",
                name: "Sandra K.",
                title: "Board President, Maplewood HOA",
                org: "Homeowners Association",
                initial: "S",
              },
              {
                quote: "We were paying a social media agency $800/month and still had to remind them about every event. With Steward I set up one automation rule and it posts about our events automatically. The AI actually writes better captions than they did.",
                name: "Marcus T.",
                title: "Executive Director, Friends of Elm Park",
                org: "Nonprofit",
                initial: "M",
              },
              {
                quote: "I'm not a tech person at all — I'm a 68-year-old club president. I answered eight questions in a chat and had a professional website up before lunch. The whole thing was less complicated than setting up my email.",
                name: "Patricia O.",
                title: "President, Valley Rotary Club",
                org: "Rotary Club",
                initial: "P",
              },
              {
                quote: "We were paying $120/yr for Squarespace and still had to update everything manually. Steward actually runs our site — it adds events, keeps things current, and even posts to X when we have announcements.",
                name: "David L.",
                title: "Commander, VFW Post 3847",
                org: "Veterans Organization",
                initial: "D",
              },
              {
                quote: "The board approval link feature alone is worth the subscription. We can get digital votes from our 12 board members without scheduling a Zoom. Our last resolution passed in 6 hours.",
                name: "Jennifer M.",
                title: "PTA President, Lincoln Elementary",
                org: "Parent-Teacher Association",
                initial: "J",
              },
            ].map((t, i) => (
              <motion.div
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 24 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
                }}
                className="group relative rounded-2xl border border-white/8 bg-card/40 p-6 hover:border-primary/20 hover:bg-card/60 transition-all duration-300 flex flex-col"
              >
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, s) => (
                    <svg key={s} className="w-4 h-4 text-primary fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-slate-300 text-sm leading-relaxed flex-1 italic mb-5">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary text-sm font-bold">{t.initial}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                    <p className="text-xs text-slate-500 truncate">{t.title}</p>
                  </div>
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full border border-white/8 bg-white/4 text-slate-500 flex-shrink-0">{t.org}</span>
                </div>
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

      {/* Guarantee strip */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 px-6 py-4 rounded-2xl border border-primary/20 bg-primary/5"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">14-day free trial</p>
              <p className="text-xs text-slate-400">Full access, no credit card required</p>
            </div>
          </div>
          <div className="hidden sm:block w-px h-8 bg-white/10" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Cancel anytime</p>
              <p className="text-xs text-slate-400">No long-term contracts or lock-in</p>
            </div>
          </div>
          <div className="hidden sm:block w-px h-8 bg-white/10" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
              <Star className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Satisfaction guaranteed</p>
              <p className="text-xs text-slate-400">We'll make it right or refund you</p>
            </div>
          </div>
        </motion.div>
      </div>

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
