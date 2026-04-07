import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useConfig } from "../config-context";

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

export default function HomePage() {
  const config = useConfig();
  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: siteContent } = useQuery<Record<string, string>>({ queryKey: ["/api/site-content"] });

  if (!config) return null;

  const featuredEvents = events?.filter(e => e.featured).slice(0, 3) || events?.slice(0, 3) || [];
  const get = (key: string, fallback = "") => siteContent?.[key] || fallback;
  const heroImage = config.heroImageUrl || get("image_home_hero");

  const stats = config.stats && config.stats.length > 0 ? config.stats : [
    { value: "10+", label: "Annual Events" },
    { value: "500+", label: "Community Members" },
    { value: "5+", label: "Years Active" },
    { value: "100%", label: "Volunteer Driven" },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden min-h-[500px] flex items-center">
        {heroImage && <img src={heroImage} alt="Hero" className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0" style={{ background: heroImage ? "linear-gradient(to right, rgba(0,0,0,0.75), rgba(0,0,0,0.4))" : `linear-gradient(135deg, var(--primary-hex) 0%, var(--accent-hex) 100%)` }} />
        <div className="relative max-w-7xl mx-auto px-4 py-24 md:py-36">
          <div className="max-w-2xl">
            <span className="inline-flex items-center mb-4 px-3 py-1 rounded-full text-xs bg-white/20 text-white border border-white/30">
              {config.orgType || "Community Organization"}
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-3 font-serif leading-tight">
              {config.orgName}
            </h1>
            {(get("home_tagline") || config.tagline) && (
              <p className="text-lg md:text-xl text-white/90 mb-4 font-medium italic">
                {get("home_tagline") || config.tagline}
              </p>
            )}
            {get("home_intro") && (
              <p className="text-base text-white/70 mb-8 leading-relaxed max-w-lg">
                {get("home_intro")}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Link href="/events">
                <button className="px-6 py-3 text-white rounded-md font-medium" style={{ backgroundColor: "var(--primary-hex)" }}>
                  View Events
                </button>
              </Link>
              <Link href="/about">
                <button className="px-6 py-3 bg-white/10 text-white border border-white/20 rounded-md backdrop-blur-sm">
                  Learn More
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="p-6 text-center border border-gray-200 rounded-lg bg-white shadow-sm">
              <p className="text-2xl md:text-3xl font-bold mb-1" style={{ color: "var(--primary-hex)" }}>{stat.value}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming Events */}
      {featuredEvents.length > 0 && (
        <section className="bg-gray-50 py-16">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold font-serif">Upcoming Events</h2>
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
      {config.partners && config.partners.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold font-serif text-center mb-8">Community Partners</h2>
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
      {config.features?.newsletter && (
        <NewsletterSection orgName={config.orgName} location={config.location} />
      )}
    </div>
  );
}

function NewsletterSection({ orgName, location }: { orgName: string; location?: string | null }) {
  return (
    <section className="border-y border-gray-200 bg-white py-16">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <h2 className="text-2xl md:text-3xl font-bold font-serif mb-2">Stay Connected</h2>
        <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
          Get the latest news about {location || orgName} events and community updates.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const email = (form.querySelector('[name="email"]') as HTMLInputElement)?.value;
            if (!email) return;
            await fetch("/api/newsletter/subscribe", {
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
