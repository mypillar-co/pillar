import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, ArrowRight, ArrowLeft, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TourStep {
  target: string | null;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right" | "center";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: "Welcome to Pillar!",
    description: "You're set up and ready to go. Let us walk you through your new command center — it only takes 30 seconds.",
    position: "center",
  },
  {
    target: '[data-tour="overview"]',
    title: "Your Command Center",
    description: "This is your overview — upcoming events, site status, recent activity, and quick actions all in one glance.",
    position: "right",
  },
  {
    target: '[data-tour="site-builder"]',
    title: "Your Website",
    description: "Build a professional website for your organization in minutes. Answer a few questions and Pillar creates a polished, mobile-ready site — no design skills needed.",
    position: "right",
  },
  {
    target: '[data-tour="events"]',
    title: "Event Management",
    description: "Create events, sell tickets, manage RSVPs, and send attendee updates. Your events sync to your website automatically the moment you publish them.",
    position: "right",
  },
  {
    target: '[data-tour="social"]',
    title: "Communications & Social Media",
    description: "Connect Facebook, Instagram, and X. Compose posts, schedule them, or set a recurring schedule to keep your accounts active automatically.",
    position: "right",
  },
  {
    target: '[data-tour="payments"]',
    title: "Payments & Revenue",
    description: "Connect Stripe to collect ticket sales, vendor fees, and donations. Every dollar tracked in one place with zero extra platforms.",
    position: "right",
  },
];

export type FeatureTourKey = "events" | "social" | "site" | "payments" | "contacts";

const FEATURE_TOURS: Record<FeatureTourKey, TourStep[]> = {
  events: [
    {
      target: null,
      title: "Creating an Event",
      description: "You're on the Events page. Here you can manage all your organization's events — from small meetups to large fundraisers.",
      position: "center",
    },
    {
      target: '[data-tour="new-event-btn"]',
      title: "Start Here",
      description: "Click \"New Event\" to open the event form. Fill in the name, date, location, and ticket details. It takes under two minutes.",
      position: "left",
    },
    {
      target: null,
      title: "You're all set!",
      description: "Once saved, your event appears here instantly. If your site is published, it'll also show up on your public website automatically.",
      position: "center",
    },
  ],
  social: [
    {
      target: null,
      title: "Communications & Social Media",
      description: "You're on the Communications page. Connect your accounts, compose posts, schedule them, or set a recurring schedule to keep your accounts active.",
      position: "center",
    },
    {
      target: '[data-tour="accounts-tab"]',
      title: "Connect Your Accounts",
      description: "Start on the Accounts tab. Click any platform to connect it — Facebook, Instagram, or X (Twitter). Only takes a minute to authorize.",
      position: "bottom",
    },
    {
      target: null,
      title: "Now Compose & Schedule",
      description: "Once connected, switch to the Posts tab to write a post, pick which platforms to share to, and either post now or schedule it for later.",
      position: "center",
    },
  ],
  site: [
    {
      target: null,
      title: "Website Builder",
      description: "You're in the Website section. Answer a few questions and Pillar builds a complete, professional website for your organization — no design skills needed.",
      position: "center",
    },
    {
      target: '[data-tour="site-builder"]',
      title: "Build Your Site",
      description: "Click \"Website\" in the sidebar to get started. Tell Pillar about your organization and it'll create your full site in minutes.",
      position: "right",
    },
    {
      target: '[data-tour="publish-site-btn"]',
      title: "Publish When Ready",
      description: "Once you're happy with the preview, click \"Publish\" to make your site live. You can unpublish or regenerate it any time.",
      position: "left",
    },
  ],
  payments: [
    {
      target: null,
      title: "Payments & Revenue",
      description: "You're on the Payments page. Connect Stripe to accept ticket sales, vendor fees, and donations — all tracked in one place.",
      position: "center",
    },
    {
      target: '[data-tour="connect-stripe-btn"]',
      title: "Connect Stripe",
      description: "Click \"Connect with Stripe\" to link your Stripe account. If you don't have one, Stripe will guide you through creating it — it's free to set up.",
      position: "top",
    },
    {
      target: null,
      title: "Ready to collect payments",
      description: "Once connected, any event tickets or donation links you create will automatically process payments through your Stripe account.",
      position: "center",
    },
  ],
  contacts: [
    {
      target: null,
      title: "Managing Contacts",
      description: "You're on the Contacts page. Keep track of members, volunteers, donors, and attendees — all in one organized list.",
      position: "center",
    },
    {
      target: null,
      title: "Add & Organize",
      description: "Click \"Add Contact\" to add someone manually, or import a CSV to bring in a whole list at once. You can tag contacts and filter by type.",
      position: "center",
    },
  ],
};

const FEATURE_TOUR_SESSION_KEY = "steward-feature-tour";
const TOUR_STORAGE_KEY = "steward-tour-completed";

export function launchFeatureTour(key: FeatureTourKey, navigate: (path: string) => void) {
  const destinations: Record<FeatureTourKey, string> = {
    events: "/dashboard/events",
    social: "/dashboard/social",
    site: "/dashboard/site",
    payments: "/dashboard/payments",
    contacts: "/dashboard/contacts",
  };
  sessionStorage.setItem(FEATURE_TOUR_SESSION_KEY, key);
  navigate(destinations[key]);
}

function useTourEngine(steps: TourStep[]) {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const [arrowDirection, setArrowDirection] = useState<"top" | "bottom" | "left" | "right" | "none">("left");
  const tooltipRef = useRef<HTMLDivElement>(null);

  const positionTooltip = useCallback(() => {
    const step = steps[currentStep];
    if (!step) return;

    const tooltipW = 340;
    const tooltipH = tooltipRef.current?.offsetHeight ?? 220;
    const gap = 18;

    if (!step.target || step.position === "center") {
      setTooltipStyle({ top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: tooltipW });
      setArrowStyle({});
      setArrowDirection("none");
      return;
    }

    const el = document.querySelector(step.target);
    if (!el) {
      setTooltipStyle({ top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: tooltipW });
      setArrowStyle({});
      setArrowDirection("none");
      return;
    }
    const rect = el.getBoundingClientRect();

    let top = 0;
    let left = 0;
    let aTop = 0;
    let aLeft = 0;
    let dir: "top" | "bottom" | "left" | "right" = "left";

    if (step.position === "right") {
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.right + gap;
      aTop = tooltipH / 2 - 6;
      aLeft = -6;
      dir = "left";
    } else if (step.position === "bottom") {
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      aTop = -6;
      aLeft = tooltipW / 2 - 6;
      dir = "top";
    } else if (step.position === "left") {
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.left - tooltipW - gap;
      aTop = tooltipH / 2 - 6;
      aLeft = tooltipW - 6;
      dir = "right";
    } else {
      top = rect.top - tooltipH - gap;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      aTop = tooltipH - 6;
      aLeft = tooltipW / 2 - 6;
      dir = "bottom";
    }

    top = Math.max(16, Math.min(top, window.innerHeight - tooltipH - 16));
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipW - 16));

    setTooltipStyle({ top, left, width: tooltipW });
    setArrowStyle({ top: aTop, left: aLeft });
    setArrowDirection(dir);
  }, [currentStep, steps]);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(positionTooltip, 80);
    window.addEventListener("resize", positionTooltip);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", positionTooltip);
    };
  }, [active, currentStep, positionTooltip]);

  useEffect(() => {
    if (!active) return;
    const step = steps[currentStep];
    if (!step?.target) return;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return;
    el.style.position = "relative";
    el.style.zIndex = "60";
    el.style.borderRadius = "8px";
    el.style.outline = "2px solid hsl(43, 96%, 56%)";
    el.style.outlineOffset = "2px";
    el.style.transition = "outline 0.3s ease, box-shadow 0.3s ease";
    el.style.boxShadow = "0 0 0 6px hsla(43, 96%, 56%, 0.15), 0 0 20px hsla(43, 96%, 56%, 0.2)";
    return () => {
      el.style.zIndex = "";
      el.style.outline = "";
      el.style.outlineOffset = "";
      el.style.boxShadow = "";
    };
  }, [active, currentStep, steps]);

  const dismiss = useCallback(() => {
    setActive(false);
    steps.forEach(step => {
      if (!step.target) return;
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (el) {
        el.style.zIndex = "";
        el.style.outline = "";
        el.style.outlineOffset = "";
        el.style.boxShadow = "";
      }
    });
  }, [steps]);

  const next = () => {
    if (currentStep < steps.length - 1) setCurrentStep(prev => prev + 1);
    else dismiss();
  };

  const prev = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  return { active, setActive, currentStep, setCurrentStep, tooltipStyle, arrowStyle, arrowDirection, tooltipRef, dismiss, next, prev };
}

function TourOverlay({
  steps,
  currentStep,
  tooltipStyle,
  arrowStyle,
  arrowDirection,
  tooltipRef,
  dismiss,
  next,
  prev,
  isOnboarding,
}: {
  steps: TourStep[];
  currentStep: number;
  tooltipStyle: React.CSSProperties;
  arrowStyle: React.CSSProperties;
  arrowDirection: "top" | "bottom" | "left" | "right" | "none";
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  dismiss: () => void;
  next: () => void;
  prev: () => void;
  isOnboarding: boolean;
}) {
  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;
  const isCentered = !step.target || step.position === "center";

  const arrowBorder: Record<string, React.CSSProperties> = {
    top: { borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderBottom: "7px solid hsl(224,40%,18%)" },
    bottom: { borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderTop: "7px solid hsl(224,40%,18%)" },
    left: { borderTop: "7px solid transparent", borderBottom: "7px solid transparent", borderRight: "7px solid hsl(224,40%,18%)" },
    right: { borderTop: "7px solid transparent", borderBottom: "7px solid transparent", borderLeft: "7px solid hsl(224,40%,18%)" },
    none: {},
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/65 transition-opacity duration-300" onClick={dismiss} />
      <div
        ref={tooltipRef}
        className="fixed z-[60] animate-in fade-in duration-250"
        style={isCentered ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 360 } : tooltipStyle}
      >
        <div className="bg-[hsl(224,40%,14%)] border border-primary/50 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
          {isFirst && isOnboarding && (
            <div className="px-5 pt-5 pb-3 flex items-center gap-3 border-b border-white/8">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-primary font-semibold uppercase tracking-wide">Quick Start Tour</p>
                <p className="text-xs text-slate-500">{steps.length - 1} features · about 30 seconds</p>
              </div>
              <button onClick={dismiss} className="ml-auto text-slate-500 hover:text-white transition-colors p-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="p-5">
            {(!isFirst || !isOnboarding) && (
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-xs text-primary font-medium">
                    {isOnboarding ? `${currentStep} of ${steps.length - 1}` : `Step ${currentStep + 1} of ${steps.length}`}
                  </span>
                </div>
                <button onClick={dismiss} className="text-slate-500 hover:text-white transition-colors p-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <h3 className="text-white font-semibold text-base mb-1.5 leading-snug">{step.title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-4">{step.description}</p>

            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className={`rounded-full transition-all duration-300 ${
                      i === currentStep ? "w-4 h-1.5 bg-primary" : i < currentStep ? "w-1.5 h-1.5 bg-primary/40" : "w-1.5 h-1.5 bg-white/15"
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {isFirst && isOnboarding ? (
                  <Button variant="ghost" size="sm" onClick={dismiss} className="text-slate-500 hover:text-white h-8 px-3 text-xs">
                    Skip
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={prev} disabled={isFirst} className="text-slate-400 hover:text-white h-8 px-3 text-xs">
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
                  </Button>
                )}
                <Button size="sm" onClick={next} className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 px-4 text-xs font-medium">
                  {isLast ? "Done" : isFirst && isOnboarding ? "Let's go →" : "Next"}
                  {!isLast && !(isFirst && isOnboarding) && <ArrowRight className="w-3.5 h-3.5 ml-1" />}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {!isCentered && arrowDirection !== "none" && (
          <div className="absolute w-0 h-0" style={{ ...arrowStyle, ...arrowBorder[arrowDirection], position: "absolute" }} />
        )}
      </div>
    </>
  );
}

export function GuidedTour() {
  const engine = useTourEngine(TOUR_STEPS);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      const timer = setTimeout(() => engine.setActive(true), 900);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const handleDismiss = useCallback(() => {
    engine.dismiss();
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
  }, [engine.dismiss]);

  if (!engine.active) return null;

  return (
    <TourOverlay
      steps={TOUR_STEPS}
      currentStep={engine.currentStep}
      tooltipStyle={engine.tooltipStyle}
      arrowStyle={engine.arrowStyle}
      arrowDirection={engine.arrowDirection}
      tooltipRef={engine.tooltipRef}
      dismiss={handleDismiss}
      next={() => {
        if (engine.currentStep < TOUR_STEPS.length - 1) {
          engine.setCurrentStep(prev => prev + 1);
        } else {
          handleDismiss();
        }
      }}
      prev={() => {
        if (engine.currentStep > 0) engine.setCurrentStep(prev => prev - 1);
      }}
      isOnboarding={true}
    />
  );
}

export function FeatureTourRunner() {
  const [tourKey, setTourKey] = useState<FeatureTourKey | null>(null);

  useEffect(() => {
    const key = sessionStorage.getItem(FEATURE_TOUR_SESSION_KEY) as FeatureTourKey | null;
    if (key && FEATURE_TOURS[key]) {
      sessionStorage.removeItem(FEATURE_TOUR_SESSION_KEY);
      const timer = setTimeout(() => setTourKey(key), 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  if (!tourKey) return null;
  return <FeatureTourOverlay tourKey={tourKey} onDone={() => setTourKey(null)} />;
}

function FeatureTourOverlay({ tourKey, onDone }: { tourKey: FeatureTourKey; onDone: () => void }) {
  const steps = FEATURE_TOURS[tourKey];
  const engine = useTourEngine(steps);

  useEffect(() => {
    engine.setActive(true);
    engine.setCurrentStep(0);
  }, []);

  if (!engine.active) {
    onDone();
    return null;
  }

  return (
    <TourOverlay
      steps={steps}
      currentStep={engine.currentStep}
      tooltipStyle={engine.tooltipStyle}
      arrowStyle={engine.arrowStyle}
      arrowDirection={engine.arrowDirection}
      tooltipRef={engine.tooltipRef}
      dismiss={() => { engine.dismiss(); onDone(); }}
      next={() => {
        if (engine.currentStep < steps.length - 1) {
          engine.setCurrentStep(prev => prev + 1);
        } else {
          engine.dismiss();
          onDone();
        }
      }}
      prev={() => {
        if (engine.currentStep > 0) engine.setCurrentStep(prev => prev - 1);
      }}
      isOnboarding={false}
    />
  );
}

export function resetTour() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
}
