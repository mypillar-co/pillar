import express from "express";
import session from "express-session";
import { createServer } from "http";
import { sql as neonSql } from "drizzle-orm";
import { db } from "./db.js";
import { registerRoutes } from "./routes.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || "5001");

const app = express();
app.set("trust proxy", 1);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "community-platform-secret-key-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 30 * 60 * 1000,
      sameSite: "lax",
    },
  })
);

async function runMigrations() {
  try {
    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_org_configs (
        org_id TEXT PRIMARY KEY,
        org_name TEXT NOT NULL,
        short_name TEXT,
        org_type TEXT DEFAULT 'community',
        tagline TEXT,
        mission TEXT,
        location TEXT,
        primary_color TEXT DEFAULT '#c25038',
        accent_color TEXT DEFAULT '#2563eb',
        logo_url TEXT,
        hero_image_url TEXT,
        contact_email TEXT,
        contact_phone TEXT,
        contact_address TEXT,
        mailing_address TEXT,
        website TEXT,
        social_facebook TEXT,
        social_instagram TEXT,
        social_twitter TEXT,
        social_linkedin TEXT,
        meeting_day TEXT,
        meeting_time TEXT,
        meeting_location TEXT,
        footer_text TEXT,
        meta_description TEXT,
        stats JSONB DEFAULT '[]',
        programs JSONB DEFAULT '[]',
        partners JSONB DEFAULT '[]',
        sponsorship_levels JSONB DEFAULT '[]',
        features JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_admin_users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id TEXT NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        UNIQUE(org_id, username)
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_events (
        id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        title TEXT NOT NULL,
        slug TEXT,
        description TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        location TEXT NOT NULL,
        category TEXT NOT NULL,
        featured BOOLEAN DEFAULT FALSE,
        show_in_nav BOOLEAN DEFAULT FALSE,
        has_registration BOOLEAN DEFAULT FALSE,
        image_url TEXT,
        poster_image_url TEXT,
        external_link TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        is_ticketed BOOLEAN DEFAULT FALSE,
        ticket_price TEXT,
        ticket_capacity INTEGER
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_sponsors (
        id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        name TEXT NOT NULL,
        level TEXT NOT NULL,
        logo_url TEXT,
        website_url TEXT,
        event_type TEXT DEFAULT 'general'
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_businesses (
        id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        address TEXT NOT NULL,
        phone TEXT,
        website TEXT,
        category TEXT NOT NULL,
        image_url TEXT
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_contact_messages (
        id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_photo_albums (
        id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        cover_photo_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_album_photos (
        id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        album_id INTEGER NOT NULL,
        url TEXT NOT NULL,
        caption TEXT,
        sort_order INTEGER DEFAULT 0
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_vendor_registrations (
        id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        business_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        vendor_category TEXT NOT NULL,
        description TEXT,
        special_requests TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_sponsorship_inquiries (
        id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        business_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_site_content (
        id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(org_id, key)
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_registration_settings (
        id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_date TEXT,
        vendor_registration_closed BOOLEAN DEFAULT FALSE,
        sponsor_registration_closed BOOLEAN DEFAULT FALSE,
        vendor_registration_force_open BOOLEAN DEFAULT FALSE,
        sponsor_registration_force_open BOOLEAN DEFAULT FALSE,
        ticket_sales_closed BOOLEAN DEFAULT FALSE,
        ticket_sales_force_open BOOLEAN DEFAULT FALSE,
        UNIQUE(org_id, event_type)
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_newsletter_subscribers (
        id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        email TEXT NOT NULL,
        first_name TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        unsubscribe_token TEXT NOT NULL,
        subscribed_at TIMESTAMPTZ DEFAULT NOW(),
        unsubscribed_at TIMESTAMPTZ,
        UNIQUE(org_id, email)
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_blog_posts (
        id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        excerpt TEXT,
        content TEXT NOT NULL,
        cover_image_url TEXT,
        category TEXT DEFAULT 'News',
        author TEXT,
        published BOOLEAN DEFAULT FALSE,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(org_id, slug)
      )
    `);

    await db.execute(neonSql`
      CREATE TABLE IF NOT EXISTS cs_ticket_purchases (
        id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        event_id INTEGER NOT NULL,
        buyer_name TEXT NOT NULL,
        buyer_email TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        total_amount INTEGER NOT NULL,
        payment_order_id TEXT,
        confirmation_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        purchased_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log("✓ Community platform migrations complete");
  } catch (err) {
    console.error("Migration error:", err);
  }
}

async function startServer() {
  await runMigrations();

  registerRoutes(app);

  if (process.env.NODE_ENV === "production") {
    const staticPath = path.join(__dirname, "../public");
    app.use(express.static(staticPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: path.join(__dirname, ".."),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  const server = createServer(app);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Community platform running on port ${PORT}`);
  });
}

startServer().catch(console.error);
