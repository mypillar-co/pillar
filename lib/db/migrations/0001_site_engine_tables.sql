-- Migration: 0001_site_engine_tables
-- Tracked schema additions for the site-engine pipeline.
-- Applied via: pnpm --filter @workspace/db run db:push
-- Do not run directly; this file is for source-control history only.

-- ── Core site tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sites (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        VARCHAR NOT NULL UNIQUE,
  org_slug      VARCHAR UNIQUE,
  subdomain     VARCHAR UNIQUE,
  website_spec  JSONB,
  generated_html TEXT,
  proposed_html TEXT,
  theme         JSONB,
  meta_title    TEXT,
  meta_description TEXT,
  status        VARCHAR DEFAULT 'draft',
  published_at  TIMESTAMPTZ,
  name          TEXT,
  slug          VARCHAR UNIQUE,
  site_type     TEXT DEFAULT 'default',
  primary_cta_type TEXT DEFAULT 'contact',
  homepage_page_id VARCHAR,
  theme_id      VARCHAR,
  current_version INTEGER DEFAULT 1,
  published_version INTEGER,
  auto_update_enabled BOOLEAN DEFAULT FALSE,
  compiled_at   TIMESTAMPTZ,
  version       INTEGER NOT NULL DEFAULT 1,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_pages (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        VARCHAR NOT NULL,
  site_id       VARCHAR NOT NULL,
  title         TEXT NOT NULL,
  slug          VARCHAR NOT NULL,
  page_type     VARCHAR NOT NULL DEFAULT 'custom',
  seo_title     TEXT,
  seo_description TEXT,
  is_homepage   BOOLEAN DEFAULT FALSE,
  is_published  BOOLEAN DEFAULT TRUE,
  sort_order    INTEGER DEFAULT 0,
  layout_key    TEXT,
  visibility_rules_json JSONB,
  version       INTEGER NOT NULL DEFAULT 1,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, slug)
);

CREATE TABLE IF NOT EXISTS site_blocks (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        VARCHAR NOT NULL,
  site_id       VARCHAR,
  page_id       VARCHAR NOT NULL,
  block_type    VARCHAR NOT NULL,
  variant_key   TEXT,
  title         TEXT,
  content       JSONB DEFAULT '{}',
  content_json  JSONB DEFAULT '{}',
  settings      JSONB,
  settings_json JSONB DEFAULT '{}',
  is_visible    BOOLEAN DEFAULT TRUE,
  sort_order    INTEGER DEFAULT 0,
  source_mode   TEXT DEFAULT 'generated',
  lock_level    TEXT DEFAULT 'editable',
  editable_by_roles TEXT[] DEFAULT ARRAY['owner','admin']::TEXT[],
  version       INTEGER NOT NULL DEFAULT 1,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_nav_items (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        VARCHAR NOT NULL,
  site_id       VARCHAR NOT NULL,
  label         TEXT NOT NULL,
  url           TEXT,
  external_url  TEXT,
  page_id       VARCHAR,
  parent_id     VARCHAR,
  nav_location  TEXT DEFAULT 'header',
  sort_order    INTEGER DEFAULT 0,
  is_visible    BOOLEAN DEFAULT TRUE,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Theming ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_themes (
  id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           VARCHAR NOT NULL UNIQUE,
  theme_preset_key  TEXT DEFAULT 'pillar-default',
  color_primary     TEXT DEFAULT '#1e3a5f',
  color_secondary   TEXT DEFAULT '#2d5080',
  color_accent      TEXT DEFAULT '#f59e0b',
  color_surface     TEXT DEFAULT '#f8fafc',
  color_text        TEXT DEFAULT '#111827',
  font_heading_key  TEXT DEFAULT 'DM Serif Display',
  font_body_key     TEXT DEFAULT 'DM Sans',
  radius_scale      TEXT DEFAULT '14px',
  shadow_style      TEXT DEFAULT 'soft',
  hero_style_default TEXT DEFAULT 'gradient-dark',
  button_style      TEXT DEFAULT 'rounded',
  logo_mode         TEXT DEFAULT 'image',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Block bindings ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_block_bindings (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         VARCHAR NOT NULL,
  org_id          VARCHAR NOT NULL,
  block_id        VARCHAR NOT NULL UNIQUE,
  data_source_key TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       VARCHAR,
  refresh_freq    TEXT DEFAULT 'on_event',
  update_policy   TEXT DEFAULT 'auto_apply',
  field_map       JSONB DEFAULT '{}',
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Render cache ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_render_cache (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       VARCHAR NOT NULL,
  org_id        VARCHAR NOT NULL,
  block_id      VARCHAR NOT NULL,
  rendered_html TEXT NOT NULL,
  data_hash     TEXT NOT NULL,
  rendered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (block_id, org_id, site_id)
);

-- ── Versioning ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_versions (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id               VARCHAR NOT NULL,
  org_id                VARCHAR NOT NULL,
  version_number        INTEGER NOT NULL,
  spec_json             JSONB NOT NULL DEFAULT '{}',
  theme_json            JSONB NOT NULL DEFAULT '{}',
  compiled_html         TEXT NOT NULL,
  published_by_user_id  VARCHAR,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, version_number)
);

-- ── Import pipeline ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_import_runs (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        VARCHAR NOT NULL,
  site_id       VARCHAR,
  source_url    TEXT NOT NULL,
  status        TEXT DEFAULT 'pending',
  page_slug     TEXT,
  raw_html      TEXT,
  extracted_text TEXT,
  error_message TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_import_findings (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id VARCHAR NOT NULL,
  org_id        VARCHAR NOT NULL,
  site_id       VARCHAR,
  finding_type  TEXT NOT NULL,
  content_key   TEXT,
  content_value TEXT,
  confidence    NUMERIC,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Change log ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_change_log (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       VARCHAR NOT NULL,
  org_id        VARCHAR NOT NULL,
  change_type   TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     VARCHAR,
  diff_json     JSONB DEFAULT '{}',
  triggered_by  TEXT DEFAULT 'system',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Media assets ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_media_assets (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        VARCHAR NOT NULL,
  site_id       VARCHAR,
  url           TEXT NOT NULL,
  asset_type    TEXT NOT NULL,
  role          TEXT,
  width         INTEGER,
  height        INTEGER,
  alt_text      TEXT,
  source        TEXT DEFAULT 'uploaded',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── System logs ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_system_logs (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        VARCHAR,
  site_id       VARCHAR,
  service       TEXT NOT NULL,
  operation     TEXT NOT NULL,
  level         TEXT NOT NULL DEFAULT 'info',
  message       TEXT NOT NULL,
  context       JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Deferred / schema-only tables ────────────────────────────────────────────
-- site_compiled_snapshots: schema defined, intentionally not written to by the
--   compile pipeline. Compile output is stored in site_versions (compiledHtml)
--   and site_render_cache (per-block). This table is reserved for future use
--   as a "latest published snapshot" pointer.
CREATE TABLE IF NOT EXISTS site_compiled_snapshots (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       VARCHAR NOT NULL,
  org_id        VARCHAR NOT NULL,
  snapshot_html TEXT NOT NULL,
  snapshot_css  TEXT,
  spec_json     JSONB NOT NULL DEFAULT '{}',
  compiled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id)
);
