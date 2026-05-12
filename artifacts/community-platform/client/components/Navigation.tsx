import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Facebook, Instagram, Twitter } from "lucide-react";
import { useConfig } from "../config-context";

export default function Navigation() {
  const config = useConfig();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!config) return null;

  const hasMembersPortal =
    config.features?.members === true ||
    Boolean(config.features?.membersPortal) ||
    (config.memberCount ?? 0) > 0;

  const links = [
    { href: "/", label: "Home" },
    { href: "/events", label: "Events" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
    { href: "/gallery", label: "Gallery" },
    ...(config.features?.blog ? [{ href: "/blog", label: "News" }] : []),
    ...(config.features?.businessDirectory ? [{ href: "/businesses", label: "Directory" }] : []),
    ...(config.features?.customPages ?? [])
      .filter(page => page.showInNav !== false)
      .map(page => ({ href: `/${page.slug}`, label: page.navLabel || page.title })),
    ...(hasMembersPortal ? [{ href: "/members", label: "Members" }] : []),
  ];

  const shortName = config.shortName || config.orgName.split(" ").map(w => w[0]).join("").slice(0, 3);
  const socialLinks = [
    config.socialFacebook ? { href: config.socialFacebook, label: "Facebook", icon: Facebook } : null,
    config.socialInstagram ? { href: config.socialInstagram, label: "Instagram", icon: Instagram } : null,
    config.socialTwitter ? { href: config.socialTwitter, label: "X", icon: Twitter } : null,
  ].filter(Boolean) as Array<{ href: string; label: string; icon: typeof Facebook }>;

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
          {socialLinks.length > 0 && (
            <div className="ml-2 flex items-center gap-1 border-l border-gray-200 pl-2">
              {socialLinks.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.label}
                  className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                >
                  <link.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          )}
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
          {socialLinks.length > 0 && (
            <div className="flex items-center gap-1 px-3 pt-2">
              {socialLinks.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.label}
                  className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                >
                  <link.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
