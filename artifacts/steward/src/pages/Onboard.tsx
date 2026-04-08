import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateOrganization,
  useListTiers,
  useCreateCheckoutSession,
  getGetOrganizationQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Globe,
  Calendar,
  Share2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  ImageIcon,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { uploadImage, isImageFile, ACCEPTED_IMAGE_TYPES } from "@/lib/uploadImage";
import { Link } from "wouter";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

const orgSchema = z.object({
  name: z.string().min(2, "Organization name must be at least 2 characters"),
  type: z.string().min(1, "Please select an organization type"),
  category: z.string().optional(),
});

type OrgFormData = z.infer<typeof orgSchema>;

const ORG_TYPES = [
  "Masonic Lodge",
  "Rotary Club",
  "VFW Post",
  "Homeowners Association (HOA)",
  "PTA / Parent Organization",
  "Nonprofit Organization",
  "Chamber of Commerce",
  "Civic Organization",
  "Fraternal Organization",
  "Social Club",
  "Festival Committee",
  "Other",
];

const TIER_ICONS: Record<string, React.ElementType> = {
  tier1: Globe,
  tier1a: Share2,
  tier2: Calendar,
  tier3: Shield,
};

type Step = 1 | "hero" | 2 | 3;

const ALL_STEPS: Step[] = [1, "hero", 2, 3];
const STEP_LABELS: { step: Step; label: string }[] = [
  { step: 1, label: "Your Organization" },
  { step: "hero", label: "Your Homepage" },
  { step: 2, label: "Choose a Plan" },
  { step: 3, label: "All Set" },
];
function stepToIndex(s: Step) { return ALL_STEPS.indexOf(s); }

interface UnsplashPhoto {
  id: string;
  thumbUrl: string;
  previewUrl: string;
  downloadLocation: string;
  photographer: string;
  photographerUrl: string;
}

export default function Onboard() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [createdOrgName, setCreatedOrgName] = useState("");
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [tosAccepted, setTosAccepted] = useState(false);

  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hero step state
  type HeroPhase = "choice" | "uploading" | "picking" | "approving" | "saving";
  const [heroPhase, setHeroPhase] = useState<HeroPhase>("choice");
  const [heroPhotos, setHeroPhotos] = useState<UnsplashPhoto[]>([]);
  const [heroQuery, setHeroQuery] = useState("");
  const [heroError, setHeroError] = useState<string | null>(null);
  const [heroSaving, setHeroSaving] = useState(false);
  const heroFileRef = useRef<HTMLInputElement>(null);

  const checkSlug = useCallback((value: string) => {
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    const trimmed = value.toLowerCase().trim();
    if (!trimmed) { setSlugStatus("idle"); return; }
    const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;
    if (!SLUG_RE.test(trimmed)) { setSlugStatus("invalid"); return; }
    setSlugStatus("checking");
    slugTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${BASE}/api/organizations/check-slug?slug=${encodeURIComponent(trimmed)}`, { credentials: "include" });
        const data = await res.json() as { available: boolean };
        setSlugStatus(data.available ? "available" : "taken");
      } catch {
        setSlugStatus("idle");
      }
    }, 400);
  }, []);

  // When returning from Stripe Checkout, the success_url includes ?step=3
  // Jump directly to the correct step based on the query param
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const stepParam = params.get("step");
    const billingParam = params.get("billing");
    if (stepParam === "3" && billingParam === "success") {
      setCurrentStep(3);
    } else if (stepParam === "2") {
      setCurrentStep(2);
    }
  }, [searchString]);

  const { mutate: createOrg, isPending: orgPending } = useCreateOrganization();
  const { mutate: createCheckout, isPending: checkoutPending } =
    useCreateCheckoutSession();
  const { data: tiersData, isLoading: tiersLoading } = useListTiers();

  const form = useForm<OrgFormData>({
    resolver: zodResolver(orgSchema),
    defaultValues: { name: "", type: "", category: "" },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Auto-derive slug from org name unless user has manually edited it
  useEffect(() => {
    const subscription = form.watch((values, { name: fieldName }) => {
      if (fieldName === "name" && !slugEdited) {
        const derived = nameToSlug(values.name ?? "");
        setSlug(derived);
        checkSlug(derived);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, slugEdited, checkSlug]);

  if (authLoading) return null;
  if (!isAuthenticated) return null;

  const handleOrgSubmit = (data: OrgFormData) => {
    createOrg(
      { data: { ...data, slug: slug || undefined } },
      {
        onSuccess: () => {
          // Invalidate org query so DashboardLayout finds the new org when navigating there
          void queryClient.invalidateQueries({ queryKey: getGetOrganizationQueryKey() });
          setCreatedOrgName(data.name);
          setHeroPhase("choice");
          setHeroError(null);
          setCurrentStep("hero");
        },
        onError: (err: unknown) => {
          const msg = (err as { message?: string })?.message;
          toast.error(msg && msg.includes("taken") ? msg : "Failed to create organization. Please try again.");
        },
      },
    );
  };

  const handleSelectTier = (tierId: string) => {
    setSelectedTierId(tierId);
    createCheckout(
      { data: { tierId } },
      {
        onSuccess: (data) => {
          if (data.url) {
            window.location.href = data.url;
          } else {
            setCurrentStep(3);
          }
        },
        onError: () => {
          toast.error("Failed to start checkout. Please try again.");
          setSelectedTierId(null);
        },
      },
    );
  };

  const handleSkipBilling = () => {
    setCurrentStep(3);
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 60 : -60,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({
      x: dir < 0 ? 60 : -60,
      opacity: 0,
    }),
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />

      <div className="w-full max-w-2xl relative z-10">
        {/* Progress steps */}
        <div className="flex items-center justify-center gap-3 mb-10">
          {STEP_LABELS.map(({ step, label }, idx) => (
            <React.Fragment key={String(step)}>
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    stepToIndex(currentStep) > idx
                      ? "bg-primary text-primary-foreground"
                      : currentStep === step
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {stepToIndex(currentStep) > idx ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`text-sm font-medium hidden sm:block ${
                    currentStep === step ? "text-white" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </div>
              {idx < STEP_LABELS.length - 1 && (
                <div
                  className={`flex-1 h-px max-w-12 transition-all ${
                    stepToIndex(currentStep) > idx ? "bg-primary" : "bg-white/10"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait" custom={currentStep}>
          {currentStep === 1 && (
            <motion.div
              key="step1"
              custom={1}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <Card className="border-white/10 shadow-2xl bg-card/80 backdrop-blur-xl">
                <CardHeader className="text-center pb-6">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Shield className="w-7 h-7 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">
                    Tell us about your organization
                  </CardTitle>
                  <CardDescription>
                    This helps Pillar tailor your digital presence from day one.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={form.handleSubmit(handleOrgSubmit)}
                    className="space-y-5"
                  >
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-white">
                        Organization Name
                      </label>
                      <input
                        {...form.register("name")}
                        className="w-full h-11 px-4 rounded-xl bg-background border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                        placeholder="e.g. Washington Lodge No. 42"
                      />
                      {form.formState.errors.name && (
                        <p className="text-xs text-destructive">
                          {form.formState.errors.name.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-white">
                        Organization Type
                      </label>
                      <select
                        {...form.register("type")}
                        className="w-full h-11 px-4 rounded-xl bg-background border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all appearance-none"
                      >
                        <option value="" className="bg-background text-muted-foreground">
                          Select a type...
                        </option>
                        {ORG_TYPES.map((type) => (
                          <option key={type} value={type} className="bg-background">
                            {type}
                          </option>
                        ))}
                      </select>
                      {form.formState.errors.type && (
                        <p className="text-xs text-destructive">
                          {form.formState.errors.type.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-white">
                        Your Community URL
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none select-none">
                          mypillar.co/
                        </span>
                        <input
                          value={slug}
                          onChange={(e) => {
                            const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                            setSlug(val);
                            setSlugEdited(true);
                            checkSlug(val);
                          }}
                          className="w-full h-11 pl-28 pr-10 rounded-xl bg-background border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                          placeholder="your-org-name"
                          maxLength={50}
                          spellCheck={false}
                        />
                        {slugStatus === "checking" && (
                          <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                        )}
                        {slugStatus === "available" && (
                          <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                        )}
                        {(slugStatus === "taken" || slugStatus === "invalid") && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-destructive text-base leading-none">✕</span>
                        )}
                      </div>
                      {slugStatus === "taken" && (
                        <p className="text-xs text-destructive">That URL is already taken. Try a different name.</p>
                      )}
                      {slugStatus === "invalid" && (
                        <p className="text-xs text-destructive">Only lowercase letters, numbers, and hyphens allowed.</p>
                      )}
                      {slugStatus === "available" && slug && (
                        <p className="text-xs text-green-400">Available — your site will be at <strong>{slug}.mypillar.co</strong></p>
                      )}
                      {slugStatus === "idle" && slug && (
                        <p className="text-xs text-muted-foreground">Your site will be at <strong>{slug}.mypillar.co</strong></p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-white">
                        Tagline or Category{" "}
                        <span className="text-muted-foreground font-normal">
                          (optional)
                        </span>
                      </label>
                      <input
                        {...form.register("category")}
                        className="w-full h-11 px-4 rounded-xl bg-background border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                        placeholder="e.g. Making good men better since 1872"
                      />
                    </div>

                    <label className="flex items-start gap-3 cursor-pointer group mt-1">
                      <input
                        type="checkbox"
                        checked={tosAccepted}
                        onChange={(e) => setTosAccepted(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded accent-primary shrink-0"
                      />
                      <span className="text-xs text-muted-foreground group-hover:text-slate-300 transition-colors leading-relaxed">
                        I agree to Pillar's{" "}
                        <Link href="/terms" className="text-primary hover:underline" target="_blank">Terms of Service</Link>
                        {" "}and{" "}
                        <Link href="/privacy" className="text-primary hover:underline" target="_blank">Privacy Policy</Link>.
                        I understand that AI-generated content may be inaccurate and I am responsible for reviewing it before publishing.
                      </span>
                    </label>

                    <Button
                      type="submit"
                      className="w-full h-11 text-base mt-2"
                      disabled={orgPending || !tosAccepted || slugStatus === "taken" || slugStatus === "invalid" || slugStatus === "checking"}
                    >
                      {orgPending ? (
                        "Saving..."
                      ) : (
                        <>
                          Continue
                          <ChevronRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === "hero" && (
            <motion.div
              key="hero"
              custom={1}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <Card className="border-white/10 shadow-2xl bg-card/80 backdrop-blur-xl">
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <ImageIcon className="w-7 h-7 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Set your homepage banner</CardTitle>
                  <CardDescription>
                    Choose a background image for your community site's hero section, or keep the default color scheme.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pb-8">

                  {/* Phase: choice */}
                  {heroPhase === "choice" && (
                    <>
                      {[
                        {
                          icon: X,
                          label: "No thanks — keep the color scheme",
                          sub: "Uses your brand colors. You can always change this later.",
                          action: () => setCurrentStep(2),
                          iconBg: "bg-secondary/60",
                          iconColor: "text-muted-foreground",
                        },
                        {
                          icon: Upload,
                          label: "Upload my own photo",
                          sub: "JPG, PNG, or WebP. Max 10MB.",
                          action: () => {
                            setHeroPhase("uploading");
                            setTimeout(() => heroFileRef.current?.click(), 50);
                          },
                          iconBg: "bg-blue-500/10",
                          iconColor: "text-blue-400",
                        },
                        {
                          icon: Wand2,
                          label: "You pick — AI chooses for me",
                          sub: "AI picks a search query based on your org, then you approve a photo.",
                          action: async () => {
                            setHeroPhase("picking");
                            setHeroError(null);
                            try {
                              const res = await fetch(`${BASE}/api/organizations/hero-image/suggest`, { credentials: "include" });
                              const data = await res.json() as { query?: string; photos?: UnsplashPhoto[]; error?: string };
                              if (!res.ok) throw new Error(data.error || "Failed to load suggestions");
                              setHeroQuery(data.query || "");
                              setHeroPhotos(data.photos || []);
                              setHeroPhase("approving");
                            } catch (err) {
                              setHeroError((err as Error).message);
                              setHeroPhase("choice");
                            }
                          },
                          iconBg: "bg-purple-500/10",
                          iconColor: "text-purple-400",
                        },
                      ].map(({ icon: Icon, label, sub, action, iconBg, iconColor }) => (
                        <button
                          key={label}
                          onClick={action}
                          className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all text-left group"
                        >
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                            <Icon className={`w-5 h-5 ${iconColor}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white text-sm">{label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors shrink-0" />
                        </button>
                      ))}
                      {heroError && <p className="text-sm text-destructive text-center">{heroError}</p>}
                    </>
                  )}

                  {/* Phase: uploading — file picker */}
                  {heroPhase === "uploading" && (
                    <div className="text-center space-y-4 py-4">
                      <input
                        ref={heroFileRef}
                        type="file"
                        accept={ACCEPTED_IMAGE_TYPES}
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) { setHeroPhase("choice"); return; }
                          if (!isImageFile(file)) { setHeroError("Please select an image file."); setHeroPhase("choice"); return; }
                          setHeroSaving(true);
                          setHeroError(null);
                          try {
                            const imageUrl = await uploadImage(file);
                            await fetch(`${BASE}/api/organizations/hero-image`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                              body: JSON.stringify({ imageUrl }),
                            });
                            setCurrentStep(2);
                          } catch {
                            setHeroError("Upload failed. Please try again.");
                            setHeroPhase("choice");
                          } finally {
                            setHeroSaving(false);
                          }
                        }}
                      />
                      {heroSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
                          <p className="text-sm text-muted-foreground">Saving your photo…</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">Select a photo from your device.</p>
                          <Button onClick={() => heroFileRef.current?.click()}>Choose File</Button>
                          <button onClick={() => setHeroPhase("choice")} className="block w-full text-xs text-muted-foreground hover:text-white mt-2">← Back</button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Phase: picking — AI loading */}
                  {heroPhase === "picking" && (
                    <div className="text-center py-8 space-y-3">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
                      <p className="text-sm text-muted-foreground">AI is finding the perfect image for your organization…</p>
                    </div>
                  )}

                  {/* Phase: approving — photo grid */}
                  {heroPhase === "approving" && (
                    <div className="space-y-4">
                      {heroQuery && (
                        <p className="text-xs text-muted-foreground text-center">
                          AI searched for: <span className="text-white font-medium">"{heroQuery}"</span>
                        </p>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        {heroPhotos.map((photo) => (
                          <button
                            key={photo.id}
                            disabled={heroSaving}
                            onClick={async () => {
                              setHeroSaving(true);
                              setHeroError(null);
                              try {
                                const res = await fetch(`${BASE}/api/organizations/hero-image/apply-unsplash`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  credentials: "include",
                                  body: JSON.stringify({ previewUrl: photo.previewUrl, downloadLocation: photo.downloadLocation }),
                                });
                                if (!res.ok) {
                                  const d = await res.json() as { error?: string };
                                  throw new Error(d.error || "Failed to save");
                                }
                                setCurrentStep(2);
                              } catch (err) {
                                setHeroError((err as Error).message);
                                setHeroSaving(false);
                              }
                            }}
                            className="relative group aspect-video rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-all disabled:opacity-50"
                          >
                            <img src={photo.thumbUrl} alt={`Photo by ${photo.photographer}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                              <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-all">Use this</span>
                            </div>
                          </button>
                        ))}
                      </div>
                      {heroSaving && (
                        <div className="text-center space-y-2">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                          <p className="text-xs text-muted-foreground">Saving your photo…</p>
                        </div>
                      )}
                      {heroError && <p className="text-sm text-destructive text-center">{heroError}</p>}
                      <p className="text-xs text-muted-foreground text-center">Photos from Unsplash. Click one to approve it as your banner.</p>
                      <button onClick={() => setHeroPhase("choice")} className="block w-full text-xs text-muted-foreground hover:text-white text-center">
                        ← Back to options
                      </button>
                    </div>
                  )}

                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="step2"
              custom={1}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <Card className="border-white/10 shadow-2xl bg-card/80 backdrop-blur-xl">
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-2xl">
                    Choose how much autopilot you want
                  </CardTitle>
                  <CardDescription>
                    You can upgrade or downgrade anytime. All plans include
                    hosting.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {tiersLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tiersData?.tiers.map((tier) => {
                        const Icon = TIER_ICONS[tier.id] ?? Globe;
                        return (
                          <button
                            key={tier.id}
                            onClick={() => handleSelectTier(tier.id)}
                            disabled={selectedTierId !== null || checkoutPending}
                            className={`w-full text-left p-4 rounded-xl border transition-all ${
                              tier.highlight
                                ? "border-primary bg-primary/5 hover:bg-primary/10"
                                : "border-white/10 hover:border-white/20 hover:bg-white/5"
                            } ${selectedTierId ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                                  tier.highlight
                                    ? "bg-primary/20"
                                    : "bg-secondary/60"
                                }`}
                              >
                                <Icon
                                  className={`w-5 h-5 ${tier.highlight ? "text-primary" : "text-muted-foreground"}`}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold text-white text-sm">
                                    {tier.name.split("—").pop()?.trim() ??
                                      tier.name}
                                  </p>
                                  {tier.highlight && (
                                    <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                                      Most Popular
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  {tier.description}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="font-bold text-white">
                                  ${tier.price}
                                  <span className="text-muted-foreground font-normal text-xs">
                                    /mo
                                  </span>
                                </p>
                                <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 ml-auto" />
                              </div>
                            </div>
                          </button>
                        );
                      })}

                      <p className="text-center text-xs text-muted-foreground pt-2 flex items-center justify-center gap-1.5">
                        <RefreshCw className="w-3 h-3 shrink-0" />
                        Subscriptions auto-renew monthly. Cancel anytime from your billing page.
                      </p>

                      <div className="pt-1">
                        <button
                          onClick={handleSkipBilling}
                          className="w-full text-center text-sm text-muted-foreground hover:text-white transition-colors py-2"
                        >
                          <ChevronLeft className="w-3 h-3 inline mr-1" />
                          Skip for now — I'll decide later
                        </button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {currentStep === 3 && (
            <motion.div
              key="step3"
              custom={1}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <Card className="border-white/10 shadow-2xl bg-card/80 backdrop-blur-xl">
                <CardHeader className="pb-4 pt-10 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
                    className="mx-auto w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-6"
                  >
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  </motion.div>
                  <CardTitle className="text-3xl text-white">
                    You're all set!
                  </CardTitle>
                  <CardDescription className="text-base mt-2">
                    {createdOrgName ? `${createdOrgName} is in the system.` : "Your organization is in the system."}{" "}
                    Pick your first action — you can have something live in minutes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-8 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Start here →</p>
                  {[
                    {
                      icon: Globe,
                      label: "Generate your website",
                      sub: "AI builds your full organization site in under a minute.",
                      href: "/dashboard/site",
                      color: "text-blue-400",
                      bg: "bg-blue-500/10",
                    },
                    {
                      icon: Calendar,
                      label: "Create your first event",
                      sub: "Publish a public event page with ticketing in 2 minutes.",
                      href: "/dashboard/events",
                      color: "text-amber-400",
                      bg: "bg-amber-500/10",
                    },
                    {
                      icon: Share2,
                      label: "Write your first social post",
                      sub: "AI drafts a post for your connected channels — just approve it.",
                      href: "/dashboard/social",
                      color: "text-purple-400",
                      bg: "bg-purple-500/10",
                    },
                  ].map(({ icon: Icon, label, sub, href, color, bg }) => (
                    <button
                      key={href}
                      onClick={() => setLocation(href)}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all text-left group"
                    >
                      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`w-5 h-5 ${color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm">{label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors shrink-0" />
                    </button>
                  ))}

                  <button
                    onClick={() => setLocation("/dashboard")}
                    className="w-full text-center text-sm text-muted-foreground hover:text-white transition-colors pt-2"
                  >
                    Skip — take me to the dashboard
                  </button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
