# Pillar — Project Status

_Last updated: 2026-04-22_

Pillar is an AI SaaS for civic organizations. Community sites are served at
`*.mypillar.co` by the Community Platform on port 5001; the API server on
port 8080 proxies those requests, injecting an `x-org-id` header and
rewriting HTML for `/sites/{slug}/` paths. The Steward app on port 18402 is
the admin dashboard.

The current focus is **end-to-end test coverage** and **mission-control
diagnostics** — proving in tests what users actually do, not just what the
API returns.

---

## 1. Where the product stands

### Working today (verified by tests or direct inspection)
- **Platform health**: API server, Community Platform, and Steward all start
  and respond to health checks. `06-api-contracts.spec.ts` passes 8/8.
- **Public community site**: organization sites render at
  `/sites/{slug}/` via API-server proxy + HTML rewrite. Newsletter signup
  endpoint is wired (`GET /api/newsletter/subscribers` added this round).
- **AI Site Interview → Site Creation**: a brand-new org can be created
  end-to-end through the AI interview flow on Steward.
  `20-full-ai-interview.spec.ts` passes.
- **Dashboard sidebar navigation**: every sidebar route loads without a
  hard error. `27-dashboard-navigation.spec.ts` passes its first test.
- **Systems-check script**: `artifacts/api-server/src/scripts/systems-check.ts`
  reports 53/59 GO out of the box.

### Built but not yet verified end-to-end
- **AI edit panel** on `/dashboard/site` (CommunityBuilder) — exists and
  renders a textarea, but no test has yet driven a real edit through to a
  DB write.
- **Member lifecycle**: admin → invite → register → login → portal home.
  Add Member dialog renders with all 9 fields; pieces exist, full chain
  unproven by Playwright.
- **Events lifecycle**: New Event button + Create Event dialog exist, but
  the create → public site → detail → dashboard list chain isn't proven.
- **Content Studio**: tasks (Press Release, Newsletter Intro, Fundraising
  Appeal, etc.) are defined in `api-server/src/routes/content.ts` and the
  UI renders TaskCards; generation hasn't been confirmed via UI in CI.
- **Autopilot agent**: lives at `/dashboard/autopilot` (Management.tsx)
  with an `<input>` accepting natural-language commands. Not yet tested.
- **Hero image picker**: HeroImagePanel (Upload photo / AI picks) renders
  on `/dashboard/site`. Real Unsplash + upload flow not proven in CI.

### Known product gaps / open questions
- Spec 27's screenshot-loop test ends up on the **public marketing page**
  mid-loop — Steward auth session is being lost during long deep-nav
  sequences. Needs investigation (cookie domain? CSRF rotation? proxy?).
- Content Studio "History tab visible" test passed but logged
  `No history tab visible` — the assertion is weaker than the name
  implies. Worth tightening once we have history seeded.
- Several dashboard inputs lack `name`, `id`, `data-testid`, or
  `<Label htmlFor>` linkage. Not a bug, but it makes E2E selectors
  brittle.
- Auth secrets pending: `STRIPE_SECRET_KEY`, `BUFFER_CLIENT_ID`, and
  `SERVICE_API_KEY` / `PILLAR_SERVICE_KEY` env propagation across
  workflows.
- Drizzle schema has drift vs. the live database (e.g. `cs_announcements`
  exists in DB but not in the schema file). Migrations are hand-written
  via idempotent `db.execute(sql\`…\`)` in
  `artifacts/api-server/src/index.ts`, not via `drizzle-kit`.

---

## 2. Testing — done, in progress, and remaining

### Test infrastructure
- **Framework**: Playwright (`artifacts/playwright.config.ts`,
  120 s test-level timeout, two projects: `desktop-chrome` and
  `mobile-safari`).
- **Helpers**: `artifacts/e2e/helpers.ts` exposes `STEWARD`, `CP`, `API`,
  `TEST_ORG_SLUG`, `loginToSteward`, `screenshotStep`, `dbQuery`.
  `STEWARD` now reads `process.env.STEWARD_URL` with fallback
  `http://localhost:18402` (was previously hardcoded `:5173` — the only
  helper change made this round).
- **Workflows**: `Playwright E2E` and `E2E Health Check` are configured
  but the shell tool ceiling (~120 s) means full-suite runs must be split
  into per-spec invocations from the agent side.

### Specs that exist
| File | Purpose | Status |
|---|---|---|
| `01-platform-health.spec.ts` | Each artifact responds | 5/6 (1 fail = blank-page on test-org SPA) |
| `02-community-site.spec.ts`  | Public community site visibility | 2/8 (Vite SPA shell timing) |
| `03-member-portal.spec.ts`   | Portal pages | 2 fail visible, 3 hung past timeout |
| `04-events.spec.ts`          | Public events list/detail | 2/4 |
| `05-site-rendering.spec.ts`  | HTML rewrite + assets | 3/5 |
| `06-api-contracts.spec.ts`   | API JSON contracts | **8/8 ✅** |
| `20-full-ai-interview.spec.ts` | AI interview creates a site | **1/1 ✅** |
| `21-ai-edit-verified.spec.ts`  | AI edit changes DB tagline | 0/2 + 1 skip — **wrong route** in test |
| `22-member-complete-flow.spec.ts` | Add → invite → register → login → portal (8 steps) | 0/3 visible + 5 dependent skips/unverified — wrong button text |
| `23-events-complete-flow.spec.ts` | Create event → community → detail → list | 0/1 + 3 skips — wrong button text |
| `24-content-studio-complete.spec.ts` | Press Release / Newsletter / Fundraising | 1/4 (history only) — wrong card selectors |
| `25-autopilot-agent-complete.spec.ts` | Agent answers "how many members" | 0/0 + 5 skips — wrong route + wrong placeholder |
| `26-hero-image-complete.spec.ts` | Photo grid + upload + save | 0/1 + 2 skips — wrong route |
| `27-dashboard-navigation.spec.ts` | Sidebar nav loads everywhere | **1/2 ✅** + 1 fail (auth lost mid-loop) |

**Latest tally: 3 confirmed passing tests across specs 20-27, 11 failing,
14 skipped/unverified.** All failures in 20-27 (except spec 27 #2) are
**selector mismatches** between the test file and the actual UI — not
product bugs.

### Real selectors discovered (the fix list for 20-27)
Each item below is what's actually rendered in source vs. what the test
guesses.

1. **AI edit textarea** — wrong route in test.
   - Test goes to: `/dashboard/website`
   - Actual route: `/dashboard/site` (App.tsx line 127, CommunityBuilder)
   - Actual placeholder: `e.g. "Change our primary color to navy blue and update the contact email to info@myorg.org"`
2. **Create event button** — wrong text.
   - Test looks for: `Create | New Event | Add Event | + Create`
   - Actual button (page-level): text `New Event`,
     `[data-tour="new-event-btn"]` (Events.tsx line 298)
   - The dialog submit at line 178 says `Create Event` — different button.
3. **Add member button** — case-sensitive.
   - Actual: `Add Member` (Members.tsx line 329-330). Submit button in
     dialog says `Save`, not "Create" or "Add".
4. **Press Release task** — wrong card selector.
   - Defined in `api-server/src/routes/content.ts` line 95-96 with
     `label: "Press Release"`. Card text is exactly `Press Release`.
     Submit on workspace is `Generate`.
5. **Autopilot agent input** — wrong placeholder heuristic.
   - Lives at `/dashboard/autopilot` (Management.tsx line 758-762).
   - It's an `<input>`, **not** a `<textarea>`.
   - Placeholder: `Try: "How many tickets sold for the chili cookoff?" or "Add a spring gala on April 20"`.
   - The test's `findAgentPage` was probing for placeholders containing
     `ask|message|agent` — none match `Try:…`.
6. **Hero image buttons** — wrong route.
   - Lives in CommunityBuilder.tsx HeroImagePanel (line 629-650), at
     `/dashboard/site` (not `/dashboard/website`).
   - Actual button text: `Upload photo` and `AI picks`. Both are plain
     `<button>` elements. Hidden when `phase === "approving"`, disabled
     when `phase !== "idle"`.
7. **Add Member dialog fields** — no `name`/`htmlFor`.
   - Labels: First Name *, Last Name, Email, Phone, Member Type, Status,
     Join Date, Renewal Date, Notes. Submit: `Save`.
   - Selector strategy: scope to dialog, then use `input[type="email"]`,
     `input[type="date"]`, sibling-of-label, or `[role="combobox"]` for
     the two Selects.

### Next testing steps
1. **Mechanical selector swaps** in specs 21-26 using the table above.
   No application code change needed.
2. **Re-run 20-27** after swaps to get the true pass/fail picture for
   the underlying product flows.
3. **Fix spec 27 #2 auth-loss bug** — investigate why a long deep-nav
   loop drops the Steward session.
4. **Stabilize 02-05 community-site/portal/events/site-rendering specs**
   — these timing failures are likely the SPA shell racing the
   `page.waitForURL` / `page.waitForLoadState`.
5. **Add `data-testid`** to the four highest-value buttons (AI edit
   apply, New Event, Add Member, Generate) so future selectors are not
   text-dependent. (Application change — only after current selector
   pass is green so we can prove the change does no harm.)
6. **Wire Playwright into CI** as a workflow that runs nightly against
   a freshly-seeded test org.

### Operational notes
- Test org: slug `norwin-rotary-uic5`, id `test-org-pillar-001`.
  Tagline currently `Service above self` (unchanged baseline; useful as
  an "AI edit changed it" canary).
- Per-spec runs use `timeout 90 pnpm exec playwright test … --workers=1`
  to fit inside the shell ceiling. Background/nohup runs die when the
  enclosing workflow restarts; always run synchronously.
- Stray Chromium processes after a timeout: `pgrep -f playwright/cli.js`
  to find, then kill by PID. Do **not** `pkill -f playwright` — the
  pattern matches the parent bash invocation and kills it.
- Database-touching tests do reads (`SELECT`) and limited cleanup
  `DELETE`s against existing rows in `organizations`, `members`,
  `cs_org_configs`, and `events`. No schema changes.

---

## 3. What's left to be done (all categories)

### High priority (blocks honest E2E coverage)
- [ ] Apply selector fixes to specs 21-26 (mechanical, ~1 hour).
- [ ] Re-run specs 20-27 and report new tally.
- [ ] Diagnose & fix Steward auth-loss in spec 27 deep-nav loop.
- [ ] Stabilize specs 02-05 (timing / SPA shell races).

### Medium priority (product polish)
- [ ] Add `data-testid` to top 5-10 dashboard interactive elements.
- [ ] Tighten Content Studio "History tab" assertion now that selector
      survey is done.
- [ ] Investigate the 6 systems-check items currently NO-GO.
- [ ] Reconcile Drizzle schema with live DB (`cs_announcements`, etc.).

### Low priority / future
- [ ] Mobile-safari project pass through the same suite.
- [ ] Visual regression snapshots for community sites.
- [ ] CI integration (nightly Playwright + systems-check report).
- [ ] Pending integrations: Stripe, Buffer, Apple OAuth, Namecheap.

---

## 4. Files of record

- `artifacts/playwright.config.ts` — Playwright config (120 s timeout).
- `artifacts/e2e/helpers.ts` — shared Playwright helpers.
- `artifacts/e2e/01-…27-…spec.ts` — all 14 spec files.
- `artifacts/api-server/src/scripts/systems-check.ts` — diagnostics.
- `artifacts/api-server/src/routes/newsletter.ts` — newsletter endpoint
  added this round.
- `e2e-steward-rerun.txt` — most recent specs-20-27 raw output.
- `e2e-results-02-06.txt`, `e2e-results-rest.txt`,
  `e2e-results-steward.txt`, `e2e-full-results.txt` — earlier runs.
- `replit.md` — project memory & user preferences.
