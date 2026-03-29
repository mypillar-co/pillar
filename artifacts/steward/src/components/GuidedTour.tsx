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
    title: "Welcome to Steward!",
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
    title: "AI Website Builder",
    description: "Build a professional website in minutes. Chat with AI, answer a few questions, and get a polished mobile-ready site — no design skills needed.",
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
    title: "Social Media on Autopilot",
    description: "Connect Facebook, Instagram, and X. Compose posts, schedule them, or let AI generate and publish content on a recurring schedule.",
    position: "right",
  },
  {
    target: '[data-tour="payments"]',
    title: "Payments & Revenue",
    description: "Connect Stripe to collect ticket sales, vendor fees, and donations. Every dollar tracked in one place with zero extra platforms.",
    position: "right",
  },
];

const TOUR_STORAGE_KEY = "steward-tour-completed";

export function GuidedTour() {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const [arrowDirection, setArrowDirection] = useState<"top" | "bottom" | "left" | "right" | "none">("left");
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      const timer = setTimeout(() => setActive(true), 900);
      return () => clearTimeout(timer);
    }
  }, []);

  const positionTooltip = useCallback(() => {
    const step = TOUR_STEPS[currentStep];
    if (!step) return;

    const tooltipW = 340;
    const tooltipH = tooltipRef.current?.offsetHeight ?? 220;
    const gap = 18;

    if (!step.target || step.position === "center") {
      setTooltipStyle({
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: tooltipW,
      });
      setArrowStyle({});
      setArrowDirection("none");
      return;
    }

    const el = document.querySelector(step.target);
    if (!el) return;
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
  }, [currentStep]);

  useEffect(() => {
    if (!active) return;
    positionTooltip();
    const onResize = () => positionTooltip();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, currentStep, positionTooltip]);

  useEffect(() => {
    if (!active) return;
    const step = TOUR_STEPS[currentStep];
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
  }, [active, currentStep]);

  const dismiss = useCallback(() => {
    setActive(false);
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
    TOUR_STEPS.forEach(step => {
      if (!step.target) return;
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (el) {
        el.style.zIndex = "";
        el.style.outline = "";
        el.style.outlineOffset = "";
        el.style.boxShadow = "";
      }
    });
  }, []);

  const next = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      dismiss();
    }
  };

  const prev = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  if (!active) return null;

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;
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
      <div
        className="fixed inset-0 z-50 bg-black/65 transition-opacity duration-300"
        onClick={dismiss}
      />

      <div
        ref={tooltipRef}
        className="fixed z-[60] animate-in fade-in duration-250"
        style={isCentered ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 360 } : tooltipStyle}
      >
        <div className="bg-[hsl(224,40%,14%)] border border-primary/50 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
          {isFirst && (
            <div className="px-5 pt-5 pb-3 flex items-center gap-3 border-b border-white/8">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-primary font-semibold uppercase tracking-wide">Quick Start Tour</p>
                <p className="text-xs text-slate-500">{TOUR_STEPS.length - 1} features · about 30 seconds</p>
              </div>
              <button
                onClick={dismiss}
                className="ml-auto text-slate-500 hover:text-white transition-colors p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="p-5">
            {!isFirst && (
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-xs text-primary font-medium">
                    {currentStep} of {TOUR_STEPS.length - 1}
                  </span>
                </div>
                <button
                  onClick={dismiss}
                  className="text-slate-500 hover:text-white transition-colors p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <h3 className="text-white font-semibold text-base mb-1.5 leading-snug">{step.title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-4">{step.description}</p>

            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {TOUR_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`rounded-full transition-all duration-300 ${
                      i === currentStep
                        ? "w-4 h-1.5 bg-primary"
                        : i < currentStep
                        ? "w-1.5 h-1.5 bg-primary/40"
                        : "w-1.5 h-1.5 bg-white/15"
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {isFirst ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={dismiss}
                    className="text-slate-500 hover:text-white h-8 px-3 text-xs"
                  >
                    Skip
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={prev}
                    className="text-slate-400 hover:text-white h-8 px-3 text-xs"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={next}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 px-4 text-xs font-medium"
                >
                  {isLast ? "Get Started" : isFirst ? "Let's go →" : "Next"}
                  {!isLast && !isFirst && <ArrowRight className="w-3.5 h-3.5 ml-1" />}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {!isCentered && arrowDirection !== "none" && (
          <div
            className="absolute w-0 h-0"
            style={{ ...arrowStyle, ...arrowBorder[arrowDirection], position: "absolute" }}
          />
        )}
      </div>
    </>
  );
}

export function resetTour() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
}
