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
