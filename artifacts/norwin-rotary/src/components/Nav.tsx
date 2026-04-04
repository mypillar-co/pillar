import { useState } from "react";
import { Link, useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function path(p: string) {
  return `${BASE}${p}`;
}

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [loc] = useLocation();

  const active = (p: string) => (loc === p || (p !== "/" && loc.startsWith(p)) ? "active" : "");

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href={path("/")} className="nav-brand">
          <div className="nav-logo-badge">NR</div>
          <span>Norwin Rotary Club</span>
        </Link>

        <button className="nav-mobile-toggle" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? "✕" : "☰"}
        </button>

        <ul className={`nav-links${open ? " open" : ""}`} onClick={() => setOpen(false)}>
          <li><Link href={path("/")} className={active("/")}>Home</Link></li>
          <li><Link href={path("/events")} className={active("/events")}>Events</Link></li>
          <li><Link href={path("/blog")} className={active("/blog")}>News</Link></li>
          <li><Link href={path("/gallery")} className={active("/gallery")}>Gallery</Link></li>
          <li><Link href={path("/about")} className={active("/about")}>About</Link></li>
          <li><Link href={path("/contact")} className={active("/contact")}>Contact</Link></li>
          <li><Link href={path("/contact")} className="nav-cta">Get Involved</Link></li>
        </ul>
      </div>
    </nav>
  );
}
