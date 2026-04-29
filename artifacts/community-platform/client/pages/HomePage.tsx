import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useConfig } from "../config-context";
import { apiFetch } from "../lib/api";

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

type SiteStyle =
  | "Classic"
  | "Modern Civic"
  | "Heritage"
  | "Bold Event"
  | "Warm Community";

type OrgFamily = "heritage" | "civic" | "business" | "event" | "nonprofit" | "community";
type HeroLayout = "background" | "split";

function normalizeSiteStyle(value: string | undefined): SiteStyle {
  if (
    value === "Classic" ||
    value === "Modern Civic" ||
    value === "Heritage" ||
    value === "Bold Event" ||
    value === "Warm Community"
  ) {
    return value;
  }
  return "Modern Civic";
}

function detectOrgFamily(orgType: string | null | undefined, hasEvents: boolean): OrgFamily {
  if (orgType === "fraternal" || orgType === "vfw") return "heritage";
  if (orgType === "rotary" || orgType === "lions") return "civic";
  if (orgType === "chamber") return "business";
  if (orgType === "foundation" || orgType === "pta") return "nonprofit";
  if (hasEvents && orgType === "arts") return "event";
  if (orgType === "civic" || orgType === "neighborhood") return "community";
  return hasEvents ? "event" : "community";
}

function toStyleSlug(style: SiteStyle): string {
  return style.toLowerCase().replace(/\s+/g, "-");
}

function normalizeHeroLayout(value: string | null | undefined, heroImage: string | null | undefined): HeroLayout {
  if (value === "split") return "split";
  return heroImage ? "background" : "background";
}

function buildFallbackHeadline(
  orgName: string,
  family: OrgFamily,
  location: string | null | undefined,
): string {
  const place = location || "your community";
  if (family === "heritage") return `${orgName} keeps tradition active in ${place}`;
  if (family === "civic") return `${orgName} turns local service into visible impact`;
  if (family === "business") return `${orgName} helps local business show up stronger`;
  if (family === "event") return `${orgName} makes the next big gathering easy to join`;
  if (family === "nonprofit") return `${orgName} makes community support feel tangible`;
  return `${orgName} keeps ${place} connected`;
}

function buildFallbackCtas(
  family: OrgFamily,
  hasEvents: boolean,
): {
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
} {
  if (family === "heritage") {
    return {
      primaryLabel: hasEvents ? "See Upcoming Gatherings" : "Plan Your Visit",
      primaryHref: hasEvents ? "/events" : "/contact",
      secondaryLabel: "Learn Our Story",
      secondaryHref: "/about",
    };
  }
  if (family === "business") {
    return {
      primaryLabel: hasEvents ? "See Networking Events" : "Connect With the Chamber",
      primaryHref: hasEvents ? "/events" : "/contact",
      secondaryLabel: "Meet Local Leaders",
      secondaryHref: "/about",
    };
  }
  if (family === "event") {
    return {
      primaryLabel: "Get Event Details",
      primaryHref: "/events",
      secondaryLabel: "Become a Sponsor",
      secondaryHref: "/contact",
    };
  }
  if (family === "nonprofit") {
    return {
      primaryLabel: "Support the Mission",
      primaryHref: "/contact",
      secondaryLabel: "See Community Impact",
      secondaryHref: "/about",
    };
  }
  return {
    primaryLabel: hasEvents ? "See Upcoming Events" : "Get Involved",
    primaryHref: hasEvents ? "/events" : "/contact",
    secondaryLabel: "Learn More",
    secondaryHref: "/about",
  };
}

function ActionButton({
  href,
  label,
  variant,
}: {
  href: string;
  label: string;
  variant: "primary" | "secondary";
}) {
  const className =
    variant === "primary"
      ? "cp-btn cp-btn-primary"
      : "cp-btn cp-btn-secondary";

  if (href.startsWith("#")) {
    return (
      <a href={href} className={className}>
        {label}
      </a>
    );
  }

  return (
    <Link href={href}>
      <button className={className}>{label}</button>
    </Link>
  );
}

export default function HomePage() {
  const config = useConfig();
  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: siteContent } = useQuery<Record<string, string>>({ queryKey: ["/api/site-content"] });

  if (!config) return null;

  const get = (key: string, fallback = "") => siteContent?.[key] || fallback;
  const featuredEvents = events?.filter((e) => e.featured).slice(0, 3) || events?.slice(0, 3) || [];
  const heroImage = config.heroImageUrl || get("image_home_hero");
  const heroLayout = normalizeHeroLayout(
    (config.features?.heroLayout as string | undefined) || get("hero_layout"),
    heroImage,
  );
  const style = normalizeSiteStyle(
    (config.features?.siteStyle as string | undefined) || get("style_name"),
  );
  const family = detectOrgFamily(config.orgType, featuredEvents.length > 0);
  const rawHeadline = get("home_headline");
const headline =
  rawHeadline && rawHeadline.trim().length > 12 && rawHeadline.trim() !== config.shortName
    ? rawHeadline
    : buildFallbackHeadline(config.orgName, family, config.location);
  const subheadline =
    get("home_subheadline") ||
    get("home_intro") ||
    config.tagline ||
    config.mission ||
    "";
  const ctas = {
    ...buildFallbackCtas(family, featuredEvents.length > 0),
    primaryLabel: get("home_primary_cta_label") || buildFallbackCtas(family, featuredEvents.length > 0).primaryLabel,
    primaryHref: get("home_primary_cta_href") || buildFallbackCtas(family, featuredEvents.length > 0).primaryHref,
    secondaryLabel: get("home_secondary_cta_label") || buildFallbackCtas(family, featuredEvents.length > 0).secondaryLabel,
    secondaryHref: get("home_secondary_cta_href") || buildFallbackCtas(family, featuredEvents.length > 0).secondaryHref,
  };

  const stats = config.stats && config.stats.length > 0 ? config.stats.slice(0, 4) : [
    { value: "12+", label: "Annual Events" },
    { value: "500+", label: "Community Members" },
    { value: "5+", label: "Years Active" },
    { value: "100%", label: "Volunteer Driven" },
  ];

  const eventsHeading = get("events_heading") || (family === "business" ? "Business Events & Gatherings" : family === "heritage" ? "Lodge Calendar" : "Upcoming Events");
  const eventsIntro = get("events_intro") || (config.location ? `What is happening around ${config.location}.` : "See what is coming up next.");
  const partnersHeading = get("partners_heading") || (family === "business" ? "Business & Civic Partners" : "Community Partners");
  const newsletterHeading = get("newsletter_heading") || "Stay connected";
  const statsEyebrow = family === "heritage" ? "Tradition in motion" : family === "event" ? "Momentum you can feel" : "Trust and impact";

  return (
    <div
      className="cp-home"
      data-style={toStyleSlug(style)}
      data-family={family}
      data-hero-layout={heroLayout}
    >
      <section className="cp-hero">
        {heroImage && heroLayout === "full_bleed" || heroLayout === "background" && (
          <img src={heroImage} alt="Homepage banner" className="cp-hero-image" />
        )}
        <div className="cp-hero-overlay" />
        <div className="cp-hero-pattern" />
        <div className="cp-hero-inner">
          <div className="cp-hero-copy">
            <span className="cp-kicker">{get("home_section_eyebrow") || config.orgType || "Community Organization"}</span>
            <h1>{headline}</h1>
            {(get("home_tagline") || config.tagline) && (
              <p className="cp-tagline">{get("home_tagline") || config.tagline}</p>
            )}
            {subheadline && <p className="cp-subheadline">{subheadline}</p>}
            <div className="cp-cta-row">
              <ActionButton href={ctas.primaryHref} label={ctas.primaryLabel} variant="primary" />
              <ActionButton href={ctas.secondaryHref} label={ctas.secondaryLabel} variant="secondary" />
            </div>
          </div>
          {(heroLayout === "split_framed" || heroLayout === "split") && heroImage ? (
            <div className="cp-hero-media">
              <div className="cp-hero-media-card">
                <img src={heroImage} alt={`${config.orgName} featured`} className="cp-hero-media-image" />
              </div>
            </div>
          ) : (
            <div className="cp-hero-stats">
              <p className="cp-stat-eyebrow">{statsEyebrow}</p>
              <div className="cp-stat-grid">
                {stats.slice(0, 3).map((stat) => (
                  <div key={stat.label} className="cp-stat-card">
                    <div className="cp-stat-value">{stat.value}</div>
                    <div className="cp-stat-label">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="cp-stats-band">
        <div className="cp-container">
          <div className="cp-section-lead">
            <span className="cp-section-kicker">{statsEyebrow}</span>
            <h2>{config.orgName} in motion</h2>
          </div>
          <div className="cp-metric-row">
            {stats.map((stat) => (
              <div key={stat.label} className="cp-metric">
                <p className="cp-metric-value">{stat.value}</p>
                <p className="cp-metric-label">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {featuredEvents.length > 0 && (
        <section className="cp-section cp-section-alt" id="events">
          <div className="cp-container">
            <div className="cp-section-head">
              <div>
                <span className="cp-section-kicker">Next action</span>
                <h2>{eventsHeading}</h2>
                <p>{eventsIntro}</p>
              </div>
              <ActionButton href="/events" label="View all events" variant="secondary" />
            </div>
            <div className="cp-event-grid">
              {featuredEvents.map((event) => (
                <Link key={event.id} href={event.slug ? `/events/${event.slug}` : "/events"}>
                  <div className="cp-event-card">
                    {event.imageUrl && <img src={event.imageUrl} alt={event.title} className="cp-event-image" />}
                    <div className="cp-event-body">
                      <span className="cp-event-category">{event.category}</span>
                      <h3>{event.title}</h3>
                      <p>{event.description}</p>
                      <div className="cp-event-meta">
                        <span>{event.date}</span>
                        <span>{event.time}</span>
                        <span>{event.location}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {config.partners && config.partners.length > 0 && (
        <section className="cp-section">
          <div className="cp-container">
            <div className="cp-section-head">
              <div>
                <span className="cp-section-kicker">Trusted relationships</span>
                <h2>{partnersHeading}</h2>
              </div>
            </div>
            <div className="cp-partner-grid">
              {config.partners.map((partner) => (
                <div key={partner.name} className="cp-partner-card">
                  <p className="cp-partner-name">{partner.name}</p>
                  {partner.description && <p className="cp-partner-description">{partner.description}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {config.features?.newsletter && (
        <NewsletterSection
          heading={newsletterHeading}
          orgName={config.orgName}
          location={config.location}
        />
      )}
    </div>
  );
}

function NewsletterSection({
  heading,
  orgName,
  location,
}: {
  heading: string;
  orgName: string;
  location?: string | null;
}) {
  return (
    <section className="cp-newsletter" id="newsletter">
      <div className="cp-container cp-newsletter-inner">
        <div>
          <span className="cp-section-kicker">Updates that matter</span>
          <h2>{heading}</h2>
          <p>
            Get the latest news about {location || orgName}, upcoming events, and the work happening across the organization.
          </p>
        </div>
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
          className="cp-newsletter-form"
        >
          <input type="email" name="email" placeholder="Your email address" required />
          <button type="submit">Subscribe</button>
        </form>
      </div>
    </section>
  );
}
