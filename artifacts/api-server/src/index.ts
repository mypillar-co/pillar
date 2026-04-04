import app from "./app";
import { logger } from "./lib/logger";
import { getStripeSync } from "./stripeClient";
import { startScheduler } from "./scheduler";
import { attachProcessErrorHandlers } from "./lib/errorAlert";
import { sql, eq } from "drizzle-orm";
import { db, sitesTable, organizationsTable } from "@workspace/db";
import { buildSiteFromTemplate } from "./siteTemplate";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function getWebhookUrl(): string | null {
  // Use the Replit dev domain for development, production domain when deployed
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) {
    return `https://${devDomain}/api/stripe/webhook`;
  }
  return null;
}

attachProcessErrorHandlers();

async function runMigrations() {
  try {
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS show_on_public_site boolean DEFAULT true`);
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS featured_on_site boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS has_sponsor_section boolean DEFAULT false`);

    // Vendor registration extended fields
    await db.execute(sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS last_servsafe_reminder timestamptz`);
    await db.execute(sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS last_insurance_reminder timestamptz`);
    await db.execute(sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS contact_name text`);
    await db.execute(sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS address text`);
    await db.execute(sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS city text`);
    await db.execute(sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS state varchar(50)`);
    await db.execute(sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS zip varchar(20)`);
    await db.execute(sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS products text`);
    await db.execute(sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS needs_electricity boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS event_id varchar`);

    // Event registration control flags
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_closed boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_force_open boolean DEFAULT false`);

    // Sponsors extended fields for site/sponsor grid
    await db.execute(sql`ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS tier_rank integer DEFAULT 0`);
    await db.execute(sql`ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS site_display_priority integer DEFAULT 0`);
    await db.execute(sql`ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS site_visible boolean DEFAULT true`);

    // Management API — contact submissions
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS org_contact_submissions (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL,
        name text NOT NULL,
        email varchar NOT NULL,
        message text NOT NULL,
        read boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ocs_org_idx ON org_contact_submissions (org_id)`);

    // Management API — newsletter subscribers
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL,
        email varchar NOT NULL,
        name text,
        subscribed_at timestamptz NOT NULL DEFAULT now(),
        unsubscribed_at timestamptz,
        UNIQUE (org_id, email)
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ns_org_idx ON newsletter_subscribers (org_id)`);

    // Management API — business directory
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS org_businesses (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL,
        name text NOT NULL,
        category varchar,
        description text,
        address text,
        phone varchar,
        website text,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ob_org_idx ON org_businesses (org_id)`);

    // Management API — site content key-value store
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS org_site_content (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL,
        key varchar NOT NULL,
        value text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (org_id, key)
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS osc_org_idx ON org_site_content (org_id)`);

    // Management API — photo albums
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS photo_albums (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL,
        title text NOT NULL,
        description text,
        event_slug varchar,
        cover_photo_id varchar,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pa_org_idx ON photo_albums (org_id)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS album_photos (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        album_id varchar NOT NULL,
        org_id varchar NOT NULL,
        url text NOT NULL,
        caption text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ap_album_idx ON album_photos (album_id)`);

    logger.info("Startup migrations complete");
  } catch (err) {
    logger.warn({ err }, "Startup migration warning — continuing");
  }
}

/**
 * Ensures the Norwin Rotary Club demo site exists and is published.
 * Runs at startup so the production DB always has the site regardless of whether
 * it was seeded in the dev environment.
 */
async function ensureNorwinSite() {
  try {
    const [existing] = await db.select({ id: sitesTable.id, status: sitesTable.status })
      .from(sitesTable).where(eq(sitesTable.orgSlug, "norwin-rotary-club"));
    if (existing?.status === "published") {
      logger.info("Norwin site already published — skipping seed");
      return;
    }

    let [org] = await db.select({ id: organizationsTable.id })
      .from(organizationsTable).where(eq(organizationsTable.slug, "norwin-rotary-club"));
    if (!org) {
      // Production DB doesn't have the org yet — seed it with the canonical dev values
      await db.insert(organizationsTable).values({
        id: "0780408d-967a-4071-991f-ce29a8ed2577",
        userId: "53650667",
        name: "Norwin Rotary Club",
        type: "civic_org",
        tier: "tier3",
        slug: "norwin-rotary-club",
        senderEmail: "info@norwinrotary.org",
        isNonprofit: true,
      }).onConflictDoNothing();
      [org] = await db.select({ id: organizationsTable.id })
        .from(organizationsTable).where(eq(organizationsTable.slug, "norwin-rotary-club"));
      if (!org) {
        logger.warn("Norwin org seed failed — skipping site seed");
        return;
      }
      logger.info("Norwin org created via startup seed");
    }

    const slug = "norwin-rotary-club";
    const eventsSection = `<section class="events" id="events">
      <div class="container">
        <div class="section-header reveal">
          <span class="eyebrow">Upcoming Events</span>
          <h2>What&#8217;s Happening</h2>
        </div>
        <div style="text-align:center;padding:2rem 0">
          <a href="https://${slug}.mypillar.co/events" class="btn-primary">View All Events &#8594;</a>
        </div>
      </div>
    </section>`;

    const programsBlock = [
      { icon: "🎒", title: "Backpack Program", description: "Provides weekend meals to food-insecure students at Norwin schools." },
      { icon: "🎓", title: "Scholarship Fund", description: "Awards college scholarships to Norwin High School seniors." },
      { icon: "📖", title: "Dictionary Project", description: "Distributes dictionaries to every third-grader in the Norwin School District." },
      { icon: "🌱", title: "Community Garden", description: "Maintains a community garden at Irwin Park for residents." },
    ].map(p => `<div class="card reveal-child"><span class="card-category">${p.icon}</span><h3>${p.title}</h3><p>${p.description}</p></div>`).join("\n");

    const siteHtml = buildSiteFromTemplate({
      orgName: "Norwin Rotary Club",
      orgTagline: "Service Above Self — Serving the Norwin Community",
      orgMission: "A Rotary International service club serving the Norwin community through local projects, scholarships, and fellowship since 1972.",
      orgTypeLabel: "Rotary Club",
      primaryHex: "#0c4da2",
      accentHex: "#f7a81b",
      primaryRgb: "12,77,162",
      heroImageUrl: "https://images.unsplash.com/photo-1529156069898-aa78f52d3b87?auto=format&fit=crop&w=1920&q=80",
      aboutImageUrl: "https://images.unsplash.com/photo-1573497491765-57b4f23b3624?auto=format&fit=crop&w=900&q=80",
      aboutHeading: "Service Above Self",
      stat1Value: "1972", stat1Label: "Year Founded",
      stat2Value: "100+", stat2Label: "Active Members",
      stat3Value: "$50K+", stat3Label: "Annual Impact",
      statsBlock: `<div class="stat-item"><div class="stat-value">1972</div><div class="stat-label">Year Founded</div></div><div class="stat-item"><div class="stat-value">100+</div><div class="stat-label">Active Members</div></div><div class="stat-item"><div class="stat-value">$50K+</div><div class="stat-label">Annual Impact</div></div>`,
      statsSection: `<section class="stats-strip reveal"><div class="container"><div class="stats-grid"><div class="stat-item"><div class="stat-value">1972</div><div class="stat-label">Year Founded</div></div><div class="stat-item"><div class="stat-value">100+</div><div class="stat-label">Active Members</div></div><div class="stat-item"><div class="stat-value">50+</div><div class="stat-label">Years of Service</div></div><div class="stat-item"><div class="stat-value">$50K+</div><div class="stat-label">Annual Community Impact</div></div></div></div></section>`,
      programsBlock,
      eventsSection,
      shopSection: "",
      featuredEventSection: "",
      sponsorStrip: "",
      navEventsLink: `<a href="https://${slug}.mypillar.co/events">Events</a>`,
      mobileEventsLink: `<a href="https://${slug}.mypillar.co/events" class="mobile-link">Events</a>`,
      footerEventsLink: `<li><a href="https://${slug}.mypillar.co/events">Events</a></li>`,
      contactHeading: "Come Join Our Community",
      contactIntro: "Whether you&#8217;re curious about membership or want to partner with us, we&#8217;d love to connect.",
      contactCardHeading: "Ready to get involved?",
      contactCardText: "Getting started is easy. Reach out and we&#8217;ll personally connect you with the right program or membership pathway.",
      contactEmail: "info@norwinrotary.org",
      contactDetails: `<address style="font-style:normal;line-height:2"><div>📍 Irwin, PA 15642</div><div>📞 (724) 555-0142</div><div>✉️ info@norwinrotary.org</div><div>📅 Every Tuesday, 12:00 PM — Irwin Fire Hall, 221 Main St</div></address>`,
      contactRightPanel: `<div class="contact-right"><div class="contact-card"><h4>Ready to get involved?</h4><p>Getting started is easy. Reach out and we'll personally connect you with the right program or membership pathway.</p><a href="mailto:info@norwinrotary.org" class="btn-primary">Send Us a Message</a></div></div>`,
      footerContact: `<div class="footer-col"><h4>Contact</h4><p>Irwin, PA 15642</p><p>(724) 555-0142</p><p>info@norwinrotary.org</p></div>`,
      navLogo: `<div class="nav-logo">Norwin Rotary Club</div>`,
      heroLogoBadge: "",
      footerLogo: `<div class="footer-brand-name">Norwin Rotary Club</div>`,
      metaDescription: "A Rotary International service club serving the Norwin community through local projects, scholarships, and fellowship.",
      canonicalUrl: `https://${slug}.mypillar.co`,
      schemaJson: `{"@context":"https://schema.org","@type":"Organization","name":"Norwin Rotary Club","url":"https://${slug}.mypillar.co","address":{"@type":"PostalAddress","addressLocality":"Irwin","addressRegion":"PA","postalCode":"15642"},"memberOf":{"@type":"Organization","name":"Rotary International"}}`,
      currentYear: String(new Date().getFullYear()),
      heroModifierClass: "hero--photo",
      heroPrimaryCta: `<a href="https://${slug}.mypillar.co/events" class="btn-primary">View Upcoming Events</a>`,
      heroSecondaryCta: `<a href="#contact" class="btn-ghost">Get Involved</a>`,
    });

    if (existing) {
      await db.update(sitesTable)
        .set({ generatedHtml: siteHtml, proposedHtml: null, orgSlug: slug, status: "published", metaTitle: "Norwin Rotary Club", metaDescription: "A Rotary International service club serving the Norwin community.", updatedAt: new Date() })
        .where(eq(sitesTable.id, existing.id));
      logger.info("Norwin site updated and published via startup seed");
    } else {
      await db.insert(sitesTable).values({ orgId: org.id, orgSlug: slug, generatedHtml: siteHtml, status: "published", metaTitle: "Norwin Rotary Club", metaDescription: "A Rotary International service club serving the Norwin community." });
      logger.info("Norwin site created and published via startup seed");
    }
  } catch (err) {
    logger.warn({ err }, "Norwin site seed failed — continuing startup");
  }
}

async function main() {
  await runMigrations();
  await ensureNorwinSite();

  // Initialize Stripe sync (webhooks → postgres stripe schema)
  try {
    const sync = await getStripeSync();
    const webhookUrl = getWebhookUrl();
    if (webhookUrl) {
      await sync.findOrCreateManagedWebhook(webhookUrl);
      logger.info({ webhookUrl }, "Stripe webhook registered");
    } else {
      logger.warn("Cannot determine webhook URL — Stripe sync webhook skipped");
    }
    // Backfill runs in the background — does not block startup
    sync.syncBackfill().catch((err: unknown) => {
      logger.warn({ err }, "Stripe backfill warning");
    });
  } catch (err) {
    logger.warn({ err }, "Stripe sync init failed — billing features may be limited");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
    startScheduler();
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
