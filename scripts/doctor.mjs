#!/usr/bin/env node

import http from "http";
import { Client } from "pg";
import fs from "fs";

const envPath = ".env";

function loadEnv() {
  if (!fs.existsSync(envPath)) {
    return { ok: false, message: ".env file not found" };
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    process.env[key] = value;
  }

  return { ok: true };
}

function pass(name, detail = "") {
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

function warn(name, detail = "") {
  console.log(`⚠️  ${name}${detail ? ` — ${detail}` : ""}`);
}

function get(url, headers = {}) {
  return new Promise((resolve) => {
    const req = http.get(url, { headers, timeout: 5000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          body,
        });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: "timeout" });
    });

    req.on("error", (err) => {
      resolve({ ok: false, status: 0, body: err.message });
    });
  });
}

async function main() {
  console.log("\nPillar Local Doctor\n");

  const env = loadEnv();
  if (!env.ok) {
    fail(".env", env.message);
  } else {
    pass(".env loaded");
  }

  if (!process.env.DATABASE_URL) {
    fail("DATABASE_URL", "missing from .env");
  } else {
    pass("DATABASE_URL present");
  }

  if (!process.env.SESSION_SECRET) {
    warn("SESSION_SECRET", "missing from .env");
  } else {
    pass("SESSION_SECRET present");
  }

  if (!process.env.PORT) {
    warn("PORT", "missing from .env; API usually expects 8080");
  } else {
    pass("PORT present", process.env.PORT);
  }

  if (process.env.DATABASE_URL) {
    try {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      const result = await client.query(
        "select slug, name from organizations order by created_at asc limit 10",
      );
      await client.end();

      pass("Database connection", `${result.rows.length} orgs found`);

      const hasNorwin = result.rows.some((r) => r.slug === "norwin-rotary");
      if (hasNorwin) {
        pass("Test org slug", "norwin-rotary exists");
      } else {
        warn(
          "Test org slug",
          `norwin-rotary not found. Found: ${result.rows
            .map((r) => r.slug)
            .join(", ")}`,
        );
      }
    } catch (err) {
      fail("Database connection", err.message);
    }
  }

  const apiHealth = await get("http://localhost:8080/api/healthz");
  if (apiHealth.ok) {
    pass("API server", "8080 /api/healthz OK");
  } else {
    fail("API server", `8080 failed: ${apiHealth.status} ${apiHealth.body}`);
  }

  const cpConfig = await get("http://localhost:5001/api/org-config", {
    "x-org-id": "norwin-rotary",
  });
  if (cpConfig.ok) {
    pass("Community Platform", "5001 /api/org-config OK");
  } else {
    fail(
      "Community Platform",
      `5001 /api/org-config failed: ${cpConfig.status} ${cpConfig.body}`,
    );
  }

  const cpEvents = await get("http://localhost:5001/api/events", {
    "x-org-id": "norwin-rotary",
  });
  if (cpEvents.ok) {
    pass("Community Platform events", "5001 /api/events OK");
  } else {
    fail(
      "Community Platform events",
      `5001 /api/events failed: ${cpEvents.status} ${cpEvents.body}`,
    );
  }

  const steward = await get("http://localhost:5173/");
  if (steward.ok) {
    pass("Steward dashboard", "5173 responding");
  } else {
    fail("Steward dashboard", `5173 failed: ${steward.status} ${steward.body}`);
  }

  const apiProxyConfig = await get("http://localhost:8080/api/org-config", {
    "x-org-id": "norwin-rotary",
  });
  if (apiProxyConfig.ok) {
    pass("API → CP proxy", "8080 /api/org-config OK");
  } else {
    warn(
      "API → CP proxy",
      `8080 /api/org-config returned ${apiProxyConfig.status}. Direct CP may still be OK.`,
    );
  }

  const publicSite = await get("http://localhost:8080/sites/norwin-rotary");
  if (publicSite.ok && !publicSite.body.includes("Community platform unavailable")) {
    pass("Public site route", "/sites/norwin-rotary responds");
  } else {
    fail(
      "Public site route",
      `/sites/norwin-rotary failed: ${publicSite.status} ${publicSite.body.slice(
        0,
        120,
      )}`,
    );
  }

  console.log("\nDoctor complete.\n");
}

main().catch((err) => {
  console.error("Doctor crashed:", err);
  process.exit(1);
});