import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useState } from "react";
import { useConfig } from "../config-context";
import { apiFetch, apiUrl } from "../lib/api";


function formatOrgLocalTime(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match24 = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hour = Math.max(0, Math.min(23, Number(match24[1])));
    const minute = Math.max(0, Math.min(59, Number(match24[2])));
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
  }
  const match12 = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match12) {
    const hour = Math.max(1, Math.min(12, Number(match12[1])));
    const minute = Math.max(0, Math.min(59, Number(match12[2] ?? 0)));
    return `${hour}:${String(minute).padStart(2, "0")} ${match12[3].toUpperCase()}`;
  }
  return raw;
}

export default function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const config = useConfig();
  const { data: event, isLoading } = useQuery<any>({
    queryKey: ["/api/events/slug", slug],
    queryFn: async () => {
      const res = await apiFetch(`/api/events/slug/${slug}`);
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

  const eventTime = formatOrgLocalTime(event.time);

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
            {eventTime && <span>🕐 {eventTime}</span>}
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
          {eventTime && <span>🕐 {eventTime}</span>}
          <span>📍 {event.location}</span>
        </div>
      </section>

      {event.sponsors?.length > 0 && (
        <section className="border-y border-gray-200 bg-gray-50">
          <div className="max-w-3xl mx-auto px-4 py-12">
            <h2 className="text-2xl font-bold font-serif mb-4">Event Sponsors</h2>
            <div className="grid gap-3">
              {event.sponsors.map((sponsor: any) => (
                <a
                  key={`${sponsor.name}-${sponsor.tier ?? ""}`}
                  href={sponsor.website || "#"}
                  target={sponsor.website ? "_blank" : undefined}
                  rel={sponsor.website ? "noopener noreferrer" : undefined}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
                    {sponsor.logoUrl ? <img src={sponsor.logoUrl} alt={sponsor.name} className="h-10 w-10 object-contain" /> : <span className="text-sm font-semibold">{sponsor.name?.[0]}</span>}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{sponsor.name}</p>
                    {sponsor.tier && <p className="text-xs uppercase tracking-wide text-gray-500">{sponsor.tier}</p>}
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {event.isTicketed && <TicketSection slug={slug} eventTitle={event.title} />}
      {event.hasRegistration && !event.isTicketed && <RsvpSection slug={slug} eventTitle={event.title} />}
      <VendorRegistrationSection slug={slug} eventTitle={event.title} />

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

function RsvpSection({ slug, eventTitle }: { slug: string; eventTitle: string }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", quantity: 1 });
  const [honeypot, setHoneypot] = useState("");
  const [formLoadedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/public/events/${slug}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, _hp: honeypot, _ts: formLoadedAt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to save RSVP");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save RSVP");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="event-rsvp" className="border-y border-gray-200 bg-white">
      <div className="max-w-lg mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold font-serif text-center mb-2">RSVP</h2>
        <p className="text-gray-500 text-center text-sm mb-8">{eventTitle}</p>
        {done ? (
          <div className="rounded-lg bg-green-50 border border-green-100 p-4 text-center text-green-700">
            You're on the list. Thanks for RSVPing.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="absolute opacity-0 h-0 w-0 overflow-hidden" aria-hidden="true">
              <input type="text" name="website" value={honeypot} onChange={e => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Full Name</label>
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Attendees</label>
                <input type="number" min="1" max="10" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: Number(e.target.value) || 1 }))} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
            </div>
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-3 text-white rounded-md font-medium disabled:opacity-50" style={{ backgroundColor: "var(--primary-hex)" }}>
              {loading ? "Saving..." : "Submit RSVP"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function VendorRegistrationSection({ slug, eventTitle }: { slug: string; eventTitle: string }) {
  const [form, setForm] = useState({
    businessName: "",
    ownerName: "",
    email: "",
    phone: "",
    products: "",
    isFoodVendor: "",
    foodVendorType: "",
    serveSide: "",
    truckTrailerSize: "",
  });
  const [servSafeFile, setServSafeFile] = useState<File | null>(null);
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [formLoadedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadRegistrationDoc(file: File): Promise<string> {
    const metaRes = await apiFetch("/api/public/registration-docs/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
    });
    if (metaRes.ok) {
      const meta = await metaRes.json() as { uploadURL?: string; objectPath?: string };
      if (meta.uploadURL && meta.objectPath) {
        const uploadRes = await fetch(meta.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (uploadRes.ok) return meta.objectPath;
      }
    }

    const directRes = await apiFetch(`/api/public/events/${slug}/registration-docs/upload`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const direct = await directRes.json().catch(() => ({}));
    if (!directRes.ok || !direct.objectPath) throw new Error(direct.error || "Unable to upload document");
    return direct.objectPath;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const isFoodVendor = form.isFoodVendor === "Yes";
      if (isFoodVendor && !servSafeFile) {
        throw new Error("Please upload a ServSafe certificate for food vendors.");
      }
      let servSafeUrl: string | null = null;
      let insuranceCertUrl: string | null = null;
      if (servSafeFile) servSafeUrl = await uploadRegistrationDoc(servSafeFile);
      if (insuranceFile) insuranceCertUrl = await uploadRegistrationDoc(insuranceFile);

      const res = await apiFetch(`/api/public/events/${slug}/vendor-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.businessName,
          contactName: form.ownerName,
          email: form.email,
          phone: form.phone,
          vendorType: isFoodVendor ? form.foodVendorType : "Non-food vendor",
          products: form.products,
          isFoodVendor,
          foodVendorType: form.foodVendorType,
          serveSide: form.serveSide,
          truckTrailerSize: form.truckTrailerSize,
          description: `Event: ${eventTitle}`,
          servSafeUrl,
          insuranceCertUrl,
          _hp: honeypot,
          _ts: formLoadedAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to submit registration");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit registration");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="vendor-registration" className="border-y border-gray-200 bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold font-serif text-center mb-2">Vendor Registration</h2>
        <p className="text-gray-500 text-center text-sm mb-4">{eventTitle}</p>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-6">
          <strong>Food Vendor Pricing:</strong> Contained truck (28'-30'): $175; Food trailer (24'-28'): $175; Food tent (10'x10'): $125
        </div>
        {done ? (
          <div className="rounded-lg bg-green-50 border border-green-100 p-4 text-center text-green-700">
            Vendor registration received. The organization will review it in the dashboard.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
            <div className="absolute opacity-0 h-0 w-0 overflow-hidden" aria-hidden="true">
              <input type="text" name="website_url" value={honeypot} onChange={e => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-sm font-medium text-gray-700">
                Vendor Business Name *
                <input required placeholder="Business Name" value={form.businessName} onChange={e => setForm(p => ({ ...p, businessName: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-normal" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Owner Name *
                <input required placeholder="First and Last Name" value={form.ownerName} onChange={e => setForm(p => ({ ...p, ownerName: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-normal" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Email *
                <input required type="email" placeholder="example@example.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-normal" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Phone Number *
                <input required type="tel" placeholder="(000) 000-0000" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-normal" />
              </label>
            </div>

            <label className="block text-sm font-medium text-gray-700">
              What you will be selling *
              <input required value={form.products} onChange={e => setForm(p => ({ ...p, products: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-normal" />
            </label>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-gray-700">Are you a food vendor? *</legend>
              <div className="flex gap-4 text-sm text-gray-700">
                {(["Yes", "No"] as const).map(option => (
                  <label key={option} className="inline-flex items-center gap-2">
                    <input type="radio" name="isFoodVendor" value={option} checked={form.isFoodVendor === option} onChange={e => setForm(p => ({ ...p, isFoodVendor: e.target.value, foodVendorType: e.target.value === "No" ? "" : p.foodVendorType, serveSide: e.target.value === "No" ? "" : p.serveSide }))} required />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>

            {form.isFoodVendor === "Yes" && (
              <div className="grid md:grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-gray-700">What type of food vendor are you? *</legend>
                  {(["Food truck", "Food tent", "Food trailer"] as const).map(option => (
                    <label key={option} className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="radio" name="foodVendorType" value={option} checked={form.foodVendorType === option} onChange={e => setForm(p => ({ ...p, foodVendorType: e.target.value, serveSide: e.target.value === "Food truck" ? p.serveSide : "" }))} required={form.isFoodVendor === "Yes"} />
                      {option}
                    </label>
                  ))}
                </fieldset>
                {form.foodVendorType === "Food truck" && (
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-gray-700">Which side do you serve from? *</legend>
                    {(["Driver's side", "Passenger side", "N/A"] as const).map(option => (
                      <label key={option} className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="radio" name="serveSide" value={option} checked={form.serveSide === option} onChange={e => setForm(p => ({ ...p, serveSide: e.target.value }))} required={form.foodVendorType === "Food truck"} />
                        {option}
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>
            )}

            <label className="block text-sm font-medium text-gray-700">
              Size of Truck/Trailer *
              <textarea required placeholder="If you do not have a truck or a trailer, put N/A here." value={form.truckTrailerSize} onChange={e => setForm(p => ({ ...p, truckTrailerSize: e.target.value }))} rows={3} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-normal" />
            </label>

            <div className="grid md:grid-cols-2 gap-4">
              <label className="block text-sm font-medium text-gray-700">
                ServSafe Certificate {form.isFoodVendor === "Yes" ? "*" : ""}
                <span className="block text-xs text-gray-500 mb-1">Required for food vendors. PDF or image, max 10 MB.</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => setServSafeFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700" />
                {servSafeFile && <span className="mt-1 block text-xs text-gray-500">{servSafeFile.name}</span>}
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Insurance Certificate
                <span className="block text-xs text-gray-500 mb-1">List Irwin Borough, 424 Main St, Irwin, PA 15642 as certificate holder/additional insured.</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => setInsuranceFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700" />
                {insuranceFile && <span className="mt-1 block text-xs text-gray-500">{insuranceFile.name}</span>}
              </label>
            </div>
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-3 text-white rounded-md font-medium disabled:opacity-50" style={{ backgroundColor: "var(--primary-hex)" }}>
              {loading ? "Submitting..." : "Submit Vendor Registration"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function TicketSection({ slug, eventTitle }: { slug: string; eventTitle: string }) {
  const [qty, setQty] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [formLoadedAt] = useState(() => Date.now());

  const { data: avail } = useQuery<any>({
    queryKey: ["/api/events", slug, "ticket-availability"],
    queryFn: async () => {
      const res = await apiFetch(`/api/events/${slug}/ticket-availability`);
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
        <div className="max-w-lg mx-auto px-4 py-12">
          <h2 className="text-2xl font-bold font-serif text-center mb-2">Sold Out</h2>
          <p className="text-gray-500 text-center text-sm mb-8">
            All tickets for {eventTitle} have been sold. Join the waitlist and we'll notify you if a spot opens up.
          </p>
          <WaitlistForm eventId={slug} eventTitle={eventTitle} />
        </div>
      </section>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/events/${slug}/ticket-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: name,
          buyerEmail: email,
          quantity: qty,
          _hp: honeypot,
          _ts: formLoadedAt,
        }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError("Too many requests. Please wait a moment before trying again.");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch {
      setError("Unable to connect. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="ticket-purchase" className="border-y border-gray-200 bg-white">
      <div className="max-w-lg mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold font-serif text-center mb-2">Get Your Tickets</h2>
        <p className="text-gray-500 text-center text-sm mb-8">{eventTitle}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="absolute opacity-0 h-0 w-0 overflow-hidden" aria-hidden="true">
            <input type="text" name="website" value={honeypot} onChange={e => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" />
          </div>
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
          {error && <p className="text-sm text-red-600 text-center px-2">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-3 text-white rounded-md font-medium disabled:opacity-50" style={{ backgroundColor: "var(--primary-hex)" }}>
            {loading ? "Processing..." : `Purchase — $${(price * qty).toFixed(2)}`}
          </button>
        </form>
      </div>
    </section>
  );
}

function WaitlistForm({ eventId, eventTitle: _eventTitle }: { eventId: string; eventTitle: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/public/events/${eventId}/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-6">
        <p className="text-green-600 font-medium">You're on the waitlist!</p>
        <p className="text-gray-500 text-sm mt-1">We'll email you if a spot opens up.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Full Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} required
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button type="submit" disabled={loading}
        className="w-full py-3 text-white rounded-md font-medium disabled:opacity-50"
        style={{ backgroundColor: "var(--primary-hex)" }}>
        {loading ? "Joining…" : "Join Waitlist"}
      </button>
    </form>
  );
}
