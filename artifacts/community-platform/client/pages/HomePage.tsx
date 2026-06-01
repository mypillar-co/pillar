import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useConfig, type HomepageSectionBlock, type OrgConfig } from "../config-context";
import { apiFetch } from "../lib/api";
import { normalizeHeroVisualType } from "../lib/heroVisual";
import { editAttrs } from "../lib/pageSections";

interface Event {
  id: number;
  title: string;
  slug: string | null;
  description: string;
  date: string;
  time: string;
  location: string;
  category: string;
  imageUrl: string | null;
  featured: boolean | null;
}

interface Announcement {
  id: number;
  title: string;
  body: string;
  created_at: string;
}

export default function HomePage() {
  const config = useConfig();
  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: siteContent } = useQuery<Record<string, string>>({ queryKey: ["/api/site-content"] });
  const { data: announcements } = useQuery<Announcement[]>({ queryKey: ["/api/announcements"] });

  if (!config) return null;

  const featuredEvents = events?.filter(e => e.featured).slice(0, 3) || events?.slice(0, 3) || [];
  const get = (key: string, fallback = "") => siteContent?.[key] || fallback;
  const isLodgeSite = isLodgeFraternalSite(config);
  const isLionsSite = !isLodgeSite && isLionsClubSite(config);
  const isRotarySite = !isLodgeSite && !isLionsSite && isRotaryClubSite(config);
  const hasHallSignal = hasHallRentalSignal(config, siteContent);
  const homepageSections = resolveHomepageSections(config, {
    hasAnnouncements: (announcements?.length ?? 0) > 0,
    hasEvents: featuredEvents.length > 0,
    hasPartners: (config.partners?.length ?? 0) > 0,
    hasNewsletter: config.features?.newsletter === true,
    isLodgeSite,
    isLionsSite,
    isRotarySite,
  });
  const sectionBlock = (type: string) => homepageSections.find(section => section.type === type);
  const sectionVisible = (type: string) => sectionBlock(type)?.visible !== false;
  const sectionOrder = (type: string, fallback: number) => {
    const index = homepageSections.findIndex(section => section.type === type);
    return index === -1 ? fallback : index;
  };
  const heroBlock = sectionBlock("hero");
  const heroImage = heroBlock?.imageUrl || config.heroImageUrl || get("image_home_hero");
  const heroVisualType = normalizeHeroVisualType(
    config.features?.heroVisualType ?? config.heroVisualType,
    config.features?.heroLayout ?? config.heroLayout,
  );
  const showBannerBackground = Boolean(heroImage) && heroVisualType === "banner_background";
  const showFeaturePhoto =
    Boolean(heroImage) &&
    (heroVisualType === "feature_photo" || (isLodgeSite && heroVisualType === "none"));
  const heroTitle = textOr(heroBlock?.title) || (isLodgeSite
    ? lodgeHeroTitle(config)
    : isLionsSite
      ? lionsHeroTitle(config)
    : isRotarySite
      ? rotaryHeroTitle(config)
      : config.orgName);
  const heroTagline = textOr(heroBlock?.subtitle) || get("home_tagline") || config.tagline;
  const heroIntro = textOr(heroBlock?.body) || (isLodgeSite
    ? get("home_intro") ||
      config.mission ||
      `${config.orgName} brings fellowship, service, and tradition together for ${config.location || "the local community"}.`
    : isRotarySite
      ? get("home_intro") ||
        config.mission ||
        `${config.orgName} connects neighbors through service projects, fellowship, and practical ways to help ${config.location || "the community"}.`
    : isLionsSite
      ? get("home_intro") ||
        config.mission ||
        `${config.orgName} turns local compassion into service through projects, giving, and practical support for ${config.location || "the community"}.`
    : get("home_intro"));
  const primaryAction = isLodgeSite
    ? { label: "Visit a Meeting", href: "/contact" }
    : isLionsSite
      ? { label: "Join the Club", href: "/contact" }
    : isRotarySite
      ? { label: "Take Action", href: "/contact" }
    : { label: "View Events", href: "/events" };
  const secondaryAction = isLodgeSite
    ? { label: hasHallSignal ? "Book the Hall" : "Learn Our Story", href: hasHallSignal ? "/contact" : "/about" }
    : isLionsSite
      ? { label: "Support Service", href: "/contact" }
    : isRotarySite
      ? { label: featuredEvents.length > 0 ? "Upcoming Service" : "See Our Work", href: featuredEvents.length > 0 ? "/events" : "/about" }
    : { label: "Learn More", href: "/about" };

  const stats = config.stats && config.stats.length > 0
    ? config.stats
    : isLionsSite
      ? [
          { value: "Local", label: "Service Impact" },
          { value: "100%", label: "Volunteer Led" },
          { value: "Open", label: "To New Members" },
          { value: "Year-Round", label: "Ways to Help" },
        ]
    : isRotarySite
      ? [
          { value: "100%", label: "Volunteer Led" },
          { value: "12+", label: "Service Moments" },
          { value: "1", label: "Local Club" },
          { value: "Open", label: "To Visitors" },
        ]
      : [
          { value: "10+", label: "Annual Events" },
          { value: "500+", label: "Community Members" },
          { value: "5+", label: "Years Active" },
          { value: "100%", label: "Volunteer Driven" },
        ];

  const extraHomepageSections = homepageSections.filter(
    section => section.visible !== false && !BUILT_IN_HOMEPAGE_SECTION_TYPES.has(section.type),
  );

  return (
    <div className="flex flex-col">
      {/* Hero */}
      {sectionVisible("hero") && (
	      <section data-testid="homepage-section-hero" style={{ order: sectionOrder("hero", 0) }} className={`relative overflow-hidden flex items-center ${showFeaturePhoto ? "cp-hero-split min-h-[560px]" : "min-h-[500px]"} ${isLodgeSite ? "cp-lodge-hero" : ""} ${isRotarySite ? "cp-rotary-hero" : ""} ${isLionsSite ? "cp-lions-hero" : ""}`}>
        {showBannerBackground && (
          <img src={heroImage} alt="" className="cp-hero-image absolute inset-0 w-full h-full" />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              showFeaturePhoto
                ? `linear-gradient(135deg, var(--primary-hex) 0%, #10192d 100%)`
                : heroImage
                  ? "linear-gradient(to right, rgba(0,0,0,0.75), rgba(0,0,0,0.4))"
                  : `linear-gradient(135deg, var(--primary-hex) 0%, var(--accent-hex) 100%)`,
          }}
        />
        <div className={`relative max-w-7xl mx-auto px-4 py-24 md:py-36 ${showFeaturePhoto ? "w-full grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,560px)] items-center" : ""}`}>
          <div className={showFeaturePhoto ? "max-w-xl" : "max-w-2xl"}>
            <span className="inline-flex items-center mb-4 px-3 py-1 rounded-full text-xs bg-white/20 text-white border border-white/30">
              {isLodgeSite ? "Lodge & Fellowship" : isLionsSite ? "Lions Club" : isRotarySite ? "Service Club" : config.orgType || "Community Organization"}
            </span>
            <h1 {...editAttrs("home", heroBlock?.id || "hero", "title")} className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-3 font-serif leading-tight">
              {heroTitle}
            </h1>
            {heroTagline && (
              <p {...editAttrs("home", heroBlock?.id || "hero", "subtitle")} className="text-lg md:text-xl text-white/90 mb-4 font-medium italic">
                {heroTagline}
              </p>
            )}
            {heroIntro && (
              <p {...editAttrs("home", heroBlock?.id || "hero", "body")} className="text-base text-white/70 mb-8 leading-relaxed max-w-lg">
                {heroIntro}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Link href={primaryAction.href}>
                <button className="px-6 py-3 text-white rounded-md font-medium" style={{ backgroundColor: "var(--primary-hex)" }}>
                  {primaryAction.label}
                </button>
              </Link>
              <Link href={secondaryAction.href}>
                <button className="px-6 py-3 bg-white/10 text-white border border-white/20 rounded-md backdrop-blur-sm">
                  {secondaryAction.label}
                </button>
              </Link>
            </div>
          </div>
          {showFeaturePhoto ? (
            <div className="cp-hero-media cp-hero-media-card">
              <img src={heroImage} alt={`${config.orgName} hero`} className="cp-hero-media-image" />
            </div>
          ) : null}
        </div>
      </section>
      )}

      {sectionVisible("announcements") && (announcements?.length ?? 0) > 0 && (
        <section style={{ order: sectionOrder("announcements", 1) }} className="cp-announcements" aria-label="Announcements">
          <div className="max-w-7xl mx-auto px-4">
            <div className="cp-announcement-strip">
              <div className="cp-announcement-kicker">Latest announcement</div>
              <div className="cp-announcement-list">
                {(announcements ?? []).slice(0, 3).map((announcement) => (
                  <article key={announcement.id} className="cp-announcement-item">
                    <div className="cp-announcement-date">
                      {new Date(announcement.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <h2>{announcement.title}</h2>
                    <p>{announcement.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {sectionVisible("lodge_explore") && isLodgeSite && (
        <div style={{ order: sectionOrder("lodge_explore", 2) }}>
          <LodgeExploreSection config={config} hasHallSignal={hasHallSignal} />
        </div>
      )}

      {sectionVisible("rotary_features") && isRotarySite && (
        <div style={{ order: sectionOrder("rotary_features", 3) }}>
          <RotaryFeatureMosaic
            config={config}
            events={featuredEvents}
            announcements={announcements ?? []}
          />
        </div>
      )}

      {sectionVisible("lions_support") && isLionsSite && (
        <div style={{ order: sectionOrder("lions_support", 4) }}>
          <LionsSupportPathway config={config} />
        </div>
      )}

      {/* Stats */}
      {sectionVisible("stats") && (
	      <section data-testid="homepage-section-stats" style={{ order: sectionOrder("stats", 5) }} className={`max-w-7xl mx-auto px-4 py-16 ${isRotarySite ? "cp-rotary-impact" : ""} ${isLionsSite ? "cp-lions-impact" : ""}`}>
        {(isRotarySite || isLionsSite) && (
          <div className={isLionsSite ? "cp-lions-impact-heading" : "cp-rotary-impact-heading"}>
            <span>{isLionsSite ? "Local impact" : "Impact by the numbers"}</span>
            <h2 {...editAttrs("home", sectionBlock("stats")?.id || "stats", "title")}>{sectionBlock("stats")?.title || (isLionsSite ? "Service people can see" : "Service made visible")}</h2>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="p-6 text-center border border-gray-200 rounded-lg bg-white shadow-sm">
              <p className="text-2xl md:text-3xl font-bold mb-1" style={{ color: "var(--primary-hex)" }}>{stat.value}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>
      )}

      {sectionVisible("rotary_service_areas") && isRotarySite && (
        <div style={{ order: sectionOrder("rotary_service_areas", 6) }}>
          <RotaryServiceAreas config={config} />
        </div>
      )}

      {sectionVisible("lions_promo") && isLionsSite && (
        <div style={{ order: sectionOrder("lions_promo", 7) }}>
          <LionsServicePromo config={config} imageUrl={heroImage} />
        </div>
      )}

      {/* Upcoming Events */}
      {sectionVisible("events") && featuredEvents.length > 0 && (
	        <section data-testid="homepage-section-events" style={{ order: sectionOrder("events", 8) }} className="bg-gray-50 py-16">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold font-serif">{sectionBlock("events")?.title || "Upcoming Events"}</h2>
                <p className="text-gray-500 text-sm mt-1">Don't miss what's happening in {config.location || "our community"}</p>
              </div>
              <Link href="/events">
                <button className="text-sm font-medium px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors">
                  All Events →
                </button>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredEvents.map(event => (
                <Link key={event.id} href={event.slug ? `/events/${event.slug}` : "/events"}>
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-white cursor-pointer hover:shadow-md transition-shadow">
                    {event.imageUrl && <img src={event.imageUrl} alt={event.title} className="w-full h-48 object-cover" />}
                    <div className="p-5">
                      <span className="inline-block px-2 py-1 text-xs rounded-full mb-3 text-white" style={{ backgroundColor: "var(--accent-hex)" }}>{event.category}</span>
                      <h3 className="font-semibold text-lg mb-2">{event.title}</h3>
                      <p className="text-sm text-gray-500 mb-4 line-clamp-2">{event.description}</p>
                      <div className="flex flex-col gap-1 text-xs text-gray-400">
                        <span>📅 {event.date}</span>
                        <span>🕐 {event.time}</span>
                        <span>📍 {event.location}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Partners */}
      {sectionVisible("partners") && config.partners && config.partners.length > 0 && (
        <section style={{ order: sectionOrder("partners", 9) }} className="max-w-7xl mx-auto px-4 py-16">
          <h2 {...editAttrs("home", sectionBlock("partners")?.id || "partners", "title")} className="text-2xl font-bold font-serif text-center mb-8">{sectionBlock("partners")?.title || "Community Partners"}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {config.partners.map((partner) => (
              <div key={partner.name} className="p-4 border border-gray-200 rounded-lg text-center">
                <p className="font-semibold text-sm">{partner.name}</p>
                {partner.description && <p className="text-xs text-gray-500 mt-1">{partner.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Newsletter */}
      {sectionVisible("newsletter") && config.features?.newsletter && (
        <div style={{ order: sectionOrder("newsletter", 10) }}>
          <NewsletterSection
            orgName={config.orgName}
            location={config.location}
            title={sectionBlock("newsletter")?.title}
            body={sectionBlock("newsletter")?.body}
          />
        </div>
      )}

      {extraHomepageSections.map((section, index) => (
        <ApprovedHomepageSection
          key={section.id || `${section.type}-${index}`}
          section={section}
          orgName={config.orgName}
          location={config.location}
          order={sectionOrder(section.type, 20 + index)}
        />
      ))}
    </div>
  );
}

const BUILT_IN_HOMEPAGE_SECTION_TYPES = new Set([
  "hero",
  "announcements",
  "lodge_explore",
  "rotary_features",
  "lions_support",
  "stats",
  "rotary_service_areas",
  "lions_promo",
  "events",
  "partners",
  "newsletter",
]);

type HomepageSectionFlags = {
  hasAnnouncements: boolean;
  hasEvents: boolean;
  hasPartners: boolean;
  hasNewsletter: boolean;
  isLodgeSite: boolean;
  isLionsSite: boolean;
  isRotarySite: boolean;
};

function textOr(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getConfiguredHomepageSections(config: OrgConfig): HomepageSectionBlock[] {
  if (Array.isArray(config.features?.homepageSections)) return config.features.homepageSections;
  if (Array.isArray(config.sections)) return config.sections;
  return [];
}

function defaultHomepageSections(flags: HomepageSectionFlags): HomepageSectionBlock[] {
  const sections: HomepageSectionBlock[] = [
    { id: "hero", type: "hero", title: "Hero", visible: true },
  ];
  if (flags.hasAnnouncements) sections.push({ id: "announcements", type: "announcements", title: "Announcements", visible: true });
  if (flags.isLodgeSite) sections.push({ id: "lodge-explore", type: "lodge_explore", title: "Explore", visible: true });
  if (flags.isRotarySite) sections.push({ id: "rotary-features", type: "rotary_features", title: "News & Features", visible: true });
  if (flags.isLionsSite) sections.push({ id: "lions-support", type: "lions_support", title: "Support Pathway", visible: true });
  sections.push({ id: "stats", type: "stats", title: "Impact", visible: true });
  if (flags.isRotarySite) sections.push({ id: "rotary-service-areas", type: "rotary_service_areas", title: "Service Areas", visible: true });
  if (flags.isLionsSite) sections.push({ id: "lions-promo", type: "lions_promo", title: "Service Promo", visible: true });
  if (flags.hasEvents) sections.push({ id: "events", type: "events", title: "Upcoming Events", visible: true });
  if (flags.hasPartners) sections.push({ id: "partners", type: "partners", title: "Community Partners", visible: true });
  if (flags.hasNewsletter) sections.push({ id: "newsletter", type: "newsletter", title: "Stay Connected", visible: true });
  return sections;
}

function resolveHomepageSections(config: OrgConfig, flags: HomepageSectionFlags): HomepageSectionBlock[] {
  const defaults = defaultHomepageSections(flags);
  const configured = getConfiguredHomepageSections(config);
  if (configured.length === 0) return defaults;

  const defaultsByType = new Map(defaults.map(section => [section.type, section]));
  const normalized = configured
    .filter(section => section && typeof section.type === "string")
    .map(section => ({
      ...(defaultsByType.get(section.type) ?? {}),
      ...section,
      id: textOr(section.id) || section.type,
      visible: section.visible !== false,
    }));

  for (const section of defaults) {
    if (!normalized.some(item => item.type === section.type)) {
      normalized.push(section);
    }
  }

  return normalized;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function listValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function ApprovedHomepageSection({
  section,
  orgName,
  location,
  order,
}: {
  section: HomepageSectionBlock;
  orgName: string;
  location?: string | null;
  order: number;
}) {
  const data = recordValue(section.data);
  const title = textOr(section.title) || approvedSectionLabel(section.type);
  const body = textOr(section.body);
  const intro = textOr(data.intro) || body;

  if (section.type === "meeting_schedule") {
    const cadence = textOr(data.cadence) || "Meeting details will be announced soon.";
    const meetingLocation = textOr(data.location) || location || "";
    return (
      <section style={{ order }} className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-bold font-serif mb-4">{title}</h2>
        {intro && <p className="text-gray-500 mb-6">{intro}</p>}
        <div className="border border-gray-200 rounded-lg bg-white p-6">
          <p className="font-semibold text-gray-900">{cadence}</p>
          {meetingLocation && <p className="text-gray-500 mt-1">{meetingLocation}</p>}
        </div>
      </section>
    );
  }

  if (section.type === "gallery") {
    const photos = listValue(data.photos);
    return (
      <section style={{ order }} className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold font-serif mb-4">{title}</h2>
          {intro && <p className="text-gray-500 mb-8 max-w-2xl">{intro}</p>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(photos.length > 0 ? photos : section.imageUrl ? [{ url: section.imageUrl, caption: title }] : []).map((photo, index) => (
              <div key={index} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                {textOr(photo.url) && <img src={textOr(photo.url)} alt={textOr(photo.caption) || title} className="w-full h-48 object-cover" />}
                {textOr(photo.caption) && <p className="p-3 text-sm text-gray-500">{textOr(photo.caption)}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const cards = section.type === "volunteer_opportunities"
    ? listValue(data.opportunities).map(item => ({
        title: textOr(item.title),
        body: textOr(item.description),
      }))
    : section.type === "leadership"
      ? listValue(data.members).map(item => ({
          title: textOr(item.name),
          body: textOr(item.title),
        }))
    : section.type === "documents"
      ? listValue(data.documents).map(item => ({
          title: textOr(item.name),
          body: textOr(item.description),
        }))
    : section.type === "sponsors_showcase"
      ? listValue(data.sponsors).map(item => ({
          title: textOr(item.name),
          body: textOr(item.tier),
        }))
    : [];

  return (
    <section style={{ order }} className="max-w-7xl mx-auto px-4 py-16">
      <div className="max-w-3xl">
        <h2 className="text-2xl md:text-3xl font-bold font-serif mb-4">{title}</h2>
        <p className="text-gray-500 leading-relaxed">
          {intro || defaultApprovedSectionBody(section.type, orgName)}
        </p>
      </div>
      {cards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          {cards.map((card, index) => (
            <article key={`${card.title}-${index}`} className="border border-gray-200 rounded-lg bg-white p-5">
              <h3 className="font-semibold text-lg mb-2">{card.title || "Item"}</h3>
              {card.body && <p className="text-sm text-gray-500">{card.body}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function approvedSectionLabel(type: string): string {
  switch (type) {
    case "meeting_schedule": return "When We Meet";
    case "volunteer_opportunities": return "Volunteer Opportunities";
    case "gallery": return "Photo Gallery";
    case "documents": return "Resources";
    case "history": return "Our History";
    case "leadership": return "Leadership";
    case "sponsors_showcase": return "Our Sponsors";
    default: return "Community Section";
  }
}

function defaultApprovedSectionBody(type: string, orgName: string): string {
  switch (type) {
    case "history": return `${orgName} has a story shaped by service, fellowship, and local commitment.`;
    case "volunteer_opportunities": return "Explore practical ways to lend a hand and support the work happening now.";
    case "documents": return "Find helpful documents, forms, and community resources.";
    default: return `${orgName} shares updates and opportunities for the community here.`;
  }
}

function isLodgeFraternalSite(config: OrgConfig): boolean {
  const explicit = config.features?.siteArchetype ?? config.siteArchetype;
  if (explicit === "lodge_fraternal") return true;
  const text = [
    config.orgName,
    config.orgType,
    config.tagline,
    config.mission,
    config.location,
  ].filter(Boolean).join(" ").toLowerCase();
  return /\bmason(ic|ry)?\b|\blodge\b|\bfraternal\b|\bfree\s*(and|&)\s*accepted\b|\bshriners?\b|\belks\b|\bmoose\b|\bodd fellows?\b|\beagles\b|\bknights of columbus\b/.test(text);
}

function hasHallRentalSignal(
  config: OrgConfig,
  siteContent: Record<string, string> | undefined,
): boolean {
  const text = [
    config.orgName,
    config.tagline,
    config.mission,
    config.meetingLocation,
    ...(config.programs ?? []).flatMap((program) => [program.title, program.description]),
    siteContent?.home_intro,
    siteContent?.about_heading,
  ].filter(Boolean).join(" ").toLowerCase();
  return /\bhall\b|\brental\b|\brent\b|\bvenue\b|\bbanquet\b|\bbook\b/.test(text);
}

function lodgeHeroTitle(config: OrgConfig): string {
  const location = (config.location ?? "").trim();
  if (!location) return config.orgName;
  const city = location.split(",")[0]?.trim();
  return city ? `${config.orgName} in ${city}` : config.orgName;
}

function isLionsClubSite(config: OrgConfig): boolean {
  const text = [
    config.orgName,
    config.orgType,
    config.tagline,
    config.mission,
    ...(config.programs ?? []).flatMap((program) => [program.title, program.description]),
  ].filter(Boolean).join(" ").toLowerCase();

  return /\blions?\b|\bleos?\b|\blcif\b/.test(text);
}

function lionsHeroTitle(config: OrgConfig): string {
  const location = (config.location ?? "").trim();
  const city = location.split(",")[0]?.trim();
  return city ? `${config.orgName} serves ${city}` : `${config.orgName} serves`;
}

function isRotaryClubSite(config: OrgConfig): boolean {
  const text = [
    config.orgName,
    config.orgType,
    config.tagline,
    config.mission,
    ...(config.programs ?? []).flatMap((program) => [program.title, program.description]),
  ].filter(Boolean).join(" ").toLowerCase();

  return /\brotary\b|\brotaract\b|\binteract\b/.test(text);
}

function rotaryHeroTitle(config: OrgConfig): string {
  const location = (config.location ?? "").trim();
  const city = location.split(",")[0]?.trim();
  return city
    ? `${config.orgName} puts service in action in ${city}`
    : `${config.orgName} puts service in action`;
}

function LionsSupportPathway({ config }: { config: OrgConfig }) {
  const place = config.location || "the community";
  const defaultCauses = [
    {
      icon: "Vision",
      title: "Vision & Wellness",
      description: "Support screenings, health awareness, and practical care that helps neighbors stay active.",
    },
    {
      icon: "Hunger",
      title: "Hunger Relief",
      description: "Help stock drives, community meals, and partnerships that put food where it is needed.",
    },
    {
      icon: "Youth",
      title: "Youth Programs",
      description: "Back scholarships, leadership, and service opportunities for young people in the area.",
    },
    {
      icon: "Response",
      title: "Disaster & Emergency Help",
      description: "Give members a ready path to respond when families and local partners need urgent support.",
    },
  ];
  const causes = (config.programs && config.programs.length > 0 ? config.programs : defaultCauses).slice(0, 4);
  const steps = [
    {
      number: "1",
      title: "Choose a cause",
      description: `Start with the local needs ${config.orgName} is already serving in ${place}.`,
    },
    {
      number: "2",
      title: "Give or volunteer",
      description: "Support can mean time, supplies, a donation, or simply showing up for the next project.",
    },
    {
      number: "3",
      title: "Stay connected",
      description: "Meeting details, member resources, and service updates keep the work moving after the first visit.",
    },
  ];

  return (
    <section className="cp-lions-support">
      <div className="max-w-7xl mx-auto px-4">
        <div className="cp-lions-section-heading">
          <span>Get Involved</span>
          <h2>Choose how to help</h2>
          <p>
            From a first meeting to a first service project, every path starts with one practical next step.
          </p>
        </div>
        <div className="cp-lions-step-grid">
          {steps.map((step) => (
            <article key={step.number} className="cp-lions-step-card">
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
        <div className="cp-lions-cause-grid">
          {causes.map((cause) => (
            <article key={cause.title} className="cp-lions-cause-card">
              <span>{cause.icon}</span>
              <h3>{cause.title}</h3>
              <p>{cause.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function LionsServicePromo({ config, imageUrl }: { config: OrgConfig; imageUrl?: string | null }) {
  const backgroundStyle = imageUrl
    ? {
        backgroundImage: `linear-gradient(90deg, rgba(17, 24, 39, 0.86) 0%, rgba(17, 24, 39, 0.56) 48%, rgba(17, 24, 39, 0.18) 100%), url("${imageUrl}")`,
      }
    : undefined;

  return (
    <section className="cp-lions-promo" style={backgroundStyle}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="cp-lions-promo-content">
          <span>Empowering service</span>
          <h2>Support that turns compassion into action</h2>
          <p>
            Whether someone wants to join, donate, sponsor, or lend a hand, {config.orgName} should give them a clear next step.
          </p>
          <Link href="/contact">
            <button>Contact the Club</button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function RotaryFeatureMosaic({
  config,
  events,
  announcements,
}: {
  config: OrgConfig;
  events: Event[];
  announcements: Announcement[];
}) {
  const featuredEvent = events[0];
  const announcement = announcements[0];
  const place = config.location || "our community";
  const featureItems = [
    {
      label: featuredEvent ? "Upcoming service" : "Featured work",
      title: featuredEvent?.title || "Service projects close to home",
      description:
        featuredEvent?.description ||
        config.mission ||
        `${config.orgName} brings members and neighbors together for hands-on service in ${place}.`,
      href: featuredEvent?.slug ? `/events/${featuredEvent.slug}` : featuredEvent ? "/events" : "/about",
      imageUrl: featuredEvent?.imageUrl || config.heroImageUrl,
      primary: true,
    },
    {
      label: announcement ? "Club update" : "Meeting access",
      title: announcement?.title || "Visit a meeting",
      description:
        announcement?.body ||
        (config.meetingDay || config.meetingTime || config.meetingLocation
          ? [
              config.meetingDay,
              config.meetingTime,
              config.meetingLocation ? `at ${config.meetingLocation}` : "",
            ].filter(Boolean).join(" ")
          : "The easiest way to get involved is to visit, meet members, and learn where your time can help."),
      href: "/contact",
      primary: false,
    },
    {
      label: "Get involved",
      title: "Join a project or support the club",
      description: "Find the next practical step, from volunteering at a service event to asking about membership.",
      href: "/contact",
      primary: false,
    },
  ];

  return (
    <section className="cp-rotary-features">
      <div className="max-w-7xl mx-auto px-4">
        <div className="cp-rotary-section-heading">
          <span>News & Features</span>
          <h2>Action, fellowship, and service</h2>
        </div>
        <div className="cp-rotary-feature-grid">
          {featureItems.map((item) => (
            <Link key={item.title} href={item.href}>
              <article className={`cp-rotary-feature-card ${item.primary ? "cp-rotary-feature-card-primary" : ""}`}>
                {item.imageUrl && item.primary ? (
                  <img src={item.imageUrl} alt="" className="cp-rotary-feature-image" />
                ) : null}
                <div className="cp-rotary-feature-content">
                  <span>{item.label}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function RotaryServiceAreas({ config }: { config: OrgConfig }) {
  const defaultAreas = [
    {
      icon: "Local Service",
      title: "Community Projects",
      description: "Hands-on projects that respond to visible needs in the places members call home.",
    },
    {
      icon: "Youth",
      title: "Youth Leadership",
      description: "Opportunities that help students build confidence, service habits, and local connections.",
    },
    {
      icon: "Partners",
      title: "Community Partnerships",
      description: "Work with schools, nonprofits, and local groups to make service go further.",
    },
    {
      icon: "Fellowship",
      title: "Member Fellowship",
      description: "Regular gatherings that turn good intentions into friendships, planning, and action.",
    },
    {
      icon: "Fundraising",
      title: "Support for Causes",
      description: "Events and campaigns that fund practical help for neighbors and community programs.",
    },
    {
      icon: "World Service",
      title: "Service Beyond Town",
      description: "Connections to broader service efforts while staying rooted in local relationships.",
    },
  ];
  const areas = (config.programs && config.programs.length > 0 ? config.programs : defaultAreas).slice(0, 6);

  return (
    <section className="cp-rotary-causes">
      <div className="max-w-7xl mx-auto px-4">
        <div className="cp-rotary-section-heading">
          <span>Service areas</span>
          <h2>No local challenge is too practical to start</h2>
          <p>
            From quick volunteer shifts to long-running projects, each area gives visitors a clear way into the work.
          </p>
        </div>
        <div className="cp-rotary-cause-grid">
          {areas.map((area) => (
            <article key={area.title} className="cp-rotary-cause-card">
              <span>{area.icon}</span>
              <h3>{area.title}</h3>
              <p>{area.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function LodgeExploreSection({
  config,
  hasHallSignal,
}: {
  config: OrgConfig;
  hasHallSignal: boolean;
}) {
  const hasMembersPortal = (config.memberCount ?? 0) > 0;
  const place = config.location || "the community";
  const isNamedLodge = /\blodge\b|\bmason(ic|ry)?\b/.test(
    [config.orgName, config.orgType].filter(Boolean).join(" ").toLowerCase(),
  );
  const orgNoun = isNamedLodge ? "lodge" : "organization";
  const orgNounTitle = isNamedLodge ? "Lodge" : "Organization";
  const cards = [
    {
      title: "Our Story",
      description: `Learn what guides ${config.orgName} and how the ${orgNoun} serves ${place}.`,
      href: "/about",
    },
    {
      title: "Meetings & Events",
      description: "See upcoming gatherings, public events, and the next chance to visit.",
      href: "/events",
    },
    hasHallSignal
      ? {
          title: "Hall Rentals",
          description: "Ask about availability for meetings, receptions, and community events.",
          href: "/contact",
        }
      : {
          title: "Community Work",
          description: "Explore the service, fellowship, and local traditions behind the lodge.",
          href: "/about",
        },
    {
      title: hasMembersPortal ? "Members" : "Membership",
      description: hasMembersPortal
        ? "Access member-only notices, documents, and lodge information."
        : "Have questions about visiting or joining? Start with a simple note.",
      href: hasMembersPortal ? "/members" : "/contact",
    },
    {
      title: "Gallery",
      description: "View photos from events, service projects, and life around the lodge.",
      href: "/gallery",
    },
    {
      title: "Contact",
      description: "Reach out for meeting details, membership questions, or facility inquiries.",
      href: "/contact",
    },
  ];

  return (
    <section className="cp-lodge-explore">
      <div className="max-w-7xl mx-auto px-4">
        <div className="cp-lodge-explore-header">
          <span>Explore the {orgNounTitle}</span>
          <h2>{config.orgName} at a glance</h2>
          <p>
            A clearer path for visitors, members, and neighbors to find the right next step.
          </p>
        </div>
        <div className="cp-lodge-card-grid">
          {cards.map((card) => (
            <Link key={card.title} href={card.href}>
              <article className="cp-lodge-card">
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function NewsletterSection({
  orgName,
  location,
  title,
  body,
}: {
  orgName: string;
  location?: string | null;
  title?: string;
  body?: string;
}) {
  return (
    <section className="border-y border-gray-200 bg-white py-16">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <h2 className="text-2xl md:text-3xl font-bold font-serif mb-2">{title || "Stay Connected"}</h2>
        <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
          {body || `Get the latest news about ${location || orgName} events and community updates.`}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const email = (form.querySelector('[name="email"]') as HTMLInputElement)?.value;
            if (!email) return;
            await apiFetch("/api/newsletter/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, formTiming: 5000 }),
            });
            form.reset();
          }}
          className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
        >
          <input type="email" name="email" placeholder="Your email address" required className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <button type="submit" className="px-5 py-2 text-white rounded-md text-sm font-medium" style={{ backgroundColor: "var(--primary-hex)" }}>Subscribe</button>
        </form>
      </div>
    </section>
  );
}
