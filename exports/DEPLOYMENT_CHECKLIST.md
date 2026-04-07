# Pillar — Deployment Verification Checklist
**Date:** April 7, 2026

---

The full publish pipeline is already implemented. No new code needed. Just verify these three things are true in the deployed environment:

---

## 1. Both services can reach each other

The API server calls the community platform at `COMMUNITY_PLATFORM_URL`. Confirm both secrets are set identically on both services:

```
COMMUNITY_PLATFORM_URL=http://localhost:5001
PILLAR_SERVICE_KEY=<same value on both>
```

---

## 2. The UI flow must go in this order

**Interview → Generate Site → Publish**

The Publish route (`POST /api/sites/publish` in `sites.ts`) requires a `sitesTable` row with `status='draft'` that gets created during Generate. If Publish is reachable before Generate has run, it will 400. Make sure the frontend gates the Publish button behind a completed generation step.

---

## 3. Confirm the community platform DB is being populated after a test publish

Run these against the community platform's Neon DB:

```sql
SELECT org_id, org_name, primary_color, updated_at
FROM cs_org_configs ORDER BY updated_at DESC LIMIT 5;

SELECT org_id, slug, title, date
FROM cs_events ORDER BY id DESC LIMIT 10;
```

If those tables have data, the site at `{slug}.mypillar.co` is live immediately — the Cloudflare wildcard `*.mypillar.co` already routes every subdomain to the community platform, which reads the `Host` header to serve the right tenant. No DNS changes needed per org.
