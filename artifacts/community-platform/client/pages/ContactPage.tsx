import { useState } from "react";
import { useConfig } from "../config-context";
import { apiFetch } from "../lib/api";

export default function ContactPage() {
  const config = useConfig();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [formLoadedAt] = useState(Date.now());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  if (!config) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, website: honeypot, formTiming: Date.now() - formLoadedAt }),
      });
      setSubmitted(true);
    } catch { } finally { setLoading(false); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-16">
      <div className="mb-10">
        <h1 className="text-3xl md:text-4xl font-bold font-serif mb-2">Contact Us</h1>
        <p className="text-gray-500">We'd love to hear from you</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          {submitted ? (
            <div className="p-8 border border-green-200 bg-green-50 rounded-lg text-center">
              <div className="text-3xl mb-3">✉️</div>
              <p className="text-xl font-bold mb-2">Message Sent!</p>
              <p className="text-gray-600 text-sm mb-4">We'll get back to you soon.</p>
              <button className="px-4 py-2 border border-gray-300 rounded-md text-sm" onClick={() => { setSubmitted(false); setName(""); setEmail(""); setSubject(""); setMessage(""); }}>
                Send Another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="absolute opacity-0 h-0 w-0 overflow-hidden" aria-hidden="true" tabIndex={-1}>
                <input type="text" name="website" value={honeypot} onChange={e => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Subject</label>
                <input type="text" value={subject} onChange={e => setSubject(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} required rows={6} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none" />
              </div>
              <button type="submit" disabled={loading} className="px-6 py-3 text-white rounded-md font-medium disabled:opacity-50 text-sm" style={{ backgroundColor: "var(--primary-hex)" }}>
                {loading ? "Sending..." : "Send Message"}
              </button>
            </form>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold font-serif">Get in Touch</h2>
          <div className="space-y-4 text-sm text-gray-600">
            {config.contactAddress && (
              <div className="flex gap-3">
                <span className="text-lg">📍</span>
                <div>
                  <p className="font-medium text-gray-800 mb-0.5">Address</p>
                  <p>{config.contactAddress}</p>
                  {config.mailingAddress && <p className="text-gray-400 text-xs mt-0.5">Mailing: {config.mailingAddress}</p>}
                </div>
              </div>
            )}
            {config.contactPhone && (
              <div className="flex gap-3">
                <span className="text-lg">📞</span>
                <div>
                  <p className="font-medium text-gray-800 mb-0.5">Phone</p>
                  <a href={`tel:${config.contactPhone}`} className="hover:underline">{config.contactPhone}</a>
                </div>
              </div>
            )}
            {config.contactEmail && (
              <div className="flex gap-3">
                <span className="text-lg">✉️</span>
                <div>
                  <p className="font-medium text-gray-800 mb-0.5">Email</p>
                  <a href={`mailto:${config.contactEmail}`} className="hover:underline">{config.contactEmail}</a>
                </div>
              </div>
            )}
            {config.meetingDay && (
              <div className="flex gap-3">
                <span className="text-lg">📅</span>
                <div>
                  <p className="font-medium text-gray-800 mb-0.5">Meetings</p>
                  <p>{config.meetingDay}{config.meetingTime ? `, ${config.meetingTime}` : ""}</p>
                  {config.meetingLocation && <p className="text-gray-400 text-xs mt-0.5">{config.meetingLocation}</p>}
                </div>
              </div>
            )}
          </div>

          {(config.socialFacebook || config.socialInstagram || config.socialTwitter || config.socialLinkedin) && (
            <div>
              <p className="font-semibold text-sm mb-3">Follow Us</p>
              <div className="flex gap-3 flex-wrap">
                {config.socialFacebook && <a href={config.socialFacebook} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 border border-gray-200 rounded-md text-xs hover:bg-gray-50">Facebook</a>}
                {config.socialInstagram && <a href={config.socialInstagram} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 border border-gray-200 rounded-md text-xs hover:bg-gray-50">Instagram</a>}
                {config.socialTwitter && <a href={config.socialTwitter} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 border border-gray-200 rounded-md text-xs hover:bg-gray-50">X / Twitter</a>}
                {config.socialLinkedin && <a href={config.socialLinkedin} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 border border-gray-200 rounded-md text-xs hover:bg-gray-50">LinkedIn</a>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
