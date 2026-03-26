import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetOrganization } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Events", href: "/dashboard/events", icon: Calendar },
  { label: "Vendors", href: "/dashboard/vendors", icon: Users },
  { label: "Sponsors", href: "/dashboard/sponsors", icon: Star },
  { label: "Payments", href: "/dashboard/payments", icon: DollarSign },
  { label: "Contacts", href: "/dashboard/contacts", icon: Contact2 },
  { label: "Site Builder", href: "/dashboard/site", icon: Globe },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
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
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150",
          isActive
            ? "bg-primary/15 text-primary font-medium"
            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
        )}
      >
        <item.icon className={cn("flex-shrink-0", collapsed ? "w-5 h-5" : "w-4.5 h-4.5")} />
        {!collapsed && <span className="text-sm truncate">{item.label}</span>}
      </div>
    </Link>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isLoading: authLoading } = useAuth();
  const { data: orgData, isLoading: orgLoading } = useGetOrganization();
  const org = orgData?.organization;
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (authLoading || orgLoading) return;
    if (!user) {
      setLocation("/");
      return;
    }
    if (!org) {
      setLocation("/onboard");
    }
  }, [user, authLoading, org, orgLoading, setLocation]);

  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
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
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-white tracking-tight">Steward</span>
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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400"
            onClick={() => setMobileOpen(false)}
          >
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

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed && !mobile} onClick={mobile ? () => setMobileOpen(false) : undefined} />
        ))}
      </nav>

      {/* Bottom Nav */}
      <div className="px-2 py-3 border-t border-white/8 space-y-0.5">
        {BOTTOM_NAV.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed && !mobile} onClick={mobile ? () => setMobileOpen(false) : undefined} />
        ))}
        {(!collapsed || mobile) && user && (
          <div className="flex items-center gap-2.5 px-3 py-2 mt-1">
            <img
              src={user.profileImageUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${user.firstName}`}
              alt={user.firstName ?? "User"}
              className="w-6 h-6 rounded-full flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs text-white truncate">{[user.firstName, user.lastName].filter(Boolean).join(" ")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col border-r border-white/8 bg-[hsl(224,40%,10%)] transition-all duration-200 flex-shrink-0",
          collapsed ? "w-16" : "w-56"
        )}
      >
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="font-bold text-white text-sm">Steward</span>
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
