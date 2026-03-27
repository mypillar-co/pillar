import React from "react";
import { motion, type Variants } from "framer-motion";
import { Link } from "wouter";
import { CheckCircle2, Bot, Calendar, Globe, Share2, Shield } from "lucide-react";
import { useAuth, LoginButton } from "@workspace/replit-auth-web";
import { useListTiers, useGetOrganization } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    icon: <Globe className="w-6 h-6 text-primary" />,
    title: "AI Website Builder",
    description: "Start from pen and paper. Our AI extracts what it needs through simple conversation and builds your organization's home.",
  },
  {
    icon: <Calendar className="w-6 h-6 text-primary" />,
    title: "Event Dashboard",
    description: "Manage recurring events, track ticket sales, and handle communications seamlessly in one unified platform.",
  },
  {
    icon: <Share2 className="w-6 h-6 text-primary" />,
    title: "Social Automation",
    description: "Tell us your schedule once and the AI keeps your social channels fresh across Facebook, Instagram, and X.",
  },
  {
    icon: <Bot className="w-6 h-6 text-primary" />,
    title: "True Autonomy",
    description: "Unlike generic builders, Steward can genuinely run your digital presence hands-off. It's like hiring a digital agency.",
  },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const { data: tiersData, isLoading: isTiersLoading } = useListTiers();
  const { data: orgData } = useGetOrganization({ query: { enabled: isAuthenticated } });
  const hasOrg = isAuthenticated && Boolean(orgData?.organization);

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

  return (
    <div className="min-h-screen bg-background pt-20">
      {/* Hero Section */}
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
              Designed for Lodges, Clubs & Local Organizations
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white leading-[1.1]">
              Your organization, <br />
              <span className="gold-gradient-text">on autopilot.</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              We handle the website, events, and social media so you can focus on leading your organization. A complete digital operations center, powered by AI.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              {isAuthenticated ? (
                <Link
                  href={hasOrg ? "/dashboard" : "/onboard"}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold h-14 px-10 bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-1"
                >
                  {hasOrg ? "Go to Dashboard" : "Set Up Your Organization"}
                </Link>
              ) : (
                <LoginButton className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-base font-semibold h-14 px-10 bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-1 cursor-pointer">
                  Get Started for Free
                </LoginButton>
              )}
              <Button
                variant="glass"
                size="lg"
                onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
              >
                View Pricing
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-secondary/30 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Built for formal structures</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Generic platforms are built for individuals. Steward is built with formal approval processes, recurring schedules, and organizational governance in mind.
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

      {/* Pricing Section */}
      <section id="pricing" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Transparent Pricing</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Flat monthly rates. No nickel-and-diming. Choose the level of autonomy your organization needs.
            </p>
          </div>

          {isTiersLoading ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {tiersData?.tiers.map((tier) => (
                <Card 
                  key={tier.id} 
                  className={`relative flex flex-col h-full transition-transform duration-300 hover:-translate-y-2 ${
                    tier.highlight 
                      ? 'border-primary shadow-2xl shadow-primary/20 bg-card z-10 scale-105' 
                      : 'border-white/10 bg-card/50'
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
                    <CardTitle className="text-xl mb-2">{tier.name.split('—')[0].trim()}</CardTitle>
                    <p className="text-sm font-medium text-primary mb-4">{tier.name.split('—')[1]?.trim()}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-white">${tier.price}</span>
                      <span className="text-muted-foreground">/mo</span>
                    </div>
                    <CardDescription className="mt-4 min-h-[60px]">{tier.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ul className="space-y-4">
                      {tier.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
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
                      <LoginButton className={`w-full inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-11 px-6 py-2 cursor-pointer ${
                        tier.highlight 
                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90' 
                          : 'border-2 border-primary/20 bg-transparent text-primary hover:border-primary hover:bg-primary/10'
                      }`}>
                        Get Started
                      </LoginButton>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
      {/* Footer */}
      <footer className="border-t border-white/8 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Shield className="w-4.5 h-4.5 text-primary-foreground" />
              </div>
              <span className="font-bold text-white text-lg tracking-tight">Steward</span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              &copy; {new Date().getFullYear()} Steward. Your organization, on autopilot.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
