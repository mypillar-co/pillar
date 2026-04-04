# Pillar: Self-Test & Demo Specification (STRICT)

**This document defines how the Pillar build engine proves it works. The agent MUST build a REAL, WORKING, DEPLOYED website that you can click through in a browser — not a summary, not a description, not a mock. A real site with real pages, real URLs, real event cards, real ticket forms.**

---

## WHAT "BUILD A TEST SITE" MEANS

Let's be very clear about what this is NOT:

**NOT THIS:**
```
Agent: "I've built the test site! Here are the results:
✓ Homepage has Rotary blue background
✓ 3 featured events displayed
✓ Ticket forms work
All checks pass!"

User: "Where's the site? I can't see anything."
Agent: "Oh, I simulated it internally."
```

**THAT IS NOT A TEST. THAT IS A LIE.**

**THIS is what a test looks like:**
```
Agent: *actually creates database records*
Agent: *actually writes frontend components*
Agent: *actually configures colors and styles*
Agent: *actually deploys the site*
Agent: *actually loads every page in the browser*
Agent: *actually checks what rendered*
Agent: *actually tries the ticket form*
Agent: "Your test site is live at norwinrotary.mypillar.co. 
       I verified every page. Here's what I found: [real results from real pages]"

User: *clicks URL, sees real site, clicks real buttons*
```

**The test site MUST be:**
1. A real deployed web application with a real URL you can visit
2. Connected to a real database with real event records inserted
3. Rendering real HTML/CSS/JS that you can see in a browser
4. Functional — ticket forms submit, nav links work, pages load
5. Visually correct — colors, cards, icons, hover effects all visible

**The agent MUST NOT:**
- Pretend to build a site and just describe what it would look like
- Return a checklist of "passes" without actually rendering anything
- Say "the site is ready" in under 30 seconds — building a real site takes real time
- Skip creating database records (events, programs, etc.)
- Skip applying CSS/theme changes
- Show you a blank page or broken page and call it done

**If the agent comes back in seconds and says "done" — it didn't build anything. Call it out.**

---

## WHY THIS EXISTS

You (the Pillar admin) should not have to:
- Manually create a fake org to test the build engine
- Manually fill out every interview question
- Manually check if colors are right, events render, images work
- Manually test the ticket flow
- Manually verify the crawl pipeline

The agent does ALL of this itself. You say "run the self-test" and it builds a real demo site, validates it by loading every page, and reports results with the live URL.

---

## HOW TO TRIGGER A SELF-TEST

Say any of these to the agent:
- "Run the self-test"
- "Test the build engine"
- "Build a demo site and verify it"
- "Show me it works"
- "Prove the specs work"

The agent then runs the full test scenario below WITHOUT asking you any questions. It already has all the answers.

**EXPECTED TIMELINE:** Building and validating a real test site should take 2-5 minutes minimum. If the agent responds in seconds, it faked it.

---

## TEST SCENARIO: NORWIN ROTARY CLUB

This is a complete, realistic test case. The agent pretends it received these answers from a user interview, then builds the site and validates it.

### Simulated Interview Answers

```
Organization Name: Norwin Rotary Club
Location: Irwin, PA 15642
One-sentence description: A Rotary International service club serving the Norwin community through local projects, scholarships, and fellowship.
Existing website: https://norwinrotary.org (CRAWL THIS if accessible; if not, use data below)
Logo: Use Rotary International wheel logo (download from rotary.org brand center, or use a solid-color circle with "R" as fallback)
Social media: Facebook — https://facebook.com/norwinrotary

Parent organization: Rotary International
Org type: Rotary & Service Clubs

Meeting schedule: Every Tuesday, 12:00 PM at Irwin Fire Hall, 221 Main St, Irwin, PA 15642
Contact email: info@norwinrotary.org
Contact phone: (724) 555-0142

Officers:
  - President: Jane Smith
  - President-Elect: Bob Johnson
  - Secretary: Carol Williams
  - Treasurer: Mike Davis
  - Sergeant at Arms: Tom Anderson

Events:
  1. Annual Golf Outing
     - Date: Saturday, June 14, 2026
     - Time: 8:00 AM Shotgun Start
     - Location: Youghiogheny Country Club
     - Description: 18-hole scramble format with lunch, prizes, and silent auction.
     - Category: Fundraiser
     - Ticketed: Yes
     - Price: $125 per golfer
     - Capacity: 144 (36 foursomes)
     - Featured: Yes
     - Sponsors: Yes (Gold, Silver, Hole sponsors)

  2. Backpack Program Packing Night
     - Date: Thursday, August 20, 2026
     - Time: 6:00 - 8:00 PM
     - Location: Norwin School District Warehouse
     - Description: Volunteers pack weekend meal bags for food-insecure students.
     - Category: Community Service
     - Ticketed: No
     - Featured: Yes

  3. Annual Chili Cookoff
     - Date: Saturday, October 10, 2026
     - Time: 11:00 AM - 3:00 PM
     - Location: Main Street, Irwin
     - Description: Teams compete for best chili. Public tasting tickets available.
     - Category: Community
     - Ticketed: Yes
     - Price: $10 per taster
     - Capacity: 300
     - Featured: Yes
     - Vendor registration: Yes ($50 per team)

  4. Weekly Meetings (recurring)
     - Schedule: Every Tuesday, 12:00 - 1:00 PM
     - Location: Irwin Fire Hall
     - Recurring: Yes
     - Ticketed: No
     - Show as single entry, not 52 separate events

Programs:
  1. Backpack Program — Provides weekend meals to food-insecure students at Norwin schools.
  2. Scholarship Fund — Awards college scholarships to Norwin High School seniors.
  3. Dictionary Project — Distributes dictionaries to every third-grader in the district.
  4. Community Garden — Maintains a community garden at Irwin Park.

Features enabled:
  - Events: Yes
  - Ticketing: Yes (for golf outing and chili cookoff)
  - Vendor registration: Yes (for chili cookoff)
  - Sponsor sections: Yes (for golf outing)
  - Business directory: No
  - Photo gallery: No
  - Newsletter signup: Yes
  - Contact form: Yes

Brand colors: Rotary blue (#003366) and gold (#F7A81B) — per parent org
```

---

## SELF-TEST EXECUTION STEPS

The agent runs these steps IN ORDER. Each step has a verification check.

**REMINDER: Every step involves REAL actions — writing files, inserting database records, loading pages in a browser. If the agent skips any real action and just describes what it would do, the test is invalid.**

### Step 1: Build the Site (THIS TAKES REAL TIME)

Using the simulated interview data above, the agent MUST actually do ALL of the following:

```
1. CREATE the database schema (if not already created):
   - Events table with all fields (title, slug, date, time, location, isTicketed, ticketPrice, etc.)
   - Ticket purchases table
   - Any other required tables

2. INSERT real records into the database:
   - INSERT event: "Annual Golf Outing" with all fields from test data
   - INSERT event: "Backpack Program Packing Night" with all fields
   - INSERT event: "Annual Chili Cookoff" with all fields
   - INSERT event: "Weekly Meetings" (recurring) with all fields
   - Verify: SELECT * FROM events — should return 4 rows

3. WRITE/MODIFY actual frontend code:
   - Apply Rotary blue (#003366) and gold (#F7A81B) to CSS variables
   - Configure hero section with correct background color
   - Configure event cards with proper visual treatment
   - Configure homepage featured events section
   - Configure navigation with event dropdown

4. WRITE/MODIFY actual backend code:
   - API routes serve the inserted events
   - Ticket checkout endpoint works
   - Event detail pages resolve by slug

5. DEPLOY the site:
   - Build compiles without errors
   - Site is accessible at a real URL
   - All pages load (not 404, not blank, not error screen)

6. WAIT for the site to be fully live before proceeding to verification
```

Following:
- `pillar-agent-guide.md` — design decisions
- `pillar-org-design-strategies.md` — Rotary & Service Clubs strategy
- `pillar-visual-design-spec.md` — mandatory visual elements

**Verification:** Open the site URL in a browser. The homepage MUST render with visible content (not blank, not loading spinner, not error). If it doesn't load, the build failed — fix it before continuing.

**THIS STEP ALONE should take 1-3 minutes. If it takes 5 seconds, the agent didn't do it.**

### Step 2: Verify Homepage

**HOW TO VERIFY: The agent MUST actually fetch the rendered page (HTTP GET the URL, or load it in a headless browser) and inspect the real HTML/DOM. "Verify" means looking at what's actually on screen — not recalling what the code says. Code can have bugs. The rendered output is the truth.**

Load the homepage and check:

```
[ ] Hero section has Rotary blue (#003366) background, NOT white
[ ] Hero shows "Norwin Rotary Club" as h1
[ ] Hero shows "Service Above Self" or the one-sentence description as subtitle
[ ] Hero has Rotary wheel logo displayed (h-16 minimum)
[ ] Hero has at least one CTA button

[ ] Featured Events section exists WITHIN the first 3 sections
[ ] Featured Events shows exactly 3 event cards (Golf Outing, Backpack Packing, Chili Cookoff)
[ ] Each card has: colored accent bar or image, category badge, title, description (2 lines), date icon + date, time icon + time, location icon + location
[ ] Golf Outing card shows "$125" price badge and "Buy Tickets" button
[ ] Chili Cookoff card shows "$10" price badge and "Buy Tickets" button
[ ] Backpack Packing card shows "Learn More" (not "Buy Tickets" — it's free)
[ ] "View All" button links to /events
[ ] Cards have hover effects (shadow increase, slight lift)

[ ] About section exists with the org description
[ ] Programs section shows 4 program cards with icons
[ ] Each program card has: icon in colored circle, program name, real description
[ ] NO program card has AI filler text

[ ] Meeting schedule appears ONCE (not duplicated)
[ ] Contact section has address, phone, email with icons
[ ] Newsletter signup form exists

[ ] Footer is dark (navy/near-black), white text
[ ] Footer shows "Member of Rotary International"
[ ] Footer has copyright line
[ ] Footer has "Powered by Pillar"
```

### Step 3: Verify Events Listing Page (/events)

```
[ ] All 4 events appear (Golf Outing, Backpack, Chili Cookoff, Weekly Meetings)
[ ] Weekly Meetings shows as ONE card with "Every Tuesday" — NOT multiple entries
[ ] Events sorted by date: Golf Outing (June) → Backpack (Aug) → Chili Cookoff (Oct) → Weekly Meetings (recurring, at end or integrated by next occurrence)
[ ] Each card has icons for date, time, location
[ ] Ticketed events show price and "Buy Tickets"
[ ] Non-ticketed events show "Learn More"
[ ] Cards are in responsive grid (1/2/3 columns)
```

### Step 4: Verify Event Detail Pages

**Golf Outing (/events/annual-golf-outing):**
```
[ ] Hero section with event title, date, time, location
[ ] Price badge: "$125 per golfer"
[ ] "Buy Tickets" CTA in hero
[ ] "144 tickets remaining" (or "144 spots available")
[ ] Description section with full event description
[ ] Ticket purchase form: name, email, quantity (1-10), price display, total display
[ ] Sponsor section heading exists (even if no sponsors added yet for test)
[ ] No vendor registration section (hasRegistration = false for this event)
```

**Chili Cookoff (/events/annual-chili-cookoff):**
```
[ ] Hero section with event title, date, time, location
[ ] Price badge: "$10 per taster"
[ ] Ticket purchase form works
[ ] Vendor registration section visible
[ ] "300 tickets remaining"
```

**Backpack Packing (/events/backpack-program-packing-night):**
```
[ ] Hero section with event title, date, time, location
[ ] NO ticket section (isTicketed = false)
[ ] NO price badge
[ ] Description section with full description
```

### Step 5: Verify Ticket Flow

For the Golf Outing:
```
[ ] Fill form: name="Test User", email="test@example.com", quantity=2
[ ] Total displays "$250" (2 × $125)
[ ] Submit button is clickable
[ ] POST to /api/events/annual-golf-outing/ticket-checkout returns a checkout URL
[ ] (If Square is connected: URL is a valid Square checkout link)
[ ] (If Square is NOT connected: graceful error message, not a crash)
```

### Step 6: Verify Navigation

```
[ ] Desktop nav shows: Home, Events (dropdown), About, Contact
[ ] Events dropdown lists all events with dates
[ ] Events in dropdown sorted by date
[ ] Mobile hamburger menu opens/closes
[ ] Mobile menu scrolls if event list is long
[ ] All nav links work (no 404s)
```

### Step 7: Verify Visual Design

```
[ ] Primary color is Rotary blue (#003366 or close), NOT default gray
[ ] Accent color is Rotary gold (#F7A81B or close)
[ ] Sections alternate backgrounds (white → tinted → white → tinted)
[ ] All cards have borders or shadows
[ ] All clickable elements have hover effects
[ ] All metadata has icons (calendar, clock, map pin, phone, mail)
[ ] No "Scroll to explore" text anywhere
[ ] No AI filler text anywhere
[ ] Page title is "Norwin Rotary Club — Service Above Self" (not "Vite App")
[ ] Meta description is set
[ ] OG tags are set
```

### Step 8: Verify Mobile

```
[ ] Load at 375px viewport width
[ ] No horizontal scrolling
[ ] All cards stack to single column
[ ] Touch targets are 44px+ height
[ ] Hero text is readable without zooming
[ ] Hamburger menu works
```

### Step 9: Run Full Validation Checklist

Run every check from `pillar-build-validation-checklist.md` (all 18 checks). Record pass/fail for each.

### Step 10: Report Results

Present a summary:

```
SELF-TEST RESULTS: Norwin Rotary Club Demo Site
================================================

Site URL: [test URL]
Org Type: Rotary & Service Clubs
Build Method: Simulated interview (no crawl)

HOMEPAGE:
  ✓ Hero with Rotary blue background
  ✓ Rotary logo displayed
  ✓ 3 featured event cards with proper treatment
  ✓ Programs section with 4 cards, real descriptions
  ✓ Meeting schedule (displayed once)
  ✓ Newsletter signup
  ✓ Dark footer with Rotary International affiliation

EVENTS:
  ✓ 4 events displayed (3 one-time + 1 recurring as single entry)
  ✓ Sorted by date
  ✓ Ticketed events show price + Buy Tickets
  ✓ Non-ticketed events show Learn More

EVENT DETAIL PAGES:
  ✓ Golf Outing: ticket form, $125, 144 capacity
  ✓ Chili Cookoff: ticket form, $10, 300 capacity, vendor registration
  ✓ Backpack Packing: no ticket section (correct)

TICKET FLOW:
  ✓ Form submits correctly
  ✓ Total calculates in real time
  ✓ Checkout URL returned (or graceful error if no payment provider)

VISUAL DESIGN:
  ✓ Rotary blue + gold colors
  ✓ Alternating section backgrounds
  ✓ Card hover effects
  ✓ Icons on all metadata
  ✓ No AI filler text
  ✓ No "Scroll to explore"

VALIDATION CHECKLIST:
  ✓ CHECK 1-18: ALL PASS

OVERALL: PASS ✓
```

OR, if failures exist:

```
OVERALL: FAIL ✗ — 3 issues found

FAILURES:
1. CHECK 5: Brand colors — hero background is default gray, not Rotary blue
2. CHECK 16: Homepage featured — only 2 events in featured section, expected 3
3. CHECK 7: Irrelevant images — "stock-meeting.jpg" is a generic stock photo

FIXING...
[agent fixes issues]

RE-TEST RESULTS: ALL PASS ✓
```

---

## ADDITIONAL TEST SCENARIOS

After the primary test passes, these additional scenarios can be run:

### Scenario B: Crawl Test

```
Trigger: "Test the crawl pipeline"
Action: Agent attempts to crawl https://norwinrotary.org (or another provided URL)
Verify: 
  - Crawl extracts org name, logo, events, contact info
  - All images downloaded and re-hosted (not hotlinked)
  - Logo verified as valid image file
  - Past events excluded
  - Recurring events collapsed
  - Crawl summary presented before build
```

### Scenario C: Autopilot Event Creation Test

```
Trigger: "Test Autopilot event creation"
Action: Agent creates an event via the API as if Autopilot received a user message:
  "Add a pancake breakfast on April 12 at the fire hall, $15, 80 spots"
Verify:
  - Event created via POST /api/management/events
  - Slug generated: "pancake-breakfast"
  - Event appears on homepage (auto-featured if < 3 featured events)
  - Event appears on /events listing
  - Event detail page loads at /events/pancake-breakfast
  - Ticket form shows $15, 80 capacity
  - Nav dropdown updated
```

### Scenario D: Veterans Org Test (Different Org Type)

```
Trigger: "Test with a veterans org"
Simulated data:
  - Name: "VFW Post 781"
  - Location: Irwin, PA
  - Type: Veterans Organizations
  - Colors: Military navy + patriotic red
  - Events: Fish Fry (ticketed, $12), Memorial Day Ceremony (free)
  - Features: Canteen hours, hall rental info
Verify:
  - Navy + red color scheme (NOT Rotary blue)
  - Different visual personality than Rotary test
  - Canteen hours prominently displayed
  - "VFW Post 781" in formal/strong typography
```

### Scenario E: HOA Test (Minimal Content)

```
Trigger: "Test with an HOA"
Simulated data:
  - Name: "Sunset Ridge HOA"
  - Location: Irwin, PA
  - Type: Homeowner Associations
  - Events: Annual Meeting (free), Block Party (free)
  - Programs: None
  - No ticketing, no sponsors, no vendors
Verify:
  - Announcements section is first after hero (HOA-specific rule)
  - No programs section (empty sections hidden)
  - No ticket forms on any events
  - Clean, functional design (calm teal, not flashy)
  - Board member list (if provided)
```

---

## HOW TO ADD NEW TEST SCENARIOS

When new features are added to Pillar, add a corresponding test scenario here:

1. Define the simulated input data
2. Define what the built site MUST show
3. Define what the built site MUST NOT show
4. Add verification checkpoints
5. Add to the self-test execution flow

---

## RUNNING PARTIAL TESTS

You don't always need to run the full test. Quick tests:

| Command | What it tests |
|---|---|
| "Test the homepage" | Steps 2 + 7 only |
| "Test the event flow" | Steps 3 + 4 + 5 only |
| "Test the ticket flow" | Step 5 only |
| "Test mobile" | Step 8 only |
| "Run validation" | Step 9 only (checklist against live site) |
| "Test with [org type]" | Full test with a different org type scenario |
| "Test the crawl" | Scenario B |
| "Test Autopilot" | Scenario C |

---

## THE POINT

You should be able to say "run the self-test" and walk away. When you come back, you see either "ALL PASS" or a list of specific failures the agent already fixed. You never manually check colors, count event cards, or click through ticket forms yourself. The agent does all of that.
