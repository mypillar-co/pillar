import React from "react";
import { Link } from "wouter";
import { Shield } from "lucide-react";
import { useAuth, LoginButton, LogoutButton } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <header className="fixed top-0 inset-x-0 z-50 glass-panel border-b border-white/10 bg-background/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-all duration-300 group-hover:scale-105">
              <Shield className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-2xl tracking-tight text-white group-hover:text-primary transition-colors">
              Steward
            </span>
          </Link>

          <nav className="flex items-center gap-4">
            {!isLoading && (
              <>
                {isAuthenticated ? (
                  <>
                    <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors mr-2">
                      Dashboard
                    </Link>
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
