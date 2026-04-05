import { useState, useRef } from "react";
import { api } from "@/lib/api";

export default function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const renderTime = useRef(Date.now());
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    // Bot protection: honeypot filled → silent drop
    if (honeypot) return;
    // Bot protection: submitted in under 3 seconds → silent drop
    if (Date.now() - renderTime.current < 3000) return;

    setStatus("loading");
    try {
      const res = await api.subscribe(email, undefined, honeypot, renderTime.current);
      setMsg(res.message);
      setStatus("success");
      setEmail("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <section className="newsletter-section">
      <div className="container">
        <h2>Stay Connected with Your Community</h2>
        <p>Get the latest news, event updates, and community spotlights delivered to your inbox.</p>
        {status === "success" ? (
          <p style={{ color: "var(--accent)", fontWeight: 700, fontSize: "1.1rem" }}>
            🎉 {msg}
          </p>
        ) : (
          <form className="newsletter-form" onSubmit={handleSubmit}>
            {/* Honeypot — invisible to real users */}
            <div style={{ display: "none" }} aria-hidden="true">
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={e => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
            <input
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={status === "loading"}
            >
              {status === "loading" ? "Subscribing..." : "Subscribe"}
            </button>
          </form>
        )}
        {status === "error" && (
          <p style={{ color: "#fca5a5", marginTop: "0.75rem", fontSize: "0.9rem" }}>{msg}</p>
        )}
        <p style={{ marginTop: "1rem", fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>
          We respect your privacy. Unsubscribe at any time.
        </p>
      </div>
    </section>
  );
}
