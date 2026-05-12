import { useQuery } from "@tanstack/react-query";
import { useConfig } from "../config-context";
import { Link } from "wouter";

export default function AboutPage() {
  const config = useConfig();
  const { data: siteContent } = useQuery<Record<string, string>>({ queryKey: ["/api/site-content"] });
  if (!config) return null;

  const aboutHeading = siteContent?.about_heading || "Our Mission";
  const aboutCopy = siteContent?.about_mission || config.mission;

  return (
    <div>
      <section className="relative overflow-hidden py-20">
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, var(--primary-hex) 0%, var(--accent-hex) 100%)` }} />
        <div className="relative max-w-3xl mx-auto px-4 text-center text-white">
          <h1 className="text-4xl md:text-5xl font-bold font-serif mb-4">{config.orgName}</h1>
          {config.tagline && <p className="text-lg text-white/90 italic">{config.tagline}</p>}
        </div>
      </section>

      {aboutCopy && (
        <section className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold font-serif mb-6">{aboutHeading}</h2>
          <div className="text-gray-600 leading-relaxed text-lg whitespace-pre-line">{aboutCopy}</div>
        </section>
      )}

      {config.programs && config.programs.length > 0 && (
        <section className="bg-gray-50 py-16">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-2xl font-bold font-serif text-center mb-8">What We Do</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {config.programs.map(program => (
                <div key={program.title} className="p-6 border border-gray-200 rounded-lg bg-white">
                  <h3 className="font-semibold text-lg mb-2">{program.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{program.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {(config.meetingDay || config.contactAddress) && (
        <section className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold font-serif mb-6">Find Us</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {config.meetingDay && (
              <div className="p-5 border border-gray-200 rounded-lg">
                <h3 className="font-semibold mb-2">📅 Meeting Schedule</h3>
                <p className="text-gray-600 text-sm">{config.meetingDay}</p>
                {config.meetingTime && <p className="text-gray-600 text-sm">{config.meetingTime}</p>}
                {config.meetingLocation && <p className="text-gray-600 text-sm">{config.meetingLocation}</p>}
              </div>
            )}
            {config.contactAddress && (
              <div className="p-5 border border-gray-200 rounded-lg">
                <h3 className="font-semibold mb-2">📍 Address</h3>
                <p className="text-gray-600 text-sm">{config.contactAddress}</p>
                {config.mailingAddress && <p className="text-gray-600 text-sm mt-1">Mailing: {config.mailingAddress}</p>}
              </div>
            )}
          </div>
        </section>
      )}

      {config.partners && config.partners.length > 0 && (
        <section className="bg-gray-50 py-16">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-2xl font-bold font-serif text-center mb-8">Our Partners</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {config.partners.map(partner => (
                <div key={partner.name} className="p-4 border border-gray-200 rounded-lg bg-white text-center">
                  <p className="font-semibold text-sm">{partner.name}</p>
                  {partner.description && <p className="text-xs text-gray-500 mt-1">{partner.description}</p>}
                  {partner.website && (
                    <a href={partner.website} target="_blank" rel="noopener noreferrer" className="text-xs mt-2 block" style={{ color: "var(--accent-hex)" }}>Visit →</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold font-serif mb-4">Get Involved</h2>
          <p className="text-gray-500 mb-6">We'd love to have you join our community. Reach out to learn more about membership and volunteering.</p>
          <Link href="/contact">
            <button className="px-6 py-3 text-white rounded-md font-medium" style={{ backgroundColor: "var(--primary-hex)" }}>Contact Us</button>
          </Link>
        </div>
      </section>
    </div>
  );
}
