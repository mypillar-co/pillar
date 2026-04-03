import type { SiteBlock } from "@workspace/db";
import type { SiteTheme } from "@workspace/db";
import type { SiteEventItem, SiteSponsorItem, SiteAnnouncementItem } from "../types/site-bindings.js";
import { logError } from "./siteLogService.js";
import { getCtaLabel } from "../utils/ctaHelpers.js";

const SERVICE = "blockRenderer";

function esc(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function themeVars(theme: SiteTheme): string {
  return `--color-primary: ${esc(theme.colorPrimary ?? "#1e3a5f")};
    --color-secondary: ${esc(theme.colorSecondary ?? "#2d5080")};
    --color-accent: ${esc(theme.colorAccent ?? "#f59e0b")};
    --color-surface: ${esc(theme.colorSurface ?? "#f8fafc")};
    --color-text: ${esc(theme.colorText ?? "#111827")};
    --font-heading: '${esc(theme.fontHeadingKey ?? "DM Serif Display")}', serif;
    --font-body: '${esc(theme.fontBodyKey ?? "DM Sans")}', sans-serif;
    --radius: ${esc(theme.radiusScale ?? "14px")};`;
}

function renderHero(block: SiteBlock, theme: SiteTheme): string {
  const content = block.contentJson as Record<string, unknown>;
  const variant = block.variantKey ?? "hero-centered";

  const headline = esc(content.headline ?? content.title ?? "Welcome");
  const subheadline = esc(content.subheadline ?? content.tagline ?? "");
  const ctaText = esc(content.ctaText ?? "Learn More");
  const ctaUrl = esc(content.ctaUrl ?? "#contact");
  const imageUrl = esc(content.imageUrl ?? "");

  const base = `<style>
    .block-hero { position: relative; min-height: 70vh; display: flex; align-items: center; background: linear-gradient(135deg, var(--color-primary), #0a0a14); overflow: hidden; }
    .block-hero-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.45); }
    .block-hero-content { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; padding: 80px 24px 60px; }
    .block-hero h1 { font-family: var(--font-heading); font-size: clamp(2.2rem, 5vw, 4rem); font-weight: 400; color: #fff; line-height: 1.1; margin-bottom: 20px; }
    .block-hero p { font-size: 1.1rem; color: rgba(255,255,255,0.8); max-width: 560px; line-height: 1.7; margin-bottom: 36px; }
    .block-hero-cta { display: inline-flex; align-items: center; padding: 14px 28px; background: var(--color-accent); color: #fff; font-weight: 600; border-radius: var(--radius); text-decoration: none; transition: all 0.25s; }
    .block-hero-cta:hover { filter: brightness(1.1); transform: translateY(-2px); }
  </style>`;

  if (variant === "hero-split") {
    return base + `<section class="block-hero" style="min-height: 60vh;">
      ${imageUrl ? `<img src="${imageUrl}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.25;">` : ""}
      <div class="block-hero-overlay"></div>
      <div class="block-hero-content" style="display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;">
        <div>
          <h1>${headline}</h1>
          ${subheadline ? `<p>${subheadline}</p>` : ""}
          <a href="${ctaUrl}" class="block-hero-cta">${ctaText}</a>
        </div>
        <div></div>
      </div>
    </section>`;
  }

  if (variant === "hero-mission") {
    const mission = esc(content.mission ?? subheadline);
    return base + `<section class="block-hero" style="text-align:center;min-height:72vh;">
      <div class="block-hero-overlay" style="background:rgba(0,0,0,0.55);"></div>
      <div class="block-hero-content" style="text-align:center;max-width:860px;margin:auto;">
        <h1 style="font-size:clamp(2rem,4.5vw,3.6rem);margin-bottom:24px;">${headline}</h1>
        ${mission ? `<p style="font-size:clamp(1.1rem,2vw,1.35rem);font-style:italic;max-width:680px;margin:0 auto 40px;color:rgba(255,255,255,0.9);line-height:1.65;">"${mission}"</p>` : ""}
        <a href="${ctaUrl}" class="block-hero-cta" style="padding:16px 36px;font-size:1.05rem;">${ctaText}</a>
      </div>
    </section>`;
  }

  if (variant === "hero-event-featured") {
    const eventName = esc(content.eventName ?? headline);
    const eventDate = esc(content.eventDate ?? "");
    const eventTime = esc(content.eventTime ?? "");
    const eventLocation = esc(content.eventLocation ?? content.location ?? "");
    return base + `<section class="block-hero" style="min-height:75vh;">
      ${imageUrl ? `<img src="${imageUrl}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.4;">` : ""}
      <div class="block-hero-overlay" style="background:rgba(0,0,0,0.5);"></div>
      <div class="block-hero-content">
        <p style="color:var(--color-accent);font-weight:700;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:20px;">Featured Event</p>
        <h1 style="font-size:clamp(2.4rem,6vw,5rem);line-height:1.05;">${eventName}</h1>
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:24px;margin-top:8px;">
          ${eventDate ? `<span style="font-size:1rem;color:rgba(255,255,255,0.85);font-weight:500;">${eventDate}${eventTime ? ` &nbsp;&middot;&nbsp; ${eventTime}` : ""}</span>` : ""}
          ${eventLocation ? `<span style="font-size:1rem;color:rgba(255,255,255,0.7);">${eventLocation}</span>` : ""}
        </div>
        ${subheadline ? `<p style="max-width:520px;">${subheadline}</p>` : ""}
        <a href="${ctaUrl}" class="block-hero-cta" style="margin-top:8px;">${ctaText}</a>
      </div>
    </section>`;
  }

  return base + `<section class="block-hero" style="text-align:center;">
    ${imageUrl ? `<img src="${imageUrl}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.3;">` : ""}
    <div class="block-hero-overlay"></div>
    <div class="block-hero-content" style="text-align:center;">
      <h1>${headline}</h1>
      ${subheadline ? `<p style="margin:0 auto 36px;">${subheadline}</p>` : ""}
      <a href="${ctaUrl}" class="block-hero-cta">${ctaText}</a>
    </div>
  </section>`;
}

function renderAbout(block: SiteBlock, theme: SiteTheme): string {
  const content = block.contentJson as Record<string, unknown>;
  const heading = esc(content.heading ?? "About Us");
  const body = esc(content.body ?? content.description ?? "");
  const imageUrl = esc(content.imageUrl ?? "");
  const variant = block.variantKey ?? "about-simple";

  const base = `<style>
    .block-about { padding: 80px 0; }
    .block-about-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .block-about h2 { font-family: var(--font-heading); font-size: clamp(1.8rem, 3vw, 2.8rem); color: var(--color-text); margin-bottom: 20px; }
    .block-about p { font-size: 1.05rem; line-height: 1.8; color: #4b5563; max-width: 700px; }
    .block-about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; }
    .block-about-img { border-radius: var(--radius); overflow: hidden; aspect-ratio: 4/3; background: var(--color-surface); }
    .block-about-img img { width: 100%; height: 100%; object-fit: cover; }
    @media (max-width: 768px) { .block-about-grid { grid-template-columns: 1fr; } }
  </style>`;

  if (variant === "about-centered") {
    return base + `<section class="block-about">
      <div class="block-about-inner" style="text-align:center;">
        <h2>${heading}</h2>
        ${body ? `<p style="margin:0 auto;">${body}</p>` : ""}
      </div>
    </section>`;
  }

  if (variant === "about-split" || variant === "about-columns") {
    return base + `<section class="block-about">
      <div class="block-about-inner">
        <div class="block-about-grid">
          <div>
            <h2>${heading}</h2>
            ${body ? `<p>${body}</p>` : ""}
          </div>
          <div class="block-about-img">
            ${imageUrl ? `<img src="${imageUrl}" alt="${heading}">` : `<div style="height:300px;background:linear-gradient(135deg,var(--color-primary)20,var(--color-surface));"></div>`}
          </div>
        </div>
      </div>
    </section>`;
  }

  return base + `<section class="block-about">
    <div class="block-about-inner">
      <h2>${heading}</h2>
      ${body ? `<p>${body}</p>` : ""}
    </div>
  </section>`;
}

function renderStats(block: SiteBlock, theme: SiteTheme): string {
  const content = block.contentJson as Record<string, unknown>;
  const stats = (content.stats as Array<{ value?: string; label?: string }>) ?? [];

  const validStats = stats.filter(s => s.value != null && s.value !== "" && s.value !== "0");
  if (validStats.length === 0) return "";

  const variant = block.variantKey ?? "stats-strip";

  const base = `<style>
    .block-stats { background: #0f0f0f; padding: 56px 0; }
    .block-stats-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1px; background: rgba(255,255,255,0.08); }
    .block-stats-item { background: #0f0f0f; text-align: center; padding: 32px 16px; }
    .block-stats-value { font-family: var(--font-heading); font-size: clamp(2rem, 4vw, 3rem); color: var(--color-accent); line-height: 1; margin-bottom: 8px; }
    .block-stats-label { font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.45); }
  </style>`;

  return base + `<section class="block-stats">
    <div class="block-stats-inner">
      ${validStats.map(s => `<div class="block-stats-item">
        <div class="block-stats-value">${esc(s.value)}</div>
        <div class="block-stats-label">${esc(s.label)}</div>
      </div>`).join("")}
    </div>
  </section>`;
}

function renderCards(block: SiteBlock, theme: SiteTheme): string {
  const content = block.contentJson as Record<string, unknown>;
  const heading = esc(content.heading ?? content.title ?? "");
  const cards = (content.cards as Array<{ title?: string; description?: string; icon?: string; imageUrl?: string }>) ?? [];
  const variant = block.variantKey ?? "cards-3up";

  const base = `<style>
    .block-cards { padding: 80px 0; background: var(--color-surface); }
    .block-cards-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .block-cards h2 { font-family: var(--font-heading); font-size: clamp(1.8rem, 3vw, 2.6rem); color: var(--color-text); text-align: center; margin-bottom: 48px; }
    .block-cards-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .block-cards-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
    .block-card { background: #fff; border-radius: var(--radius); padding: 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); border-top: 4px solid var(--color-primary); }
    .block-card-icon { font-size: 2.4rem; margin-bottom: 16px; line-height: 1; }
    .block-card h3 { font-family: var(--font-heading); font-size: 1.15rem; color: var(--color-text); margin-bottom: 10px; }
    .block-card p { font-size: 0.9rem; line-height: 1.75; color: #6b7280; }
    .block-card-icon-variant { background: #fff; border-radius: var(--radius); padding: 32px 28px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); display: flex; flex-direction: column; align-items: flex-start; }
    .icon-circle { width: 52px; height: 52px; background: color-mix(in srgb, var(--color-primary) 12%, transparent); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 18px; flex-shrink: 0; }
    @media (max-width: 768px) { .block-cards-grid-3, .block-cards-grid-2 { grid-template-columns: 1fr; } }
  </style>`;

  // Icon cards variant for membership benefits
  if (variant === "cards-icon") {
    return base + `<section class="block-cards">
      <div class="block-cards-inner">
        ${heading ? `<h2>${heading}</h2>` : ""}
        <div class="block-cards-grid-3">
          ${cards.map(c => `<div class="block-card-icon-variant">
            <div class="icon-circle">${esc(c.icon ?? "✦")}</div>
            <h3 style="font-family:var(--font-heading);font-size:1.1rem;color:var(--color-text);margin-bottom:8px;">${esc(c.title ?? "")}</h3>
            ${c.description ? `<p style="font-size:0.88rem;line-height:1.7;color:#6b7280;">${esc(c.description)}</p>` : ""}
          </div>`).join("")}
        </div>
      </div>
    </section>`;
  }

  const cols = variant === "cards-2up" ? "block-cards-grid-2" : "block-cards-grid-3";

  return base + `<section class="block-cards">
    <div class="block-cards-inner">
      ${heading ? `<h2>${heading}</h2>` : ""}
      <div class="${cols}">
        ${cards.map(c => `<div class="block-card">
          ${c.icon ? `<div class="block-card-icon">${esc(c.icon)}</div>` : ""}
          <h3>${esc(c.title ?? "")}</h3>
          ${c.description ? `<p>${esc(c.description)}</p>` : ""}
        </div>`).join("")}
      </div>
    </div>
  </section>`;
}

function renderEventsList(block: SiteBlock, theme: SiteTheme, liveData?: unknown): string {
  const events = (Array.isArray(liveData) ? liveData : []) as SiteEventItem[];
  const content = block.contentJson as Record<string, unknown>;
  const heading = esc(content.heading ?? "Upcoming Events");
  const variant = block.variantKey ?? "events-list-standard";

  if (events.length === 0) return "";

  const base = `<style>
    .block-events { padding: 80px 0; }
    .block-events-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .block-events h2 { font-family: var(--font-heading); font-size: clamp(1.8rem, 3vw, 2.6rem); text-align: center; margin-bottom: 48px; }
    .event-row { display: grid; grid-template-columns: 80px 1fr auto; gap: 20px; align-items: center; padding: 20px; background: #fff; border-radius: var(--radius); margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-left: 4px solid var(--color-primary); }
    .event-date { text-align: center; }
    .event-date-month { font-size: 0.65rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.1em; color: var(--color-accent); }
    .event-date-day { font-family: var(--font-heading); font-size: 2rem; color: var(--color-primary); line-height: 1; }
    .event-title { font-weight: 600; color: var(--color-text); margin-bottom: 4px; }
    .event-location { font-size: 0.85rem; color: #6b7280; }
    .event-cta { display: inline-flex; padding: 8px 18px; background: var(--color-primary); color: #fff; border-radius: 8px; font-size: 0.85rem; font-weight: 600; text-decoration: none; white-space: nowrap; }
    .badge-sold-out { display: inline-block; padding: 2px 8px; background: #fee2e2; color: #dc2626; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-left: 8px; }
    .events-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; }
    .event-card { background: #fff; border-radius: var(--radius); overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
    .event-card-body { padding: 20px; }
    .event-card-date { font-size: 0.8rem; color: var(--color-accent); font-weight: 600; margin-bottom: 8px; }
    .event-card-title { font-weight: 600; margin-bottom: 8px; }
    .event-card-cta { display: block; margin-top: 12px; padding: 8px 16px; background: var(--color-primary); color: #fff; border-radius: 8px; text-align: center; text-decoration: none; font-size: 0.85rem; }
  </style>`;

  const renderEventRow = (event: SiteEventItem) => {
    try {
      const date = event.date ? new Date(event.date) : null;
      const month = date ? date.toLocaleString("en-US", { month: "short" }).toUpperCase() : "";
      const day = date ? String(date.getDate()) : "";
      const badge = event.isSoldOut ? `<span class="badge-sold-out">Sold Out</span>` : "";

      return `<div class="event-row">
        <div class="event-date">
          <div class="event-date-month">${month}</div>
          <div class="event-date-day">${day}</div>
        </div>
        <div>
          <div class="event-title">${esc(event.name)}${badge}</div>
          ${event.location ? `<div class="event-location">📍 ${esc(event.location)}</div>` : ""}
          ${event.showPricing && event.price ? `<div style="font-size:0.85rem;margin-top:4px;color:#6b7280;">$${event.price}</div>` : ""}
        </div>
        <a href="${esc(event.ctaUrl)}" class="event-cta">${esc(event.ctaLabel)}</a>
      </div>`;
    } catch {
      return `<!-- event render error -->`;
    }
  };

  if (variant === "events-list-compact") {
    return base + `<section class="block-events" style="padding:40px 0;">
      <div class="block-events-inner">
        ${heading ? `<h2 style="font-size:clamp(1.4rem,2.5vw,2rem);margin-bottom:24px;">${heading}</h2>` : ""}
        ${events.slice(0, 4).map(event => {
          try {
            const date = event.date ? new Date(event.date) : null;
            const dateStr = date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
            return `<div style="display:flex;align-items:center;gap:16px;padding:12px 16px;border-bottom:1px solid #f0f0f0;">
              <span style="font-weight:700;color:var(--color-accent);min-width:48px;font-size:0.85rem;">${dateStr}</span>
              <span style="font-weight:500;color:var(--color-text);flex:1;">${esc(event.name)}</span>
              <a href="${esc(event.ctaUrl)}" style="font-size:0.8rem;color:var(--color-primary);font-weight:600;white-space:nowrap;">${esc(event.ctaLabel)}</a>
            </div>`;
          } catch { return ""; }
        }).join("")}
      </div>
    </section>`;
  }

  if (variant === "events-list-card-grid") {
    return base + `<section class="block-events">
      <div class="block-events-inner">
        ${heading ? `<h2>${heading}</h2>` : ""}
        <div class="events-grid">
          ${events.map(e => {
            try {
              const date = e.date ? new Date(e.date) : null;
              const dateStr = date ? date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
              return `<div class="event-card">
                ${e.imageUrl ? `<img src="${esc(e.imageUrl)}" alt="${esc(e.name)}" style="width:100%;height:160px;object-fit:cover;">` : ""}
                <div class="event-card-body">
                  <div class="event-card-date">${dateStr}</div>
                  <div class="event-card-title">${esc(e.name)}${e.isSoldOut ? `<span class="badge-sold-out">Sold Out</span>` : ""}</div>
                  ${e.location ? `<div style="font-size:0.8rem;color:#6b7280;">📍 ${esc(e.location)}</div>` : ""}
                  <a href="${esc(e.ctaUrl)}" class="event-card-cta">${esc(e.ctaLabel)}</a>
                </div>
              </div>`;
            } catch {
              return `<!-- event render error -->`;
            }
          }).join("")}
        </div>
      </div>
    </section>`;
  }

  return base + `<section class="block-events">
    <div class="block-events-inner">
      ${heading ? `<h2>${heading}</h2>` : ""}
      ${events.map(renderEventRow).join("")}
    </div>
  </section>`;
}

function renderFeaturedEvent(block: SiteBlock, theme: SiteTheme, liveData?: unknown): string {
  const events = (Array.isArray(liveData) ? liveData : []) as SiteEventItem[];
  const event = events[0];
  if (!event) return "";

  const date = event.date ? new Date(event.date) : null;
  const dateStr = date ? date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

  return `<style>
    .block-featured-event { padding: 60px 0; background: linear-gradient(135deg, var(--color-primary)10, var(--color-surface)); }
    .block-featured-event-inner { max-width: 1000px; margin: 0 auto; padding: 0 24px; }
    .featured-event-banner { background: var(--color-primary); border-radius: var(--radius); padding: 48px; color: #fff; display: grid; grid-template-columns: 1fr auto; gap: 32px; align-items: center; }
    .featured-event-tag { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-accent); margin-bottom: 12px; }
    .featured-event-name { font-family: var(--font-heading); font-size: clamp(1.5rem, 3vw, 2.4rem); margin-bottom: 12px; }
    .featured-event-date { font-size: 1rem; opacity: 0.85; }
    .featured-event-cta { display: inline-flex; padding: 14px 28px; background: var(--color-accent); color: #fff; border-radius: var(--radius); font-weight: 600; text-decoration: none; white-space: nowrap; }
    @media (max-width: 600px) { .featured-event-banner { grid-template-columns: 1fr; } }
  </style>
  <section class="block-featured-event">
    <div class="block-featured-event-inner">
      <div class="featured-event-banner">
        <div>
          <div class="featured-event-tag">Featured Event</div>
          <div class="featured-event-name">${esc(event.name)}</div>
          <div class="featured-event-date">📅 ${dateStr}${event.location ? ` · 📍 ${esc(event.location)}` : ""}</div>
        </div>
        <a href="${esc(event.ctaUrl)}" class="featured-event-cta">${esc(event.ctaLabel)}</a>
      </div>
    </div>
  </section>`;
}

function renderSponsorGrid(block: SiteBlock, theme: SiteTheme, liveData?: unknown): string {
  const sponsors = (Array.isArray(liveData) ? liveData : []) as SiteSponsorItem[];
  if (sponsors.length === 0) return "";

  const variant = block.variantKey ?? "sponsor-grid-standard";
  const content = block.contentJson as Record<string, unknown>;
  const heading = esc(content.heading ?? "Our Sponsors & Partners");

  const base = `<style>
    .block-sponsors { padding: 60px 0; background: var(--color-surface); }
    .block-sponsors-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .block-sponsors h2 { font-family: var(--font-heading); font-size: clamp(1.5rem, 2.5vw, 2.2rem); text-align: center; margin-bottom: 40px; }
    .sponsor-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 20px; }
    .sponsor-item { display: flex; align-items: center; justify-content: center; padding: 20px; background: #fff; border-radius: var(--radius); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .sponsor-item img { max-width: 100%; max-height: 60px; object-fit: contain; }
    .sponsor-item-name { font-weight: 600; color: var(--color-text); text-align: center; font-size: 0.9rem; }
    .sponsor-tier { margin-bottom: 32px; }
    .sponsor-tier-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-accent); text-align: center; margin-bottom: 16px; }
  </style>`;

  if (variant === "sponsor-grid-tiered") {
    const byTier = sponsors.reduce((acc, s) => {
      const tier = s.tierRank;
      if (!acc[tier]) acc[tier] = [];
      acc[tier].push(s);
      return acc;
    }, {} as Record<number, SiteSponsorItem[]>);

    const tierNames: Record<number, string> = { 0: "Presenting", 1: "Gold", 2: "Silver", 3: "Bronze", 4: "Supporting" };

    // Tier presentation config: presenting sponsors are larger and more prominent
    const tierConfig: Record<number, { cols: string; maxHeight: string; padding: string; border: string }> = {
      0: { cols: "repeat(2, 1fr)", maxHeight: "100px", padding: "32px 40px", border: "2px solid var(--color-accent)" },
      1: { cols: "repeat(3, 1fr)", maxHeight: "80px", padding: "24px 28px", border: "1px solid #e5e7eb" },
      2: { cols: "repeat(4, 1fr)", maxHeight: "60px", padding: "18px 20px", border: "1px solid #f0f0f0" },
      3: { cols: "repeat(5, 1fr)", maxHeight: "50px", padding: "14px 16px", border: "1px solid #f0f0f0" },
      4: { cols: "repeat(5, 1fr)", maxHeight: "44px", padding: "12px 14px", border: "1px solid #f0f0f0" },
    };

    return base + `<section class="block-sponsors">
      <div class="block-sponsors-inner">
        ${heading ? `<h2>${heading}</h2>` : ""}
        ${Object.entries(byTier).sort(([a], [b]) => Number(a) - Number(b)).map(([tier, tierSponsors]) => {
          const t = Number(tier);
          const cfg = tierConfig[t] ?? tierConfig[4];
          return `<div class="sponsor-tier">
            <div class="sponsor-tier-label">${tierNames[t] ?? `Tier ${tier}`} Sponsor${tierSponsors.length !== 1 ? "s" : ""}</div>
            <div style="display:grid;grid-template-columns:${cfg.cols};gap:${t === 0 ? "24px" : "16px"};margin-bottom:8px;">
              ${tierSponsors.map(s => `<div class="sponsor-item" style="padding:${cfg.padding};border:${cfg.border};">
                ${s.logoUrl
                  ? `<img src="${esc(s.logoUrl)}" alt="${esc(s.name)}" style="max-width:100%;max-height:${cfg.maxHeight};object-fit:contain;">`
                  : `<div class="sponsor-item-name" style="font-size:${t === 0 ? "1.1rem" : t === 1 ? "1rem" : "0.875rem"};">${esc(s.name)}</div>`}
              </div>`).join("")}
            </div>
          </div>`;
        }).join("")}
      </div>
    </section>`;
  }

  return base + `<section class="block-sponsors">
    <div class="block-sponsors-inner">
      ${heading ? `<h2>${heading}</h2>` : ""}
      <div class="sponsor-grid">
        ${sponsors.map(s => `<div class="sponsor-item">
          ${s.logoUrl ? `<img src="${esc(s.logoUrl)}" alt="${esc(s.name)}">` : `<div class="sponsor-item-name">${esc(s.name)}</div>`}
        </div>`).join("")}
      </div>
    </div>
  </section>`;
}

function renderAnnouncements(block: SiteBlock, theme: SiteTheme, liveData?: unknown): string {
  const announcements = (Array.isArray(liveData) ? liveData : []) as SiteAnnouncementItem[];
  if (announcements.length === 0) return "";

  const content = block.contentJson as Record<string, unknown>;
  const heading = esc(content.heading ?? "News & Announcements");

  return `<style>
    .block-announcements { padding: 60px 0; }
    .block-announcements-inner { max-width: 900px; margin: 0 auto; padding: 0 24px; }
    .block-announcements h2 { font-family: var(--font-heading); font-size: clamp(1.6rem, 2.5vw, 2.2rem); margin-bottom: 32px; }
    .announcement-item { padding: 20px 24px; background: #fff; border-radius: var(--radius); margin-bottom: 12px; border-left: 4px solid var(--color-accent); box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
    .announcement-title { font-weight: 600; color: var(--color-text); margin-bottom: 8px; }
    .announcement-body { font-size: 0.9rem; color: #6b7280; line-height: 1.6; }
    .announcement-date { font-size: 0.78rem; color: #9ca3af; margin-top: 8px; }
  </style>
  <section class="block-announcements">
    <div class="block-announcements-inner">
      ${heading ? `<h2>${heading}</h2>` : ""}
      ${announcements.map(a => {
        try {
          const date = new Date(a.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
          return `<div class="announcement-item">
            <div class="announcement-title">${esc(a.title)}</div>
            ${a.body ? `<div class="announcement-body">${esc(a.body.slice(0, 300))}${a.body.length > 300 ? "..." : ""}</div>` : ""}
            <div class="announcement-date">${date}</div>
          </div>`;
        } catch {
          return `<!-- announcement render error -->`;
        }
      }).join("")}
    </div>
  </section>`;
}

function renderCtaBand(block: SiteBlock, theme: SiteTheme): string {
  const content = block.contentJson as Record<string, unknown>;
  const heading = esc(content.heading ?? "Get Involved");
  const subheading = esc(content.subheading ?? "");
  const ctaText = esc(content.ctaText ?? "Learn More");
  const ctaUrl = esc(content.ctaUrl ?? "#contact");
  const variant = block.variantKey ?? "cta-contact";

  const baseStyles = `<style>
    .block-cta-inner { max-width: 900px; margin: 0 auto; padding: 0 24px; text-align: center; }
    .block-cta h2 { font-family: var(--font-heading); font-size: clamp(1.8rem, 3vw, 2.8rem); margin-bottom: 16px; }
    .block-cta p { font-size: 1.05rem; margin-bottom: 36px; line-height: 1.6; }
    .block-cta-btn { display: inline-flex; padding: 16px 32px; border-radius: var(--radius); font-weight: 700; text-decoration: none; font-size: 1rem; transition: all 0.25s; }
    .block-cta-btn:hover { filter: brightness(1.1); transform: translateY(-2px); }
    .block-cta-btn-outline { display: inline-flex; padding: 14px 30px; border: 2px solid #fff; border-radius: var(--radius); font-weight: 600; text-decoration: none; font-size: 1rem; color: #fff; transition: all 0.25s; }
    .block-cta-btn-outline:hover { background: rgba(255,255,255,0.12); }
  </style>`;

  // cta-register: dark, urgent, event energy
  if (variant === "cta-register") {
    return baseStyles + `<section class="block-cta" style="padding:80px 0;background:linear-gradient(135deg,#0a0a14 0%,#1a1a2e 100%);">
      <div class="block-cta-inner">
        <p style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:var(--color-accent);margin-bottom:16px;">Limited Spots Available</p>
        <h2 style="color:#fff;">${heading}</h2>
        ${subheading ? `<p style="color:rgba(255,255,255,0.7);">${subheading}</p>` : ""}
        <a href="${ctaUrl}" class="block-cta-btn" style="background:var(--color-accent);color:#fff;font-size:1.1rem;padding:18px 40px;">${ctaText}</a>
      </div>
    </section>`;
  }

  // cta-join: warm primary, membership community feel
  if (variant === "cta-join") {
    return baseStyles + `<section class="block-cta" style="padding:80px 0;background:linear-gradient(135deg,var(--color-primary) 0%,color-mix(in srgb,var(--color-primary) 80%,var(--color-accent) 20%) 100%);">
      <div class="block-cta-inner">
        <h2 style="color:#fff;">${heading}</h2>
        ${subheading ? `<p style="color:rgba(255,255,255,0.85);">${subheading}</p>` : ""}
        <div style="display:flex;gap:16px;justify-content:center;align-items:center;flex-wrap:wrap;">
          <a href="${ctaUrl}" class="block-cta-btn" style="background:#fff;color:var(--color-primary);">${ctaText}</a>
          <a href="#about" class="block-cta-btn-outline">Learn More</a>
        </div>
      </div>
    </section>`;
  }

  // cta-donate: impact-focused, deep warm tone
  if (variant === "cta-donate") {
    return baseStyles + `<section class="block-cta" style="padding:80px 0;background:linear-gradient(135deg,#1e293b 0%,#2d3748 100%);">
      <div class="block-cta-inner">
        <h2 style="color:#fff;">${heading}</h2>
        ${subheading ? `<p style="color:rgba(255,255,255,0.75);">${subheading}</p>` : ""}
        <a href="${ctaUrl}" class="block-cta-btn" style="background:var(--color-accent);color:#fff;">${ctaText}</a>
      </div>
    </section>`;
  }

  // cta-contact (default): light surface, minimal, approachable
  return baseStyles + `<section class="block-cta" style="padding:72px 0;background:var(--color-surface);border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
    <div class="block-cta-inner">
      <h2 style="color:var(--color-text);">${heading}</h2>
      ${subheading ? `<p style="color:#6b7280;">${subheading}</p>` : ""}
      <a href="${ctaUrl}" class="block-cta-btn" style="background:var(--color-primary);color:#fff;">${ctaText}</a>
    </div>
  </section>`;
}

function renderContact(block: SiteBlock, theme: SiteTheme): string {
  const content = block.contentJson as Record<string, unknown>;
  const heading = esc(content.heading ?? "Contact Us");
  const email = esc(content.email ?? "");
  const phone = esc(content.phone ?? "");
  const address = esc(content.address ?? "");
  const hours = esc(content.hours ?? "");
  const variant = block.variantKey ?? "contact-simple";

  const base = `<style>
    .block-contact { padding: 80px 0; }
    .block-contact-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .block-contact h2 { font-family: var(--font-heading); font-size: clamp(1.8rem, 3vw, 2.6rem); margin-bottom: 40px; }
    .contact-info { display: flex; flex-direction: column; gap: 16px; }
    .contact-item { display: flex; align-items: flex-start; gap: 12px; font-size: 1rem; }
    .contact-item-icon { font-size: 1.2rem; margin-top: 2px; }
    .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; }
    @media (max-width: 768px) { .contact-grid { grid-template-columns: 1fr; } }
  </style>`;

  if (variant === "contact-two-column") {
    return base + `<section class="block-contact">
      <div class="block-contact-inner">
        <div class="contact-grid">
          <div>
            <h2>${heading}</h2>
            <div class="contact-info">
              ${email ? `<div class="contact-item"><span class="contact-item-icon">✉️</span><a href="mailto:${email}" style="color:var(--color-primary);">${email}</a></div>` : ""}
              ${phone ? `<div class="contact-item"><span class="contact-item-icon">📞</span><span>${phone}</span></div>` : ""}
              ${address ? `<div class="contact-item"><span class="contact-item-icon">📍</span><span>${address}</span></div>` : ""}
              ${hours ? `<div class="contact-item"><span class="contact-item-icon">🕐</span><span>${hours}</span></div>` : ""}
            </div>
          </div>
          <div></div>
        </div>
      </div>
    </section>`;
  }

  return base + `<section class="block-contact">
    <div class="block-contact-inner">
      <h2>${heading}</h2>
      <div class="contact-info">
        ${email ? `<div class="contact-item"><span class="contact-item-icon">✉️</span><a href="mailto:${email}" style="color:var(--color-primary);">${email}</a></div>` : ""}
        ${phone ? `<div class="contact-item"><span class="contact-item-icon">📞</span><span>${phone}</span></div>` : ""}
        ${address ? `<div class="contact-item"><span class="contact-item-icon">📍</span><span>${address}</span></div>` : ""}
        ${hours ? `<div class="contact-item"><span class="contact-item-icon">🕐</span><span>${hours}</span></div>` : ""}
      </div>
    </div>
  </section>`;
}

function renderGallery(block: SiteBlock, theme: SiteTheme): string {
  const content = block.contentJson as Record<string, unknown>;
  const images = (content.images as Array<{ url?: string; alt?: string }>) ?? [];
  const heading = esc(content.heading ?? "Gallery");

  if (images.length === 0) return "";

  return `<style>
    .block-gallery { padding: 60px 0; }
    .block-gallery-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .block-gallery h2 { font-family: var(--font-heading); font-size: clamp(1.6rem, 3vw, 2.4rem); margin-bottom: 32px; text-align: center; }
    .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    .gallery-item { aspect-ratio: 4/3; border-radius: var(--radius); overflow: hidden; }
    .gallery-item img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
    .gallery-item:hover img { transform: scale(1.05); }
  </style>
  <section class="block-gallery">
    <div class="block-gallery-inner">
      ${heading ? `<h2>${heading}</h2>` : ""}
      <div class="gallery-grid">
        ${images.slice(0, 12).map(img => `<div class="gallery-item">
          <img src="${esc(img.url)}" alt="${esc(img.alt ?? "")}">
        </div>`).join("")}
      </div>
    </div>
  </section>`;
}

function renderFaq(block: SiteBlock, theme: SiteTheme): string {
  const content = block.contentJson as Record<string, unknown>;
  const heading = esc(content.heading ?? "Frequently Asked Questions");
  const faqs = (content.faqs as Array<{ question?: string; answer?: string }>) ?? [];

  if (faqs.length === 0) return "";

  return `<style>
    .block-faq { padding: 80px 0; background: var(--color-surface); }
    .block-faq-inner { max-width: 800px; margin: 0 auto; padding: 0 24px; }
    .block-faq h2 { font-family: var(--font-heading); font-size: clamp(1.8rem, 3vw, 2.6rem); margin-bottom: 40px; text-align: center; }
    .faq-item { border-bottom: 1px solid #e5e7eb; }
    .faq-question { width: 100%; text-align: left; padding: 20px 0; font-weight: 600; color: var(--color-text); background: none; border: none; cursor: pointer; font-size: 1rem; display: flex; justify-content: space-between; align-items: center; }
    .faq-answer { padding: 0 0 20px; color: #6b7280; line-height: 1.7; display: none; }
    .faq-answer.open { display: block; }
  </style>
  <section class="block-faq">
    <div class="block-faq-inner">
      ${heading ? `<h2>${heading}</h2>` : ""}
      ${faqs.map((faq, i) => `<div class="faq-item">
        <button class="faq-question" onclick="const a=this.nextElementSibling;a.classList.toggle('open');this.querySelector('.faq-icon').textContent=a.classList.contains('open')?'−':'+';">
          ${esc(faq.question ?? "")}
          <span class="faq-icon" style="font-size:1.4rem;color:var(--color-accent);">+</span>
        </button>
        <div class="faq-answer">${esc(faq.answer ?? "")}</div>
      </div>`).join("")}
    </div>
  </section>`;
}

function renderMembership(block: SiteBlock, theme: SiteTheme): string {
  const content = block.contentJson as Record<string, unknown>;
  const heading = esc(content.heading ?? "Join Our Community");
  const description = esc(content.description ?? "");
  const ctaText = esc(content.ctaText ?? "Become a Member");
  const ctaUrl = esc(content.ctaUrl ?? "#contact");
  const benefits = (content.benefits as string[]) ?? [];
  const variant = block.variantKey ?? "membership-simple";

  const base = `<style>
    .block-membership { padding: 80px 0; }
    .block-membership-inner { max-width: 900px; margin: 0 auto; padding: 0 24px; }
    .block-membership-centered { text-align: center; }
    .block-membership h2 { font-family: var(--font-heading); font-size: clamp(1.8rem, 3vw, 2.6rem); margin-bottom: 20px; color: var(--color-text); }
    .block-membership p { color: #6b7280; margin-bottom: 32px; line-height: 1.7; max-width: 640px; }
    .membership-benefits-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 40px; text-align: left; }
    .membership-benefit-card { background: var(--color-surface); border-radius: var(--radius); padding: 20px 24px; display: flex; gap: 12px; align-items: flex-start; }
    .benefit-check { width: 24px; height: 24px; background: color-mix(in srgb, var(--color-accent) 15%, transparent); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--color-accent); font-weight: 700; font-size: 0.85rem; margin-top: 1px; }
    .membership-cta { display: inline-flex; padding: 16px 36px; background: var(--color-primary); color: #fff; border-radius: var(--radius); font-weight: 600; text-decoration: none; font-size: 1rem; transition: all 0.2s; }
    .membership-cta:hover { filter: brightness(1.1); transform: translateY(-2px); }
    .membership-simple-list { list-style: none; margin: 0 0 36px; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; text-align: left; }
    .membership-simple-item { display: flex; align-items: flex-start; gap: 8px; color: var(--color-text); font-size: 0.95rem; }
    .membership-simple-item::before { content: "✓"; color: var(--color-accent); font-weight: 700; flex-shrink: 0; }
  </style>`;

  // membership-benefits variant: card grid of benefits
  if (variant === "membership-benefits") {
    return base + `<section class="block-membership">
      <div class="block-membership-inner">
        <h2>${heading}</h2>
        ${description ? `<p>${description}</p>` : ""}
        ${benefits.length > 0 ? `<div class="membership-benefits-grid">
          ${benefits.map(b => `<div class="membership-benefit-card">
            <div class="benefit-check">✓</div>
            <span style="font-size:0.95rem;line-height:1.5;color:var(--color-text);">${esc(b)}</span>
          </div>`).join("")}
        </div>` : ""}
        <a href="${ctaUrl}" class="membership-cta">${ctaText}</a>
      </div>
    </section>`;
  }

  // Default membership block: centered layout
  return base + `<section class="block-membership">
    <div class="block-membership-inner block-membership-centered">
      <h2>${heading}</h2>
      ${description ? `<p style="margin:0 auto 32px;">${description}</p>` : ""}
      ${benefits.length > 0 ? `<ul class="membership-simple-list" style="max-width:600px;margin:0 auto 36px;">
        ${benefits.map(b => `<li class="membership-simple-item">${esc(b)}</li>`).join("")}
      </ul>` : ""}
      <a href="${ctaUrl}" class="membership-cta">${ctaText}</a>
    </div>
  </section>`;
}

export function renderBlock(block: SiteBlock, theme: SiteTheme, liveData?: unknown): string {
  try {
    switch (block.blockType) {
      case "hero": return renderHero(block, theme);
      case "about": return renderAbout(block, theme);
      case "stats": return renderStats(block, theme);
      case "cards": return renderCards(block, theme);
      case "events_list": return renderEventsList(block, theme, liveData);
      case "featured_event": return renderFeaturedEvent(block, theme, liveData);
      case "sponsor_grid": return renderSponsorGrid(block, theme, liveData);
      case "announcements": return renderAnnouncements(block, theme, liveData);
      case "cta_band": return renderCtaBand(block, theme);
      case "contact": return renderContact(block, theme);
      case "gallery": return renderGallery(block, theme);
      case "faq": return renderFaq(block, theme);
      case "membership":
      case "join":
      case "volunteer":
        return renderMembership(block, theme);
      case "custom_html": {
        const content = block.contentJson as Record<string, unknown>;
        const html = String(content.html ?? "");
        return `<div class="block-custom">${html}</div>`;
      }
      default:
        return `<!-- unknown block type: ${block.blockType} -->`;
    }
  } catch (err) {
    logError(
      SERVICE,
      "renderBlock",
      `Block render failed: ${block.blockType}/${block.variantKey}`,
      { blockId: block.id, blockType: block.blockType, variantKey: block.variantKey ?? undefined },
      err,
    ).catch(() => {});
    return `<!-- block failed: ${block.blockType}/${block.variantKey ?? ""} -->`;
  }
}
