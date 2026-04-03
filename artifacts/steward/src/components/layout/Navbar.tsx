import React, { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Shield, Bell, X, ChevronDown, Building2, Users, Home, BookOpen, Heart, GraduationCap } from "lucide-react";
import { useAuth, LoginButton, LogoutButton } from "@workspace/replit-auth-web";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

const VERTICALS = [
  { href: "/for/lodges", label: "Masonic & Fraternal Lodges", icon: Shield },
  { href: "/for/rotary", label: "Rotary & Service Clubs", icon: Users },
  { href: "/for/vfw", label: "Veterans Organizations", icon: BookOpen },
  { href: "/for/hoa", label: "Homeowner Associations", icon: Home },
  { href: "/for/pta", label: "PTAs & School Groups", icon: GraduationCap },
  { href: "/for/nonprofits", label: "Nonprofits", icon: Heart },
];

function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json() as { notifications: Notification[]; unreadCount: number };
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "PUT", credentials: "include" });
      setNotifications(n => n.map(notif => ({ ...notif, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const markRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PUT", credentials: "include" });
      setNotifications(n => n.map(notif => notif.id === id ? { ...notif, read: true } : notif));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const typeColor: Record<string, string> = {
    domain_expiry_warning: "text-amber-400",
    domain_expired: "text-red-400",
    domain_renewed: "text-emerald-400",
    domain_live: "text-emerald-400",
    domain_renewal_failed: "text-red-400",
    ssl_active: "text-emerald-400",
    ssl_failed: "text-red-400",
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-white"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] bg-card border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-white/10">
            <span className="text-sm font-semibold text-white">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-muted-foreground hover:text-white transition-colors">
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">No notifications</div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`w-full text-left p-3 border-b border-white/5 hover:bg-white/5 transition-colors ${!n.read ? "bg-white/3" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                    <div className={n.read ? "pl-3.5" : ""}>
                      <p className={`text-xs font-semibold ${typeColor[n.type] ?? "text-white"}`}>{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-1">{new Date(n.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SolutionsDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-white transition-colors"
      >
        Solutions
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-64 bg-card border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden py-1">
          {VERTICALS.map(v => {
            const Icon = v.icon;
            return (
              <Link
                key={v.href}
                href={v.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors group"
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{v.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <header className="fixed top-0 inset-x-0 z-50 glass-panel border-b border-white/10 bg-background/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <Link href="/" className="flex items-center gap-3 group">
            <img src="/pillar-logo.svg" alt="Pillar" className="w-9 h-9 group-hover:scale-105 transition-transform duration-300" />
            <span className="font-display font-bold text-2xl tracking-tight text-white group-hover:text-primary transition-colors">
              Pillar
            </span>
          </Link>

          <nav className="flex items-center gap-5">
            {!isLoading && (
              <>
                {!isAuthenticated && <SolutionsDropdown />}
                {isAuthenticated ? (
                  <>
                    <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">
                      Dashboard
                    </Link>
                    <NotificationBell />
                    <LogoutButton className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-11 px-6 py-2 border-2 border-primary/20 bg-transparent text-primary hover:border-primary hover:bg-primary/10 cursor-pointer" />
                  </>
                ) : (
                  <LoginButton className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-11 px-6 py-2 bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 cursor-pointer" />
                )}
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
