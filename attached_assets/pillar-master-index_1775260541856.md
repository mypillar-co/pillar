# Pillar: Master Document Index (READ THIS FIRST)

**This is the starting point. Every Pillar agent MUST read this file before doing anything. It defines the reading order, document hierarchy, and how all spec files relate to each other.**

---

## DOCUMENT HIERARCHY

```
pillar-master-index.md              ← YOU ARE HERE. Read order + relationships.
│
├── pillar-agent-guide.md           ← PHASE 1: How to interview users and build sites.
│   └── References: org-design-strategies, visual-design-spec, site-crawl-spec
│
├── pillar-org-design-strategies.md ← PHASE 1 SUPPLEMENT: Org-type-specific design decisions.
│   └── Applied during: site build, color selection, layout decisions
│
├── pillar-site-crawl-spec.md       ← PHASE 1 SUPPLEMENT: How to import from existing sites.
│   └── Applied during: onboarding when user provides an existing URL
│
├── pillar-visual-design-spec.md    ← PHASE 2: Mandatory visual rules for every built site.
│   └── Applied during: site build, every page render
│
├── pillar-event-rendering-spec.md  ← PHASE 2 SUPPLEMENT: How events appear everywhere on the site.
│   └── Applied during: site build, event creation (dashboard or Autopilot), homepage rendering
│
├── pillar-admin-operations-guide.md ← PHASE 3: How to manage sites after they're built.
│   └── Applied during: post-build operations, Autopilot event/content management
│
└── pillar-build-validation-checklist.md ← QUALITY GATE: Run after every build or major change.
    └── Applied during: after build, after rebuild, after crawl+build, after bulk event creation
```

---

## READING ORDER

### When building a NEW site from scratch (no existing URL):
1. `pillar-agent-guide.md` — interview the user
2. `pillar-org-design-strategies.md` — identify org type, apply design rules
3. `pillar-visual-design-spec.md` — apply mandatory visual elements
4. `pillar-event-rendering-spec.md` — render events on homepage + listing + detail pages
5. `pillar-build-validation-checklist.md` — validate before presenting to user

### When building from an EXISTING site URL:
1. `pillar-agent-guide.md` — interview (user provides URL at question 4)
2. `pillar-site-crawl-spec.md` — crawl the existing site, extract all content
3. `pillar-org-design-strategies.md` — identify org type from crawled data
4. `pillar-visual-design-spec.md` — apply mandatory visual elements
5. `pillar-event-rendering-spec.md` — render crawled + new events
6. `pillar-build-validation-checklist.md` — validate (including crawled content checks)

### When Autopilot creates/manages events post-build:
1. `pillar-admin-operations-guide.md` — API operations
2. `pillar-event-rendering-spec.md` — verify event appears on homepage, listing, detail page

### When user complains about site quality:
1. `pillar-build-validation-checklist.md` — run all checks, identify failures
2. `pillar-visual-design-spec.md` — fix visual issues
3. `pillar-event-rendering-spec.md` — fix event display issues

---

## KEY RULES THAT SPAN ALL DOCUMENTS

These rules appear in multiple documents. They are listed here to prevent contradictions:

1. **Events sorted by date everywhere** — homepage featured, events listing, nav dropdown. Soonest first. Dateless at end. (event-rendering-spec, validation checklist, agent guide)

2. **Featured events on homepage** — max 3, auto-fill from soonest if none manually featured. Ticketed events prioritized. Past events auto-removed. (event-rendering-spec, agent guide line 259)

3. **No AI filler text** — never generate descriptions the user didn't provide. Name-only cards are acceptable. (validation checklist CHECK 1, crawl spec section 6, agent guide)

4. **Images must be re-hosted** — never hotlink from old sites, JotForm, Google Drive, or any external URL that could expire. Download, verify content-type, save to object storage. (crawl spec rules 1+7, validation checklist CHECK 7)

5. **Org-type colors are mandatory** — Rotary=blue+gold, Veterans=navy+red, etc. Generic gray is a failure. (org-design-strategies, visual-design-spec, validation checklist CHECK 5)

6. **Every card needs borders/shadows + hover effects** — flat text lists are forbidden. (visual-design-spec, agent guide card rules)

7. **Contact info appears ONCE** — never duplicate address, phone, or meeting schedule. (validation checklist CHECK 2, crawl spec section 5)

8. **Recurring events collapsed** — "Every Tuesday" not 52 separate entries. (event-rendering-spec, validation checklist CHECK 3, crawl spec section 4)

9. **Two event creation paths, one pipeline** — dashboard and Autopilot both call the same API, produce the same result. (event-rendering-spec, admin-operations-guide)

10. **Empty sections hidden** — if no content exists for a section, remove it entirely. (validation checklist CHECK 13, visual-design-spec)

---

## DOCUMENT VERSIONING

If any rule in one document contradicts another, the MORE SPECIFIC document wins:
- `pillar-org-design-strategies.md` overrides `pillar-visual-design-spec.md` for org-type-specific colors
- `pillar-event-rendering-spec.md` overrides `pillar-agent-guide.md` for event display details
- `pillar-site-crawl-spec.md` overrides `pillar-agent-guide.md` for crawl behavior
- `pillar-build-validation-checklist.md` is the FINAL AUTHORITY — if it says something fails, the site is not ready regardless of what other docs say
