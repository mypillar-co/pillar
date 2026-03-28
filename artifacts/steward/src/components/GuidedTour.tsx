import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TourStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="overview"]',
    title: "Welcome to Steward",
    description: "This is your command center. See your organization's activity at a glance — upcoming events, site status, and quick actions.",
    position: "right",
  },
  {
    target: '[data-tour="site-builder"]',
    title: "AI Website Builder",
    description: "Build a professional website in minutes. Just answer a few questions and our AI creates a polished, mobile-ready site for your organization.",
    position: "right",
  },
  {
    target: '[data-tour="events"]',
    title: "Event Management",
    description: "Create events, sell tickets, manage RSVPs, and track attendance — all from one dashboard. Your events sync to your website automatically.",
    position: "right",
  },
  {
    target: '[data-tour="social"]',
    title: "Social Media Automation",
    description: "Connect Facebook, Instagram, and X. Compose posts, schedule them, or let AI generate and publish content automatically.",
    position: "right",
  },
  {
    target: '[data-tour="payments"]',
    title: "Payments & Revenue",
    description: "Connect your Stripe account to collect ticket sales, vendor fees, and donations. Track all your revenue in one place.",
    position: "right",
  },
];

const TOUR_STORAGE_KEY = "steward-tour-completed";

export function GuidedTour() {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const [arrowDirection, setArrowDirection] = useState<"top" | "bottom" | "left" | "right">("left");
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const positionTooltip = useCallback(() => {
    const step = TOUR_STEPS[currentStep];
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const tooltipW = 340;
    const tooltipH = tooltipRef.current?.offsetHeight ?? 200;
    const gap = 16;

    let top = 0;
    let left = 0;
    let aTop = 0;
    let aLeft = 0;
    let dir: "top" | "bottom" | "left" | "right" = step.position;

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
    window.addEventListener("resize", positionTooltip);
    return () => window.removeEventListener("resize", positionTooltip);
  }, [active, currentStep, positionTooltip]);

  useEffect(() => {
    if (!active) return;
    const step = TOUR_STEPS[currentStep];
    if (!step) return;
    const el = document.querySelector(step.target);
    if (el) {
      (el as HTMLElement).style.position = "relative";
      (el as HTMLElement).style.zIndex = "60";
      (el as HTMLElement).style.borderRadius = "8px";
      (el as HTMLElement).style.boxShadow = "0 0 0 4px hsl(43, 96%, 56%, 0.4)";
      (el as HTMLElement).style.transition = "box-shadow 0.3s ease";
    }
    return () => {
      if (el) {
        (el as HTMLElement).style.zIndex = "";
        (el as HTMLElement).style.boxShadow = "";
      }
    };
  }, [active, currentStep]);

  const dismiss = useCallback(() => {
    setActive(false);
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
    TOUR_STEPS.forEach(step => {
      const el = document.querySelector(step.target);
      if (el) {
        (el as HTMLElement).style.zIndex = "";
        (el as HTMLElement).style.boxShadow = "";
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

  const arrowBorder = {
    top: { borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: "6px solid hsl(43, 96%, 56%)" },
    bottom: { borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid hsl(43, 96%, 56%)" },
    left: { borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderRight: "6px solid hsl(43, 96%, 56%)" },
    right: { borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: "6px solid hsl(43, 96%, 56%)" },
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 transition-opacity duration-300"
        onClick={dismiss}
      />
      <div
        ref={tooltipRef}
        className="fixed z-[60] animate-in fade-in slide-in-from-bottom-2 duration-300"
        style={tooltipStyle}
      >
        <div className="bg-[hsl(224,40%,12%)] border border-primary/40 rounded-xl shadow-2xl shadow-primary/10 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs text-primary font-medium">
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </span>
            </div>
            <button
              onClick={dismiss}
              className="text-slate-500 hover:text-white transition-colors p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <h3 className="text-white font-semibold text-base mb-1.5">{step.title}</h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">{step.description}</p>

          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === currentStep ? "bg-primary" : i < currentStep ? "bg-primary/40" : "bg-white/15"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={prev}
                  className="text-slate-400 hover:text-white h-8 px-3 text-xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
                </Button>
              )}
              {isFirst && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={dismiss}
                  className="text-slate-500 hover:text-white h-8 px-3 text-xs"
                >
                  Skip tour
                </Button>
              )}
              <Button
                size="sm"
                onClick={next}
                className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 px-4 text-xs font-medium"
              >
                {isLast ? "Get Started" : "Next"} {!isLast && <ArrowRight className="w-3.5 h-3.5 ml-1" />}
              </Button>
            </div>
          </div>
        </div>
        <div
          className="absolute w-0 h-0"
          style={{ ...arrowStyle, ...arrowBorder[arrowDirection], position: "absolute" }}
        />
      </div>
    </>
  );
}

export function resetTour() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
}
