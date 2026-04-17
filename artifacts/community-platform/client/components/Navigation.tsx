import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useConfig } from "../config-context";

export default function Navigation() {
  const config = useConfig();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!config) return null;

  const links = [
    { href: "/", label: "Home" },
    { href: "/events", label: "Events" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
    { href: "/gallery", label: "Gallery" },
    ...(config.features?.blog ? [{ href: "/blog", label: "News" }] : []),
    ...(config.features?.businessDirectory ? [{ href: "/businesses", label: "Directory" }] : []),
    ...(config.features?.members ? [{ href: "/members", label: "Members" }] : []),
  ];

  const shortName = config.shortName || config.orgName.split(" ").map(w => w[0]).join("").slice(0, 3);

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer">
            {config.logoUrl ? (
              <img src={config.logoUrl} alt={config.orgName} className="h-9 w-auto" />
            ) : (
              <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ backgroundColor: "var(--primary-hex)" }}>
                <span className="text-white font-bold text-sm font-serif">{shortName.slice(0, 2)}</span>
              </div>
            )}
            <span className="font-semibold text-sm text-gray-800 hidden sm:block">{config.orgName}</span>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map(link => (
            <Link key={link.href} href={link.href}>
              <span className={`px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${location === link.href ? "text-white" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"}`}
                style={location === link.href ? { backgroundColor: "var(--primary-hex)" } : {}}>
                {link.label}
              </span>
            </Link>
          ))}
        </div>

        <button
          className="md:hidden p-2 text-gray-600"
          onClick={() => setMobileOpen(v => !v)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 flex flex-col gap-1">
          {links.map(link => (
            <Link key={link.href} href={link.href}>
              <span
                className="block px-3 py-2 rounded-md text-sm font-medium cursor-pointer"
                style={location === link.href ? { backgroundColor: "var(--primary-hex)", color: "white" } : { color: "#374151" }}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </span>
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
