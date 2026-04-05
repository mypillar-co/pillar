import { useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { useOrgConfig } from "@/contexts/OrgConfigContext";

export default function Contact() {
  const { config } = useOrgConfig();
  const { contact, meeting } = config;

  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [msg, setMsg] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await api.sendContact(form);
      setMsg(res.message);
      setStatus("success");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="container">
          <div className="page-header-inner">
            <div className="breadcrumb">
              <Link href="/" style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>Home</Link>
              <span>›</span>
              <span>Contact</span>
            </div>
            <h1>Get in Touch</h1>
            <p>Have a question about membership, events, or how to partner with us? We'd love to hear from you.</p>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="contact-grid">
            {/* Info */}
            <div>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 1.75rem" }}>How to Reach Us</h2>

              {contact.address && (
                <div className="contact-info-item">
                  <div className="contact-info-icon">📍</div>
                  <div>
                    <div className="contact-info-label">Location</div>
                    <div className="contact-info-value">{contact.address}</div>
                    {meeting?.address && (
                      <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                        Meetings at {meeting.venue}{meeting.address ? `, ${meeting.address}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {contact.phone && (
                <div className="contact-info-item">
                  <div className="contact-info-icon">📞</div>
                  <div>
                    <div className="contact-info-label">Phone</div>
                    <div className="contact-info-value">
                      <a href={`tel:${contact.phone.replace(/\D/g, "")}`}>{contact.phone}</a>
                    </div>
                  </div>
                </div>
              )}

              {contact.email && (
                <div className="contact-info-item">
                  <div className="contact-info-icon">✉️</div>
                  <div>
                    <div className="contact-info-label">Email</div>
                    <div className="contact-info-value">
                      <a href={`mailto:${contact.email}`}>{contact.email}</a>
                    </div>
                  </div>
                </div>
              )}

              {meeting?.schedule && (
                <div className="contact-info-item">
                  <div className="contact-info-icon">📅</div>
                  <div>
                    <div className="contact-info-label">Meetings</div>
                    <div className="contact-info-value">{meeting.schedule}</div>
                    {meeting.guestsWelcome && (
                      <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                        Guests always welcome — no reservation needed!
                      </div>
                    )}
                  </div>
                </div>
              )}

              {contact.membershipText && (
                <div style={{ background: "var(--surface)", borderRadius: 12, padding: "1.5rem", marginTop: "1rem", border: "1.5px solid var(--border)" }}>
                  <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 700 }}>
                    Interested in Membership?
                  </h3>
                  <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
                    {contact.membershipText}
                  </p>
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="btn btn-outline btn-sm">
                      Email Us →
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Form */}
            <div>
              {status === "success" ? (
                <div style={{ background: "var(--surface)", borderRadius: 14, padding: "3rem", textAlign: "center", border: "1.5px solid var(--border)" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
                  <h2 style={{ margin: "0 0 0.75rem" }}>Message Sent!</h2>
                  <p style={{ color: "var(--text-muted)" }}>{msg}</p>
                  <button
                    className="btn btn-outline"
                    style={{ marginTop: "1.5rem" }}
                    onClick={() => { setStatus("idle"); setForm({ name: "", email: "", subject: "", message: "" }); }}
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ background: "var(--surface)", borderRadius: 14, padding: "2rem", border: "1.5px solid var(--border)" }}>
                  <h2 style={{ margin: "0 0 1.5rem", fontSize: "1.25rem", fontWeight: 700 }}>Send Us a Message</h2>
                  <div className="form-group">
                    <label className="form-label">Your Name *</label>
                    <input
                      type="text"
                      name="name"
                      className="form-input"
                      placeholder="Full name"
                      value={form.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address *</label>
                    <input
                      type="email"
                      name="email"
                      className="form-input"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Subject</label>
                    <select name="subject" className="form-select" value={form.subject} onChange={handleChange}>
                      <option value="">Select a topic…</option>
                      <option value="Membership Inquiry">Membership Inquiry</option>
                      <option value="Event Information">Event Information</option>
                      <option value="Sponsorship Opportunity">Sponsorship Opportunity</option>
                      <option value="Donation">Donation</option>
                      <option value="General Question">General Question</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Message *</label>
                    <textarea
                      name="message"
                      className="form-textarea"
                      placeholder="Tell us how we can help or how you'd like to get involved…"
                      value={form.message}
                      onChange={handleChange}
                      required
                      rows={5}
                    />
                  </div>
                  {status === "error" && (
                    <div className="alert alert-error">{msg}</div>
                  )}
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    disabled={status === "loading"}
                  >
                    {status === "loading" ? "Sending…" : "Send Message →"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
