import { Link } from "wouter";
import { useOrgConfig } from "@/contexts/OrgConfigContext";

export default function Footer() {
  const year = new Date().getFullYear();
  const { config, loading } = useOrgConfig();

  if (loading) {
    return (
      <footer className="footer">
        <div className="container">
          <div style={{ padding: "2rem 0", opacity: 0.4 }}>Loading…</div>
        </div>
      </footer>
    );
  }

  const { name, contact, meeting, footer: footerCfg, parentOrg } = config;
  const parentName = footerCfg?.parentName ?? parentOrg;
  const parentUrl = footerCfg?.parentUrl;

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <h3>{name}</h3>
            <p>
              {config.about.description1}
            </p>
            {footerCfg?.badge && (
              <span className="footer-badge">{footerCfg.badge}</span>
            )}
            {parentName && (
              <p style={{ fontSize: "0.8rem", opacity: 0.7, marginTop: "0.75rem" }}>
                {parentUrl
                  ? <>Member of <a href={parentUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>{parentName}</a></>
                  : <>Member of {parentName}</>
                }
              </p>
            )}
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
              {parentUrl && parentName && (
                <li>
                  <a href={parentUrl} target="_blank" rel="noopener noreferrer">
                    {parentName}
                  </a>
                </li>
              )}
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul className="footer-links">
              {contact.address && <li>{contact.address}</li>}
              {contact.phone && (
                <li><a href={`tel:${contact.phone.replace(/\D/g, "")}`}>{contact.phone}</a></li>
              )}
              {contact.email && (
                <li><a href={`mailto:${contact.email}`}>{contact.email}</a></li>
              )}
              {meeting?.schedule && (
                <li style={{ fontSize: "0.8rem", opacity: 0.6, marginTop: "0.5rem" }}>
                  {meeting.schedule}
                  {meeting.venue && <><br />{meeting.venue}</>}
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {year} {name}. All rights reserved.</span>
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
            <Link href="/contact">Contact</Link>
            <Link href="/admin">Admin</Link>
            <a
              href="https://mypillar.co"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "0.75rem", opacity: 0.5 }}
            >
              Powered by Pillar
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
