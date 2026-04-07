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
  isTicketed: boolean | null;
  externalLink: string | null;
}

export default function EventsPage() {
  const config = useConfig();
  const { data: events, isLoading } = useQuery<Event[]>({ queryKey: ["/api/events"] });

  if (!config) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold font-serif mb-2">Events</h1>
        <p className="text-gray-500">Upcoming events and activities in {config.location || "our community"}</p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="h-48 bg-gray-100 animate-pulse" />
              <div className="p-5 space-y-2">
                <div className="h-5 w-2/3 bg-gray-100 animate-pulse rounded" />
                <div className="h-4 w-full bg-gray-100 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && events && events.length === 0 && (
        <div className="text-center py-20 border border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-400 mb-2">No events scheduled</p>
          <p className="text-sm text-gray-400">Check back soon!</p>
        </div>
      )}

      {!isLoading && events && events.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map(event => {
            const href = event.externalLink || (event.slug ? `/events/${event.slug}` : "#");
            const isExternal = !!event.externalLink;
            const CardContent = (
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white cursor-pointer hover:shadow-md transition-shadow h-full">
                {event.imageUrl && <img src={event.imageUrl} alt={event.title} className="w-full h-48 object-cover" />}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-block px-2 py-1 text-xs rounded-full text-white" style={{ backgroundColor: "var(--accent-hex)" }}>{event.category}</span>
                    {event.isTicketed && <span className="inline-block px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">🎟 Ticketed</span>}
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{event.title}</h3>
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2">{event.description}</p>
                  <div className="flex flex-col gap-1 text-xs text-gray-400">
                    <span>📅 {event.date}</span>
                    <span>🕐 {event.time}</span>
                    <span>📍 {event.location}</span>
                  </div>
                </div>
              </div>
            );

            return isExternal ? (
              <a key={event.id} href={href} target="_blank" rel="noopener noreferrer">{CardContent}</a>
            ) : (
              <Link key={event.id} href={href}>{CardContent}</Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
