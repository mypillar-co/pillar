import { Link } from "wouter";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <h3>Norwin Rotary Club</h3>
            <p>
              A Rotary International service club serving the Norwin community through local
              projects, scholarships, and fellowship since 1972. Service Above Self.
            </p>
            <span className="footer-badge">Rotary International Member</span>
          </div>
          <div>
            <h4>Quick Links</h4>
            <ul className="footer-links">
              <li><Link href="/">Home</Link></li>
              <li><Link href="/events">Events</Link></li>
              <li><Link href="/blog">News</Link></li>
              <li><Link href="/gallery">Gallery</Link></li>
            </ul>
          </div>
          <div>
            <h4>Organization</h4>
            <ul className="footer-links">
              <li><Link href="/about">About Us</Link></li>
              <li><Link href="/about#programs">Programs</Link></li>
              <li><Link href="/contact">Get Involved</Link></li>
              <li><a href="https://www.rotary.org" target="_blank" rel="noopener noreferrer">Rotary International</a></li>
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul className="footer-links">
              <li>Irwin, PA 15642</li>
              <li><a href="tel:7245550142">(724) 555-0142</a></li>
              <li><a href="mailto:info@norwinrotary.org">info@norwinrotary.org</a></li>
              <li style={{ fontSize: "0.8rem", opacity: 0.6, marginTop: "0.5rem" }}>
                Every Tuesday, 12:00 PM<br />Irwin Fire Hall
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {year} Norwin Rotary Club. All rights reserved.</span>
          <div style={{ display: "flex", gap: "1.5rem" }}>
            <Link href="/contact">Contact</Link>
            <Link href="/admin">Admin</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
