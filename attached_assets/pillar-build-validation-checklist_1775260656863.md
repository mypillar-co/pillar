# Pillar: Post-Build Validation Checklist

This is a MANDATORY quality gate. After every site build or rebuild, the agent MUST run through this checklist before presenting the site to the user. If ANY check fails, the agent MUST fix it before showing the site. Do not present a site that fails any of these checks.

---

## HOW TO USE THIS

After the build step generates a site, the agent:
1. Fetches the live site URL
2. Runs every check below against the rendered output
3. Fixes any failures
4. Re-checks until all pass
5. Only THEN presents the site to the user

---

## CHECK 1: NO AI FILLER TEXT

**What to check:** Every paragraph, description, and sentence on the site.

**Failure pattern:** Any of these phrases appearing anywhere on the site:
```
"brings community members together for meaningful impact"
"lasting connection"
"making a difference in our community"
"we are dedicated to"
"our mission is to serve"
"join us as we"
"together we can"
"meaningful impact and lasting connection"
"community members together"
```

**How to detect:** Search the rendered HTML for these phrases. If ANY generic filler text appears, it means the build step failed to substitute real content from the interview.

**Fix:** Replace with the actual content the user provided during the interview. If the user didn't provide a description for a program or section, either:
- Ask the user for a real description
- Remove the section entirely (an empty section is better than a fake one)
- Use ONLY the name/title with no description (a card with just "Backpack Program" and an icon is honest; a card with AI filler is dishonest)

**Rule: NEVER generate descriptions the user didn't provide. If you don't have real content, show the name only or hide the section.**

---

## CHECK 2: NO DUPLICATE CONTENT

**What to check:** Scan the entire page for any text block that appears more than once.

**Failure pattern:**
- Same address appearing twice on the same page
- Same meeting schedule appearing twice
- Same phone number in two adjacent sections
- Same paragraph repeated in different sections

**How to detect:** Extract all text blocks. Compare them. Flag any exact or near-exact matches within the same page.

**Fix:** Remove the duplicate. Keep the one that's in the most logical location.

---

## CHECK 3: RECURRING EVENTS NOT DUPLICATED

**What to check:** The events list/section.

**Failure pattern:** Multiple entries for the same recurring event:
```
WRONG:
- April 9: Weekly meetings
- April 16: Weekly meetings
- April 23: Weekly meetings

RIGHT:
- Regular Meetings: Every Tuesday, 12:00-1:00 PM at [location]
```

**How to detect:** If two or more events have the same title (case-insensitive), they're probably recurring.

**Fix:** Collapse into a single entry showing the schedule pattern. Display separately from one-time events.

---

## CHECK 4: EVENTS SORTED BY DATE

**What to check:** Every place events are listed (event section, nav dropdown, featured events).

**Failure pattern:** Events not in chronological order (soonest first).

**How to detect:** Parse dates of all displayed events. Verify they're in ascending order. Events without dates should appear at the end.

**Fix:** Sort by date ascending. Dateless events go last.

---

## CHECK 5: BRAND COLORS APPLIED

**What to check:** The site's primary color matches the org type or parent org brand.

**Failure pattern:**
- Rotary site not using Rotary blue + gold
- Lions site not using Lions purple + gold
- Veterans org not using red/white/blue
- Generic gray/default colors on any org that has known brand colors

**How to detect:** Check the CSS custom properties or computed styles of primary elements (header, buttons, links). Compare against the org-type color rules from the design strategy guide.

**Fix:** Apply the correct color palette per org type. If a parent org has brand colors (Rotary, Lions, Kiwanis, VFW, American Legion), those MUST be used.

---

## CHECK 6: NO "SCROLL TO EXPLORE"

**What to check:** The entire page for scroll prompts.

**Failure pattern:** Any text saying "Scroll to explore," "Scroll down," "Keep scrolling," or similar.

**How to detect:** Text search for "scroll."

**Fix:** Delete it. If the above-the-fold content doesn't compel scrolling on its own, improve the hero content instead.

---

## CHECK 7: NO IRRELEVANT IMAGES

**What to check:** Every image on the site.

**Failure pattern:**
- Stock photos of random people
- Images unrelated to the org (e.g., "Fresh Express" photo on a Rotary site)
- Broken image links (404s, HTML returned instead of image)
- Placeholder/Lorem Ipsum images

**How to detect:** Fetch each image URL. Verify it returns an image content-type (image/png, image/jpeg, etc.), not HTML. Verify the image is contextually relevant (filename, alt text, or source should relate to the org).

**Fix:**
- Broken images: Remove the image element entirely. A section with no image is better than a broken image icon.
- Irrelevant images: Remove and replace with either the org's logo on a solid color background, or no image.
- If no real photos exist: Use a solid primary-color hero with white text. Use emoji or Lucide icons for section cards. Never use stock photos.

---

## CHECK 8: ALL GATHERED DATA ACTUALLY USED (INTERVIEW + CRAWL)

**What to check:** Cross-reference every piece of data — from the interview AND from site crawl — against the rendered site.

**Verification matrix:**

| Data Source | Data Item | Must Appear On Site | Location |
|---|---|---|---|
| Interview or Crawl | Org name | Yes | Hero title, page title, meta tags, footer |
| Interview or Crawl | Location/address | Yes | Contact section, footer |
| Interview or Crawl | Meeting schedule | Yes | About or contact section (ONCE, not duplicated) |
| Interview or Crawl | Each event name | Yes | Events section + homepage featured (if featured) |
| Interview or Crawl | Each event date | Yes | Next to event name |
| Interview or Crawl | Each event location | Yes | Next to event name |
| Interview or Crawl | Each program name | Yes | Programs section |
| Interview or Crawl | Each program description (if provided) | Yes | Under program name |
| Interview or Crawl | Officer names (if provided) | Yes | About or dedicated section |
| Interview or Crawl | Social media links (if provided) | Yes | Header and/or footer |
| Interview or Crawl | Logo (if provided/crawled) | Yes | Header/nav |
| Interview or Crawl | Parent org affiliation | Yes | Footer or about section |
| Crawl only | Hero image (if crawled) | Yes | Hero section background |
| Crawl only | Gallery images (if crawled) | Yes | Gallery section |
| Crawl only | Documents/PDFs (if crawled) | Yes | Resources/documents section |

**How to detect:** For each piece of gathered data (interview answers + crawl results), search the rendered HTML for that content. If data was gathered but doesn't appear on the site, the build failed to use it.

**Fix:** Insert the missing content in the correct location. If crawled data was dropped during the build, re-insert from the crawl result object (see `pillar-site-crawl-spec.md` for the crawl result structure).

---

## CHECK 9: CONTACT SECTION COMPLETE

**What to check:** The contact section has all provided contact info and it's correct.

**Failure pattern:**
- Missing email when one was provided
- Missing phone when one was provided
- Missing address when one was provided
- Wrong information displayed

**How to detect:** Compare contact section content against interview answers.

**Fix:** Add missing info. Correct wrong info.

---

## CHECK 10: MOBILE RENDERING

**What to check:** The site at mobile viewport width (375px).

**Failure pattern:**
- Horizontal scrolling
- Text overflowing containers
- Buttons too small to tap (under 44px height)
- Navigation menu not accessible
- Navigation menu doesn't scroll when event list is long
- Images stretching or distorting

**How to detect:** Render at 375px width. Check for overflow. Check touch target sizes. Open mobile menu and verify scroll.

**Fix:** Apply responsive styles. Add overflow-y-auto to mobile menu. Constrain images with object-cover.

---

## CHECK 11: NAVIGATION WORKS

**What to check:** Every link in the navigation.

**Failure pattern:**
- Links that go nowhere (404)
- Links that go to the wrong section
- Anchor links (#about, #events) that don't scroll to the right place
- Event links that don't reach event detail pages

**How to detect:** Click every nav link. Verify destination.

**Fix:** Fix broken links. Ensure anchor targets exist in the HTML.

---

## CHECK 12: PAGE TITLE AND META TAGS SET

**What to check:** The HTML `<head>`.

**Failure pattern:**
- Title is "Vite App" or "React App" or blank
- No meta description
- No Open Graph tags

**Expected:**
```html
<title>Norwin Rotary Club — Service Above Self</title>
<meta name="description" content="Norwin Rotary Club in Irwin, PA. Service Above Self. Community programs, events, and fellowship." />
<meta property="og:title" content="Norwin Rotary Club" />
<meta property="og:description" content="Service Above Self — Community programs and events in Irwin, PA" />
<meta property="og:image" content="[org logo or hero image URL]" />
```

**Fix:** Set title to "[Org Name] — [tagline or location]". Set description from org mission or about text. Set OG tags.

---

## CHECK 13: EMPTY SECTIONS HIDDEN

**What to check:** Every section on the page.

**Failure pattern:**
- A "Programs" section with no programs listed
- A "Sponsors" section with no sponsors
- A "Gallery" section with no photos
- A "News" section with no articles
- Any section showing a header but no content below it

**How to detect:** For each section, check if it has child content beyond the section title.

**Fix:** If a section has no content, remove it entirely from the page. Don't show empty sections.

---

## CHECK 14: EVENTS THE USER ENTERED ACTUALLY EXIST

**What to check:** The events section matches what the user provided.

**Failure pattern:**
- User entered 5 events during the interview but only 2 appear on the site
- User entered events but the events section is empty
- Events exist in the database but don't render on the frontend

**How to detect:** Count events on the rendered page. Compare against the number of events from the interview. If they don't match, the build pipeline dropped data.

**Fix:** Query the database to verify events were stored. If stored but not rendering, fix the frontend query. If not stored, re-insert from the interview data.

---

## CHECK 15: TICKET/PAYMENT FLOW FUNCTIONAL (if ticketing enabled)

**What to check:** The ticket purchase flow for any ticketed event.

**Failure pattern:**
- "Buy Tickets" button doesn't appear on ticketed events
- Clicking "Buy Tickets" shows an error
- No price displayed
- No capacity/remaining count displayed (if capacity is set)
- Payment redirect URL is wrong (wrong domain, wrong base URL)

**How to detect:** Navigate to a ticketed event page. Verify the purchase form exists with all fields (name, email, quantity). Verify price is displayed. If capacity is set, verify remaining count is shown.

**Fix:** Ensure the event has `isTicketed: true` and `ticketPrice` set. Ensure the frontend renders the purchase section when these flags are true. Ensure the checkout endpoint uses the correct `baseUrl` for the redirect.

---

## CHECK 16: HOMEPAGE FEATURED EVENTS VISIBLE

**What to check:** The homepage has a featured events section with event cards.

**Failure pattern:**
- Homepage has no events section at all
- Events section exists but is empty when there are active events in the database
- Events section is buried at the bottom of the page (below programs, about, sponsors)
- Featured events show as plain text list instead of cards
- Featured ticketed events don't show price badge or "Buy Tickets" CTA
- More than 3 featured events displayed (cluttered)
- Past events still showing in featured section

**How to detect:** Load the homepage. Verify a "Featured Events" or "Upcoming Events" section exists within the first 2-3 sections (after hero). Verify it shows up to 3 event cards with proper visual treatment per `pillar-visual-design-spec.md`. Verify "View All" button links to /events.

**Fix:** See `pillar-event-rendering-spec.md` for the exact homepage featured events section structure and auto-featuring rules.

---

## CHECK 17: CRAWLED IMAGES RE-HOSTED (if site was built from crawl)

**What to check:** Every image on the site is served from object storage or site assets — NOT hotlinked from the old site.

**Failure pattern:**
- `<img src="https://oldsite.org/wp-content/uploads/photo.jpg">` ← hotlinked, will break
- `<img src="https://jotform.com/uploads/...">` ← temporary URL, will expire
- `<img src="https://drive.google.com/...">` ← may require auth, may expire
- Any image src pointing to a domain that isn't the Pillar site's own domain or object storage

**How to detect:** Extract all `<img>` src attributes. Check that each one either:
- Starts with `/` (relative to current site)
- Points to the site's own object storage domain
- Is a data: URI (inline image)

Any src pointing to an external domain that isn't a known CDN is a violation.

**Fix:** Download the image, verify it's valid (Content-Type is image/*), save to object storage, update the src to point to the re-hosted copy. See `pillar-site-crawl-spec.md` for full download/verification rules.

---

## CHECK 18: CRAWLED LOGO IS VALID IMAGE (if site was built from crawl)

**What to check:** The logo in the header is actually rendering as an image, not a broken icon.

**Failure pattern:**
- Logo `<img>` shows broken image icon
- Logo src returns HTML instead of an image (common with expired JotForm/old site URLs)
- Logo is stretched, distorted, or comically large/small

**How to detect:** Fetch the logo's src URL. Verify response Content-Type is `image/*`. Verify the image renders at a reasonable size (h-8 to h-12, w-auto).

**Fix:** If the logo is broken, either re-download from the original source, ask the user for a new logo file, or fall back to text-only header (org name as text). NEVER show a broken image icon.

---

## VALIDATION RESULT FORMAT

After running all checks, the agent should produce an internal result:

```
VALIDATION RESULT: [PASS / FAIL]

✓ CHECK 1:  No AI filler text — PASS
✗ CHECK 2:  No duplicate content — FAIL (address appears twice in contact section)
✓ CHECK 3:  Recurring events — PASS
✓ CHECK 4:  Events sorted — PASS
✗ CHECK 5:  Brand colors — FAIL (using default gray instead of Rotary blue)
✓ CHECK 6:  No scroll prompt — PASS
✗ CHECK 7:  No irrelevant images — FAIL (Fresh Express image unrelated to org)
✗ CHECK 8:  Gathered data used — FAIL (program descriptions not from interview or crawl)
✓ CHECK 9:  Contact complete — PASS
✓ CHECK 10: Mobile rendering — PASS
✓ CHECK 11: Navigation works — PASS
✗ CHECK 12: Meta tags — FAIL (title is "Vite App")
✓ CHECK 13: Empty sections hidden — PASS
✗ CHECK 14: Events exist — FAIL (user entered 5 events, only 3 display)
✓ CHECK 15: Ticket flow — N/A (no ticketed events)
✗ CHECK 16: Homepage featured — FAIL (no featured events section on homepage)
✓ CHECK 17: Crawled images re-hosted — N/A (no crawl)
✓ CHECK 18: Crawled logo valid — N/A (no crawl)

OVERALL: FAIL — 7 issues to fix before presenting to user
```

The agent fixes all failures, re-runs validation, and only presents the site when the result is PASS on all applicable checks.

---

## WHEN TO RUN THIS CHECKLIST

1. After initial site build from interview
2. After initial site build from crawl + interview
3. After any site rebuild or template change
4. After adding multiple events at once (dashboard or Autopilot)
5. After changing the site's color theme
6. After any user complaint about site quality (run to diagnose what's wrong)
7. After Autopilot creates an event (run checks 14, 15, 16 at minimum)

---

## COMMUNICATING FAILURES TO THE USER

If the agent catches issues during validation, it should NOT show the broken site and ask "does this look right?" Instead:

**Wrong:** "Here's your site! Let me know if you'd like any changes."
**Right:** Fix everything first, then: "Your site is live at norwinrotary.mypillar.co. It includes your 4 events, 3 programs, meeting schedule, and contact information. Take a look and let me know if anything needs adjusting."

The user should never see AI filler text, broken images, duplicate content, or missing data. Those are bugs, not design preferences.
