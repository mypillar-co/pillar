import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useOrgConfig } from "@/contexts/OrgConfigContext";

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [loc] = useLocation();
  const { config, loading } = useOrgConfig();

  const active = (p: string) => (loc === p || (p !== "/" && loc.startsWith(p)) ? "active" : "");

  const initials = loading
    ? "…"
    : config.shortName ??
      config.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 3)
        .toUpperCase();

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-brand">
          <div className="nav-logo-badge">{initials}</div>
          <span>{loading ? "" : config.name}</span>
        </Link>

        <button className="nav-mobile-toggle" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? "✕" : "☰"}
        </button>

        <ul
          className={`nav-links${open ? " open" : ""}`}
          onClick={() => setOpen(false)}
          style={open ? { overflowY: "auto", maxHeight: "calc(100vh - 64px)" } : undefined}
        >
          <li><Link href="/" className={active("/")}>Home</Link></li>
          <li><Link href="/events" className={active("/events")}>Events</Link></li>
          <li><Link href="/blog" className={active("/blog")}>News</Link></li>
          <li><Link href="/gallery" className={active("/gallery")}>Gallery</Link></li>
          <li><Link href="/about" className={active("/about")}>About</Link></li>
          <li><Link href="/contact" className={active("/contact")}>Contact</Link></li>
          <li><Link href="/contact" className="nav-cta">Get Involved</Link></li>
        </ul>
      </div>
    </nav>
  );
}
