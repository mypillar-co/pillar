import { useQuery } from "@tanstack/react-query";
import { useConfig } from "../config-context";
import { Link } from "wouter";
import {
  configuredPageSections,
  editAttrs,
  editableCopySections,
  pageSectionBlock,
  pageSectionOrder,
  pageSectionVisible,
  textOr,
} from "../lib/pageSections";

export default function AboutPage() {
  const config = useConfig();
  const { data: siteContent } = useQuery<Record<string, string>>({ queryKey: ["/api/site-content"] });
  if (!config) return null;

  const aboutHeading = siteContent?.about_heading || "Our Mission";
  const aboutCopy = siteContent?.about_mission || config.mission;
  const sections = configuredPageSections(config, "about", [
    { id: "about-hero", type: "page_hero", title: config.orgName, body: config.tagline ?? "", visible: true },
    { id: "about-intro", type: "about_intro", title: aboutHeading, body: aboutCopy ?? "", visible: true },
    { id: "about-programs", type: "programs", title: "What We Do", visible: true },
    { id: "about-find-us", type: "find_us", title: "Find Us", visible: true },
    { id: "about-partners", type: "partners", title: "Our Partners", visible: true },
    {
      id: "about-cta",
      type: "cta",
      title: "Get Involved",
      body: "We'd love to have you join our community. Reach out to learn more about membership and volunteering.",
      visible: true,
    },
  ]);
  const hero = pageSectionBlock(sections, "page_hero");
  const intro = pageSectionBlock(sections, "about_intro");
  const programs = pageSectionBlock(sections, "programs");
  const findUs = pageSectionBlock(sections, "find_us");
  const partners = pageSectionBlock(sections, "partners");
  const cta = pageSectionBlock(sections, "cta");
  const extraSections = editableCopySections(sections);

  return (
    <div className="flex flex-col">
      {pageSectionVisible(sections, "page_hero") && (
      <section data-testid="page-section-about-page_hero" style={{ order: pageSectionOrder(sections, "page_hero", 0) }} className="relative overflow-hidden py-20">
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, var(--primary-hex) 0%, var(--accent-hex) 100%)` }} />
        <div className="relative max-w-3xl mx-auto px-4 text-center text-white">
          <h1 {...editAttrs("about", hero?.id || "about-hero", "title")} className="text-4xl md:text-5xl font-bold font-serif mb-4">{textOr(hero?.title) || config.orgName}</h1>
          {(textOr(hero?.body) || config.tagline) && <p {...editAttrs("about", hero?.id || "about-hero", "body")} className="text-lg text-white/90 italic">{textOr(hero?.body) || config.tagline}</p>}
        </div>
      </section>
      )}

      {pageSectionVisible(sections, "about_intro") && (textOr(intro?.body) || aboutCopy) && (
        <section data-testid="page-section-about-about_intro" style={{ order: pageSectionOrder(sections, "about_intro", 1) }} className="max-w-3xl mx-auto px-4 py-16">
          <h2 {...editAttrs("about", intro?.id || "about-intro", "title")} className="text-2xl font-bold font-serif mb-6">{textOr(intro?.title) || aboutHeading}</h2>
          <div {...editAttrs("about", intro?.id || "about-intro", "body")} className="text-gray-600 leading-relaxed text-lg whitespace-pre-line">{textOr(intro?.body) || aboutCopy}</div>
        </section>
      )}

      {pageSectionVisible(sections, "programs") && config.programs && config.programs.length > 0 && (
        <section data-testid="page-section-about-programs" style={{ order: pageSectionOrder(sections, "programs", 2) }} className="bg-gray-50 py-16">
          <div className="max-w-7xl mx-auto px-4">
            <h2 {...editAttrs("about", programs?.id || "about-programs", "title")} className="text-2xl font-bold font-serif text-center mb-8">{textOr(programs?.title) || "What We Do"}</h2>
            {programs?.body && <p {...editAttrs("about", programs.id, "body")} className="max-w-3xl mx-auto text-center text-gray-500 mb-8">{programs.body}</p>}
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

      {pageSectionVisible(sections, "find_us") && (config.meetingDay || config.contactAddress) && (
        <section data-testid="page-section-about-find_us" style={{ order: pageSectionOrder(sections, "find_us", 3) }} className="max-w-3xl mx-auto px-4 py-16">
          <h2 {...editAttrs("about", findUs?.id || "about-find-us", "title")} className="text-2xl font-bold font-serif mb-6">{textOr(findUs?.title) || "Find Us"}</h2>
          {findUs?.body && <p {...editAttrs("about", findUs.id, "body")} className="text-gray-500 mb-6">{findUs.body}</p>}
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

      {pageSectionVisible(sections, "partners") && config.partners && config.partners.length > 0 && (
        <section data-testid="page-section-about-partners" style={{ order: pageSectionOrder(sections, "partners", 4) }} className="bg-gray-50 py-16">
          <div className="max-w-7xl mx-auto px-4">
            <h2 {...editAttrs("about", partners?.id || "about-partners", "title")} className="text-2xl font-bold font-serif text-center mb-8">{textOr(partners?.title) || "Our Partners"}</h2>
            {partners?.body && <p {...editAttrs("about", partners.id, "body")} className="max-w-3xl mx-auto text-center text-gray-500 mb-8">{partners.body}</p>}
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

      {extraSections.map((section, index) => (
        <section
          key={section.id || `${section.type}-${index}`}
          data-testid={`page-section-about-${section.type}`}
          style={{ order: pageSectionOrder(sections, section.type, 20 + index) }}
          className="max-w-3xl mx-auto px-4 py-12"
        >
          {section.title && <h2 {...editAttrs("about", section.id, "title")} className="text-2xl font-bold font-serif mb-4">{section.title}</h2>}
          {section.body && <p {...editAttrs("about", section.id, "body")} className="text-gray-600 leading-relaxed whitespace-pre-line">{section.body}</p>}
        </section>
      ))}

      {pageSectionVisible(sections, "cta") && (
      <section data-testid="page-section-about-cta" style={{ order: pageSectionOrder(sections, "cta", 30) }} className="py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 {...editAttrs("about", cta?.id || "about-cta", "title")} className="text-2xl font-bold font-serif mb-4">{textOr(cta?.title) || "Get Involved"}</h2>
          <p {...editAttrs("about", cta?.id || "about-cta", "body")} className="text-gray-500 mb-6">{textOr(cta?.body) || "We'd love to have you join our community. Reach out to learn more about membership and volunteering."}</p>
          <Link href="/contact">
            <button className="px-6 py-3 text-white rounded-md font-medium" style={{ backgroundColor: "var(--primary-hex)" }}>Contact Us</button>
          </Link>
        </div>
      </section>
      )}
    </div>
  );
}
