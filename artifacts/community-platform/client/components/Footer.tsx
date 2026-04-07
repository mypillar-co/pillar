import { Link } from "wouter";
import { useConfig } from "../config-context";

export default function Footer() {
  const config = useConfig();
  if (!config || config._empty) return null;

  const shortName = config.shortName || config.orgName.split(" ").map(w => w[0]).join("").slice(0, 3);

  return (
    <footer className="bg-gray-900 text-gray-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              {config.logoUrl ? (
                <img src={config.logoUrl} alt={config.orgName} className="h-8 w-auto" />
              ) : (
                <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: "var(--primary-hex)" }}>
                  <span className="text-white font-bold text-xs font-serif">{shortName.slice(0, 2)}</span>
                </div>
              )}
              <span className="text-white font-semibold text-sm">{config.orgName}</span>
            </div>
            {config.footerText ? (
              <p className="text-sm text-gray-400 leading-relaxed">{config.footerText}</p>
            ) : config.tagline ? (
              <p className="text-sm text-gray-400 italic">{config.tagline}</p>
            ) : null}
          </div>

          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              {[
                { href: "/", label: "Home" },
                { href: "/events", label: "Events" },
                { href: "/about", label: "About" },
                { href: "/contact", label: "Contact" },
                { href: "/gallery", label: "Gallery" },
                ...(config.features?.blog ? [{ href: "/blog", label: "News" }] : []),
              ].map(link => (
                <li key={link.href}>
                  <Link href={link.href}>
                    <span className="hover:text-white transition-colors cursor-pointer">{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Contact</h4>
            <ul className="space-y-2 text-sm">
              {config.contactAddress && <li>📍 {config.contactAddress}</li>}
              {config.contactPhone && <li>📞 {config.contactPhone}</li>}
              {config.contactEmail && <li>✉️ <a href={`mailto:${config.contactEmail}`} className="hover:text-white transition-colors">{config.contactEmail}</a></li>}
              {config.meetingDay && <li>📅 {config.meetingDay}{config.meetingTime ? `, ${config.meetingTime}` : ""}</li>}
              {config.meetingLocation && <li>🏠 {config.meetingLocation}</li>}
            </ul>
            {(config.socialFacebook || config.socialInstagram || config.socialTwitter) && (
              <div className="flex gap-3 mt-4">
                {config.socialFacebook && <a href={config.socialFacebook} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors text-xs">Facebook</a>}
                {config.socialInstagram && <a href={config.socialInstagram} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors text-xs">Instagram</a>}
                {config.socialTwitter && <a href={config.socialTwitter} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors text-xs">X / Twitter</a>}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-6 text-center text-xs text-gray-500">
          <p>© {new Date().getFullYear()} {config.orgName}. All rights reserved. Powered by <a href="https://mypillar.co" className="hover:text-gray-300 transition-colors">Pillar</a>.</p>
        </div>
      </div>
    </footer>
  );
}
