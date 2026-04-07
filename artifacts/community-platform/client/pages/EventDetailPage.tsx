import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useState } from "react";
import { useConfig } from "../config-context";

export default function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const config = useConfig();
  const { data: event, isLoading } = useQuery<any>({
    queryKey: ["/api/events/slug", slug],
    queryFn: async () => {
      const res = await fetch(`/api/events/slug/${slug}`);
      if (!res.ok) throw new Error("Event not found");
      return res.json();
    },
    enabled: !!slug,
  });

  if (!config) return null;
  if (isLoading) return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-4">
      {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-100 animate-pulse rounded" />)}
    </div>
  );
  if (!event) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold mb-4">Event Not Found</h1>
      <Link href="/events"><button className="px-4 py-2 border border-gray-300 rounded-md text-sm">Back to Events</button></Link>
    </div>
  );

  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden min-h-[300px] flex items-end">
        {event.imageUrl && <img src={event.imageUrl} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.8))" }} />
        <div className="relative max-w-7xl mx-auto px-4 py-16 w-full">
          <Link href="/events">
            <button className="text-white/70 text-sm mb-4 hover:text-white block">← All Events</button>
          </Link>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-white/20 text-white border border-white/30 mb-3">
            📅 {event.category}
          </span>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-3 font-serif">{event.title}</h1>
          <div className="flex flex-wrap gap-4 text-white/80 text-sm">
            <span>📅 {event.date}</span>
            <span>🕐 {event.time}</span>
            <span>📍 {event.location}</span>
          </div>
          {event.isTicketed && (
            <div className="mt-4">
              <a href="#ticket-purchase">
                <button className="px-6 py-3 text-white rounded-md font-medium" style={{ backgroundColor: "var(--primary-hex)" }}>
                  Get Tickets 🎟️
                </button>
              </a>
            </div>
          )}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold font-serif mb-4">About This Event</h2>
        <p className="text-gray-600 leading-relaxed">{event.description}</p>
        <div className="flex flex-wrap gap-4 mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
          <span>📅 {event.date}</span>
          <span>🕐 {event.time}</span>
          <span>📍 {event.location}</span>
        </div>
      </section>

      {event.isTicketed && <TicketSection slug={slug} eventTitle={event.title} />}

      <section className="border-t border-gray-200 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-12 text-center">
          <h2 className="text-xl font-bold font-serif mb-2">Questions?</h2>
          <p className="text-gray-500 text-sm mb-4">Contact us at {config.contactEmail || config.contactPhone || "the organization"}</p>
          <Link href="/contact">
            <button className="px-5 py-2 text-white rounded-md text-sm" style={{ backgroundColor: "var(--primary-hex)" }}>
              Get in Touch
            </button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function TicketSection({ slug, eventTitle }: { slug: string; eventTitle: string }) {
  const [qty, setQty] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: avail } = useQuery<any>({
    queryKey: ["/api/events", slug, "ticket-availability"],
    queryFn: async () => {
      const res = await fetch(`/api/events/${slug}/ticket-availability`);
      if (!res.ok) throw new Error("Not available");
      return res.json();
    },
    enabled: !!slug,
  });

  if (!avail) return null;
  const price = parseFloat(avail.ticketPrice || "0");
  const maxQty = avail.remaining != null ? Math.min(10, avail.remaining) : 10;

  if (!avail.available) {
    return (
      <section id="ticket-purchase" className="border-y border-gray-200 bg-white">
        <div className="max-w-lg mx-auto px-4 py-12 text-center">
          <h2 className="text-2xl font-bold font-serif mb-2">Sold Out</h2>
          <p className="text-gray-500">All tickets for {eventTitle} have been sold.</p>
        </div>
      </section>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${slug}/ticket-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerName: name, buyerEmail: email, quantity: qty }),
      });
      const data = await res.json();
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch { } finally { setLoading(false); }
  };

  return (
    <section id="ticket-purchase" className="border-y border-gray-200 bg-white">
      <div className="max-w-lg mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold font-serif text-center mb-2">Get Your Tickets</h2>
        <p className="text-gray-500 text-center text-sm mb-8">{eventTitle}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Full Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} className="w-10 h-10 border border-gray-300 rounded-md">-</button>
              <span className="text-xl font-bold w-8 text-center">{qty}</span>
              <button type="button" onClick={() => setQty(q => Math.min(maxQty, q + 1))} className="w-10 h-10 border border-gray-300 rounded-md">+</button>
            </div>
          </div>
          <div className="flex justify-between items-center p-4 bg-gray-50 rounded-md">
            <span className="text-sm text-gray-500">{qty} × ${price.toFixed(2)}</span>
            <span className="text-xl font-bold">${(price * qty).toFixed(2)}</span>
          </div>
          {avail.remaining != null && <p className="text-xs text-gray-400 text-center">{avail.remaining} tickets remaining</p>}
          <button type="submit" disabled={loading} className="w-full py-3 text-white rounded-md font-medium disabled:opacity-50" style={{ backgroundColor: "var(--primary-hex)" }}>
            {loading ? "Processing..." : `Purchase — $${(price * qty).toFixed(2)}`}
          </button>
        </form>
      </div>
    </section>
  );
}
