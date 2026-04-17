import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Star,
  DollarSign,
  Contact2,
  Globe,
  Settings,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Building2,
  Menu,
  X,
  Zap,
  Loader2,
  LinkIcon,
  Share2,
  Sparkles,
  Vote,
  HelpCircle,
  ClipboardList,
  ShoppingBag,
  LogOut,
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetOrganization } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GuidedTour, FeatureTourRunner } from "@/components/GuidedTour";
import { useToast } from "@/hooks/use-toast";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  tourId?: string;
};

type NavSection = {
  title?: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard, tourId: "overview" },
      { label: "Autopilot", href: "/dashboard/autopilot", icon: Sparkles },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Registrations", href: "/dashboard/registrations", icon: ClipboardList },
      { label: "Approvals", href: "/dashboard/board-links", icon: Vote },
      { label: "Payments", href: "/dashboard/payments", icon: DollarSign, tourId: "payments" },
    ],
  },
  {
    title: "Events & Content",
    items: [
      { label: "Events", href: "/dashboard/events", icon: Calendar, tourId: "events" },
      { label: "Communications", href: "/dashboard/social", icon: Share2, tourId: "social" },
      { label: "Content Studio", href: "/dashboard/studio", icon: Sparkles },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Contacts", href: "/dashboard/contacts", icon: Contact2 },
      { label: "Members", href: "/dashboard/members", icon: Users },
      { label: "Sponsors", href: "/dashboard/sponsors", icon: Star },
      { label: "Vendors", href: "/dashboard/vendors", icon: ShoppingBag },
    ],
  },
  {
    title: "Presence",
    items: [
      { label: "Website", href: "/dashboard/site", icon: Globe, tourId: "site-builder" },
      { label: "Domain", href: "/dashboard/domains", icon: LinkIcon },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
      { label: "Help & Support", href: "/dashboard/help", icon: HelpCircle },
    ],
  },
];

const BOTTOM_NAV: NavItem[] = [
  { label: "Billing", href: "/billing", icon: CreditCard },
];

function NavLink({ item, collapsed, onClick }: { item: NavItem; collapsed: boolean; onClick?: () => void }) {
  const [location] = useLocation();
  const isActive = item.href === "/dashboard"
    ? location === "/dashboard"
    : location.startsWith(item.href);
  return (
    <Link href={item.href} onClick={onClick}>
      <div
        data-tour={item.tourId}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150",
          isActive
            ? "bg-primary/15 text-primary font-medium"
            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
        )}
      >
        <item.icon className={cn("flex-shrink-0 w-4 h-4")} />
        {!collapsed && <span className="text-sm truncate">{item.label}</span>}
      </div>
    </Link>
  );
}

const IDLE_WARN_MS  = 25 * 60 * 1000; // 25 min
const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 min

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isLoading: authLoading, logout } = useAuth();
  const { data: orgData, isLoading: orgLoading } = useGetOrganization();
  const org = orgData?.organization;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const lastActivityRef = useRef(Date.now());
  const warnedRef = useRef(false);

  // Idle timer — check every 30 s and also on tab-focus (browsers throttle intervals in bg tabs)
  useEffect(() => {
    if (!user) return;

    const ACTIVITY_KEY = "pillar_last_activity";

    // Persist activity time in localStorage so background-tab throttling can't mask it
    const markActivity = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      try { localStorage.setItem(ACTIVITY_KEY, String(now)); } catch { /* ignore */ }
      if (warnedRef.current) warnedRef.current = false;
    };

    // Seed from localStorage in case we're coming back from a long bg period
    try {
      const stored = localStorage.getItem(ACTIVITY_KEY);
      if (stored) lastActivityRef.current = Math.min(lastActivityRef.current, Number(stored));
    } catch { /* ignore */ }

    const checkIdle = () => {
      // Also read from localStorage in case another tab updated it
      try {
        const stored = localStorage.getItem(ACTIVITY_KEY);
        if (stored) lastActivityRef.current = Math.max(lastActivityRef.current, Number(stored));
      } catch { /* ignore */ }

      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_LIMIT_MS) {
        logout();
        return;
      }
      if (idle >= IDLE_WARN_MS && !warnedRef.current) {
        warnedRef.current = true;
        toast({
          title: "Still there?",
          description: "You'll be signed out in 5 minutes due to inactivity.",
          duration: 5 * 60 * 1000,
        });
      }
    };

    const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    EVENTS.forEach(e => window.addEventListener(e, markActivity, { passive: true }));

    // Check on visibility change — catches background-tab idle
    const onVisibility = () => { if (document.visibilityState === "visible") checkIdle(); };
    document.addEventListener("visibilitychange", onVisibility);

    // Poll every 30 s (reduced from 60 s for faster response)
    const interval = setInterval(checkIdle, 30_000);

    return () => {
      EVENTS.forEach(e => window.removeEventListener(e, markActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, [user, logout, toast]);

  useEffect(() => {
    if (authLoading || orgLoading) return;
    if (!user) { setLocation("/"); return; }
    if (!org) setLocation("/onboard");
  }, [user, authLoading, org, orgLoading, setLocation]);

  if (authLoading || orgLoading) {
    return (
      <div className="flex items-center justify-center bg-background" style={{ minHeight: "100dvh" }}>
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !org) return null;

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo + Collapse */}
      <div className={cn("flex items-center px-4 py-4 border-b border-white/8", collapsed && !mobile ? "justify-center" : "justify-between")}>
        {(!collapsed || mobile) && (
          <div className="flex items-center gap-2.5">
            <img src="/pillar-logo.svg" alt="Pillar" className="w-7 h-7" />
            <span className="font-bold text-white tracking-tight">Pillar</span>
          </div>
        )}
        {!mobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-white hover:bg-white/5"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        )}
        {mobile && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400" onClick={() => setMobileOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Org Name */}
      {(!collapsed || mobile) && org && (
        <div className="px-4 py-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary/20 rounded-md flex items-center justify-center flex-shrink-0">
              <Building2 className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">{org.name}</p>
              <p className="text-xs text-slate-500 truncate capitalize">{org.type ?? "Organization"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Nav Sections */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-4">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si}>
            {section.title && !collapsed && (
              <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                {section.title}
              </p>
            )}
            {section.title && collapsed && !mobile && (
              <div className="h-px bg-white/6 mx-2 mb-1" />
            )}
            <div className="space-y-0.5">
              {section.items.map(item => (
                <NavLink
                  key={item.href}
                  item={item}
                  collapsed={collapsed && !mobile}
                  onClick={mobile ? () => setMobileOpen(false) : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom Nav */}
      <div className="px-2 py-3 border-t border-white/8 space-y-0.5">
        {BOTTOM_NAV.map(item => (
          <NavLink key={item.href} item={item} collapsed={collapsed && !mobile} onClick={mobile ? () => setMobileOpen(false) : undefined} />
        ))}
        {/* User row + logout */}
        {(!collapsed || mobile) && user ? (
          <div className="flex items-center gap-2 px-3 py-2 mt-1 group">
            <img
              src={user.profileImageUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${user.firstName ?? user.email ?? "U"}`}
              alt={user.firstName ?? "User"}
              className="w-6 h-6 rounded-full flex-shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white truncate">{[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User"}</p>
            </div>
            <button
              onClick={() => logout()}
              title="Sign out"
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 flex-shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : collapsed && !mobile && user ? (
          <button
            onClick={() => logout()}
            title="Sign out"
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:bg-white/8 hover:text-slate-300 transition-colors mt-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex bg-background overflow-hidden" style={{ height: "100dvh" }}>
      <GuidedTour />
      <FeatureTourRunner />

      {/* Desktop sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col border-r border-white/8 bg-[hsl(224,40%,10%)] transition-all duration-200 flex-shrink-0",
        collapsed ? "w-14" : "w-56"
      )}>
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[hsl(224,40%,10%)] border-r border-white/8 flex flex-col">
            <SidebarContent mobile />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-white/8 bg-[hsl(224,40%,10%)]">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-11 w-11 text-slate-400" onClick={() => setMobileOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <img src="/pillar-logo.svg" alt="Pillar" className="w-6 h-6" />
              <span className="font-bold text-white text-sm">Pillar</span>
            </div>
          </div>
          {org && <p className="text-xs text-slate-400 truncate max-w-[140px]">{org.name}</p>}
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
