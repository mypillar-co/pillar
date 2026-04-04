import { useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function path(p: string) { return `${BASE}${p}`; }

export default function Contact() {
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
              <Link href={path("/")} style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>Home</Link>
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

              <div className="contact-info-item">
                <div className="contact-info-icon">📍</div>
                <div>
                  <div className="contact-info-label">Location</div>
                  <div className="contact-info-value">Irwin, PA 15642</div>
                  <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    Meetings at Irwin Fire Hall, 221 Main St
                  </div>
                </div>
              </div>

              <div className="contact-info-item">
                <div className="contact-info-icon">📞</div>
                <div>
                  <div className="contact-info-label">Phone</div>
                  <div className="contact-info-value">
                    <a href="tel:7245550142">(724) 555-0142</a>
                  </div>
                </div>
              </div>

              <div className="contact-info-item">
                <div className="contact-info-icon">✉️</div>
                <div>
                  <div className="contact-info-label">Email</div>
                  <div className="contact-info-value">
                    <a href="mailto:info@norwinrotary.org">info@norwinrotary.org</a>
                  </div>
                </div>
              </div>

              <div className="contact-info-item">
                <div className="contact-info-icon">📅</div>
                <div>
                  <div className="contact-info-label">Weekly Meetings</div>
                  <div className="contact-info-value">Every Tuesday at 12:00 PM</div>
                  <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    Guests always welcome — no reservation needed!
                  </div>
                </div>
              </div>

              <div style={{ background: "var(--surface)", borderRadius: 12, padding: "1.5rem", marginTop: "1rem", border: "1.5px solid var(--border)" }}>
                <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 700 }}>
                  Interested in Membership?
                </h3>
                <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
                  Rotary membership is open to business and community leaders who want to make a
                  difference. Come to a Tuesday meeting as our guest — no commitment required.
                </p>
                <a href="mailto:info@norwinrotary.org" className="btn btn-outline btn-sm">
                  Email Us →
                </a>
              </div>
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
