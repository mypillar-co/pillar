import app from "./app";
import { logger } from "./lib/logger";
import { getStripeSync } from "./stripeClient";
import { startScheduler } from "./scheduler";
import { attachProcessErrorHandlers } from "./lib/errorAlert";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

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

    // Ticket sale window — open/close dates (ISO YYYY-MM-DD strings)
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_sale_open varchar(32)`);
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_sale_close varchar(32)`);

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

    // Hook event log — records every incoming framework site-event webhook
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS hook_event_log (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar,
        event_type varchar(100) NOT NULL,
        hook_payload jsonb NOT NULL,
        priority varchar(20) NOT NULL,
        category varchar(40) NOT NULL,
        action_taken varchar(40) NOT NULL DEFAULT 'queued',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS hel_org_idx ON hook_event_log (org_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS hel_type_idx ON hook_event_log (event_type)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS hel_created_idx ON hook_event_log (created_at)`);

    // Hook cadence log — enforces per-org/cadenceKey/day rate limits
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS hook_cadence_log (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL,
        cadence_key varchar(100) NOT NULL,
        date text NOT NULL,
        count varchar(10) NOT NULL DEFAULT '1',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (org_id, cadence_key, date)
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS hcl_org_key_date_idx ON hook_cadence_log (org_id, cadence_key, date)`);

    // Universal React site template — site_config JSONB on organizations
    await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS site_config jsonb`);

    logger.info("Startup migrations complete");
  } catch (err) {
    logger.warn({ err }, "Startup migration warning — continuing");
  }
}

async function main() {
  await runMigrations();

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

  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
    startScheduler();
  });

  // Graceful shutdown — drain in-flight requests before exiting.
  // Prevents EADDRINUSE on rapid restarts by ensuring the port is released
  // before the next process tries to bind it.
  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutdown signal received — closing server");
    server.close(() => {
      logger.info("Server closed — exiting cleanly");
      process.exit(0);
    });
    // Force-exit after 10 s if connections don't drain
    setTimeout(() => {
      logger.warn("Shutdown timeout — forcing exit");
      process.exit(1);
    }, 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
