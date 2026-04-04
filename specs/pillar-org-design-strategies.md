# Pillar: Organization-Specific Design & Build Strategies

This document defines exactly how to design, build, and populate a site for each organization category. The AI agent should identify the org type from the questionnaire (or crawl — see `pillar-site-crawl-spec.md`), then follow the corresponding strategy.

**This document works alongside:**
- `pillar-visual-design-spec.md` — mandatory visual rules (cards, hover effects, icons, section separation)
- `pillar-event-rendering-spec.md` — how events appear on homepage, listing, and detail pages
- `pillar-build-validation-checklist.md` — 18-point quality gate run after every build

---

## UNIVERSAL RULES (APPLY TO ALL ORG TYPES)

These rules override any org-specific layout below:

1. **Homepage MUST include a featured events section** within the first 2-3 sections after the hero. Max 3 events. See `pillar-event-rendering-spec.md` for exact structure and auto-featuring rules.
2. **Every event card MUST have icons for date, time, and location.** See `pillar-visual-design-spec.md` for the icon table.
3. **Ticketed events MUST show price badge and "Buy Tickets" CTA** on both homepage featured cards and events listing cards.
4. **Colors MUST match the org type.** If a parent org has brand colors (Rotary, Lions, etc.), those override everything.
5. **If the user provided an existing site URL**, crawl it FIRST per `pillar-site-crawl-spec.md`. Crawled data supplements the interview — don't make the user repeat what was already found.

---

## ORGANIZATION TYPE DETECTION

During the initial conversation, classify the organization into one of these categories based on their name, description, or stated purpose:

| If they mention... | Classify as... |
|---|---|
| Lodge, Masonic, Elks, Moose, Eagles, Knights of Columbus, Odd Fellows, Shriners | Masonic & Fraternal Lodges |
| Rotary, Lions, Kiwanis, Optimist, Exchange Club, Soroptimist, service club | Rotary & Service Clubs |
| VFW, American Legion, AMVETS, DAV, Veterans of Foreign Wars, military | Veterans Organizations |
| HOA, homeowners, condo association, neighborhood association, community association | Homeowner Associations |
| PTA, PTO, booster club, school group, parent-teacher, band boosters | PTAs & School Groups |
| Nonprofit, foundation, charity, 501(c)(3), food bank, shelter, community org | Nonprofits |

If the org doesn't fit neatly, use Nonprofits as the default strategy.

---

## 1. MASONIC & FRATERNAL LODGES

### Character
These are tradition-heavy organizations with ceremony, history, and brotherhood/sisterhood. Members range from 30s to 80s. They host dinners, fundraisers, community service events, and social gatherings. They value dignity, heritage, and discretion.

### Color Palette
- **Primary:** Deep navy blue (HSL 220 60% 25%) — tradition, authority, trust
- **Accent:** Gold/amber (HSL 42 80% 50%) — prestige, heritage, ceremony
- **Background:** Warm off-white (HSL 40 20% 98%) — parchment feel, not sterile
- **Text:** Near-black with warm undertone (HSL 220 15% 12%)
- **Muted:** Warm gray (HSL 220 8% 55%)

Why: Navy + gold is the universal language of fraternal organizations. It mirrors the physical lodge — dark wood, brass fixtures, ceremonial regalia. Using these colors immediately signals "this is an established institution."

### Typography
- **Headlines:** Serif, bold. These orgs have been around for 100+ years. Serif fonts communicate that permanence.
- **Body:** System sans-serif. Readable for older members.
- **Size:** Slightly larger than default body text (16px base). Older membership = readability priority.

### Layout Strategy
```
HOME PAGE:
├── Hero: Lodge name + number (e.g., "Irwin Lodge #549 F&AM")
│   └── Subtitle: "Chartered [year]" or founding statement
│   └── Seal/emblem prominently displayed (NOT tiny in corner)
│   └── CTA: "Upcoming Events" and "About Our Lodge"
├── Next Meeting / Upcoming Event: Single prominent card
│   └── Date, time, location, what to expect
│   └── "Stated meetings: 1st and 3rd Tuesday" type info
├── About: Brief history, mission, what Masonry/the fraternity is about
│   └── Photo of the lodge building if available
├── Events: Card grid of upcoming dinners, fundraisers, degree nights
├── Officers: List with titles (Worshipful Master, Senior Warden, etc.)
│   └── These titles matter deeply to the organization — display them
├── Contact: Lodge address, mailing address, meeting schedule
│   └── "Interested in joining?" section with inquiry form
└── Footer: Grand Lodge affiliation, district info
```

### Content Questions (Ask These)
1. "What's your lodge name and number?" (e.g., "Lodge #549")
2. "When was it chartered/founded?"
3. "When and where do you meet? (day of week, time, address)"
4. "Who are your current officers?" (list titles and names)
5. "What events do you host? Dinners? Fundraisers? Community events?"
6. "Do you sell tickets to any events?"
7. "Do you have a photo of your lodge building?"
8. "What Grand Lodge are you under?" (for footer affiliation)

### What NOT to Do
- Don't make it look modern/startup. These orgs respect tradition.
- Don't use playful fonts or bright colors. It should feel like dark wood and brass.
- Don't expose internal ritual or degree information. Lodge sites are about the public face.
- Don't use generic "join our community" language. Use their language: "petition for membership," "become a brother."

### Event Types Common to This Org
- Stated meetings (recurring, monthly)
- Degree nights (not public)
- Dinners and socials (often ticketed, $10-25)
- Community fundraisers (pancake breakfasts, fish frys)
- Installation of officers (annual)
- Memorial services
- Charity events

---

## 2. ROTARY & SERVICE CLUBS

### Character
Professional service organizations with a mix of business networking and community service. Members are typically working professionals 30-70. They meet weekly, run community programs, and organize fundraising events. They have strong national/international branding (Rotary wheel, Lions logo, etc.).

### Color Palette
- **Use the parent organization's brand colors.** This is non-negotiable.
  - Rotary: Royal blue (HSL 218 100% 32%) + Gold (HSL 40 93% 54%)
  - Lions: Purple (HSL 275 70% 30%) + Gold (HSL 45 90% 50%)
  - Kiwanis: Blue (HSL 210 80% 35%) + Gold (HSL 45 85% 50%)
  - Optimist: Red (HSL 0 75% 45%) + Gold (HSL 45 85% 50%)
- **Background:** Clean white
- **Text:** Dark charcoal (HSL 0 0% 15%)

Why: These clubs have international brand recognition. A Rotary member in Tokyo recognizes Rotary blue. Using off-brand colors confuses members and looks unofficial. The parent org usually has brand guidelines — follow them.

### Typography
- **Headlines:** Bold sans-serif. These are professional networking orgs — serif can feel too old-fashioned for the younger members they're trying to recruit.
- **Body:** System sans-serif, 15-16px.

### Layout Strategy
```
HOME PAGE:
├── Hero: Club name + parent org logo (Rotary wheel, etc.)
│   └── Motto ("Service Above Self" for Rotary, "We Serve" for Lions)
│   └── CTA: "View Events" and "Join Us" or "Visit a Meeting"
├── Featured Event: If a fundraiser or special event is coming up
│   └── Large card with date, description, ticket button if applicable
├── Programs: Cards for each service program
│   └── REAL descriptions, not AI filler. One sentence each minimum.
│   └── Icon + name + what it actually does
│   └── Examples: "We donate dictionaries to every 3rd grader in the district"
├── Upcoming Events: List sorted by date
│   └── Separate one-time events from recurring meetings
│   └── Weekly meetings: ONE card, not 52 listings
│   └── "Weekly Meetings — Tuesdays 12-1pm at [location]"
├── About / Join: What the club does, how to visit a meeting, membership info
│   └── "Guests are welcome at any meeting" type messaging
├── Contact: Meeting location, mailing address, club email
└── Footer: District info, parent org link, Rotary International / Lions International
```

### Content Questions
1. "What's your club name?" (e.g., "Norwin Rotary Club")
2. "What parent organization? Rotary, Lions, Kiwanis, etc.?"
3. "When and where do you meet? Is it weekly?"
4. "What service programs do you run? Describe each in one sentence."
5. "What fundraising events do you hold? Do any sell tickets?"
6. "Who are your current officers? (President, Secretary, etc.)"
7. "Are guests welcome at regular meetings?"
8. "What Rotary/Lions district are you in?"

### Critical Rule: Recurring Meeting Handling
Service clubs meet weekly. If the user enters "Weekly meetings" as an event, DO NOT create 52 separate event entries. Create ONE informational card:
```
REGULAR MEETINGS
Every Tuesday, 12:00 - 1:00 PM
Jacktown Ride & Hunt Club
Guests always welcome
```
Display this as a persistent info block, separate from the one-time event list.

### What NOT to Do
- Don't use colors that aren't the parent org's brand.
- Don't generate fake program descriptions. If you don't know what their Backpack Program does, ask. "Our program brings community members together for meaningful impact" is obvious AI slop.
- Don't list every weekly meeting as a separate event. It buries real events.
- Don't forget the parent org logo. It matters for legitimacy.

---

## 3. VETERANS ORGANIZATIONS

### Character
Military heritage organizations (VFW, American Legion, AMVETS). Members are veterans and their families. The culture is patriotic, respectful, community-oriented. They run a post/hall, host events, support veterans in need, and serve as community gathering places. Members range from 20s (recent veterans) to 90s (WWII/Korea era).

### Color Palette
- **Primary:** Navy blue (HSL 215 70% 22%) — military, patriotic
- **Secondary:** Deep red (HSL 0 65% 35%) — patriotic, sacrifice
- **Accent:** White or light silver — completes the patriotic palette
- **Background:** White or very light warm gray
- **Text:** Near-black (HSL 0 0% 10%)
- Gold accents sparingly for honors/awards sections

Why: Red, white, and blue. There is no other option. These colors carry deep meaning for veterans. Using trendy colors would feel disrespectful. Keep it dignified, patriotic, and clean.

### Typography
- **Headlines:** Bold serif OR bold sans-serif. Either works — the key is BOLD. Military culture values strength and clarity.
- **Body:** System sans-serif, 16px. Clear, readable. Many older members.

### Layout Strategy
```
HOME PAGE:
├── Hero: Post name + number (e.g., "VFW Post 781")
│   └── American flag or patriotic imagery as background
│   └── Tagline: their motto or mission statement
│   └── CTA: "Upcoming Events" and "Join Our Post"
├── Post Information: Address, canteen hours, hall rental info
│   └── Many VFW/Legion posts are community venues
│   └── "Hall available for rent" if applicable
├── Upcoming Events: Card grid
│   └── Common: fish frys, steak nights, bingo, holiday ceremonies
│   └── Memorial Day, Veterans Day events get special prominence
├── About: Post history, when chartered, what they support
│   └── Veterans support programs
│   └── Community involvement
├── Membership: How to join, eligibility requirements
│   └── VFW: Must have served in a foreign war
│   └── Legion: Must have served during specific eras
│   └── Include auxiliary/associate membership options
├── Hall Rental: If they rent their space
│   └── Capacity, amenities, contact for booking
├── Contact: Post address, phone, canteen hours
└── Footer: Department/national organization link
```

### Content Questions
1. "What's your post name and number?" (e.g., "VFW Post 781")
2. "What organization? VFW, American Legion, AMVETS, DAV?"
3. "Where is your post located? Do you have a canteen/bar?"
4. "What are your hours? (if you have a public canteen)"
5. "Do you rent your hall for events? What's the capacity?"
6. "What events do you host? (fish frys, bingo, steak nights, ceremonies)"
7. "Do any events sell tickets or require pre-registration?"
8. "What are your membership eligibility requirements?"
9. "Do you have an auxiliary (spouses/family membership)?"
10. "What community programs do you support?"

### Unique Features for This Org Type
- **Hall rental page:** Many veteran posts are event venues. Include a dedicated section with capacity, amenities, pricing, and a contact/booking form.
- **Canteen hours:** If they have a public bar/lounge, display hours prominently.
- **Memorial events:** Veterans Day and Memorial Day events should auto-feature in the weeks before those dates.

### What NOT to Do
- Don't use pastel colors, rounded fonts, or anything "cute." Dignity matters.
- Don't use stock military photos. Either use their actual photos or use no photos. A stock photo of random soldiers feels disrespectful to actual veterans.
- Don't forget eligibility requirements for membership. Each org has specific rules.
- Don't make it look like a restaurant website even though they often serve food. It's a veterans post first.

---

## 4. HOMEOWNER ASSOCIATIONS

### Character
HOAs are functional organizations, not feel-good communities. Residents need to find information fast: meeting dates, dues, rules, contacts, community events. The audience is homeowners of all ages who primarily interact with the HOA when they need something or have a complaint.

### Color Palette
- **Primary:** Calm teal or sage green (HSL 170 35% 40%) — nature, community, calm
- **OR** Warm neutral blue (HSL 210 30% 45%) — professional, stable
- **Background:** White
- **Text:** Dark charcoal
- **Accent:** Use primary at lower saturation for borders and subtle highlights

Why: HOAs need to feel calm and professional. Not corporate, not fun — functional and trustworthy. Green connects to neighborhoods, lawns, community. Blue works for more urban/condo associations. Avoid anything too vibrant — HOA communications should de-escalate, not energize.

### Typography
- **Headlines:** Sans-serif, semi-bold. Clean and modern without being trendy.
- **Body:** System sans-serif, 15-16px.

### Layout Strategy
```
HOME PAGE:
├── Hero: Community/HOA name
│   └── Photo of the neighborhood/community entrance if available
│   └── Address or neighborhood name
│   └── CTA: "Next Meeting" and "Contact Board"
├── Announcements: Prominent section for current notices
│   └── Snow removal updates, construction notices, rule changes
│   └── This is the MOST IMPORTANT section — residents come here for news
├── Board Information: Board members with titles and contact info
│   └── President, VP, Secretary, Treasurer, At-Large
├── Meeting Schedule: Next board meeting date, time, location
│   └── Link to past meeting minutes if available
├── Community Events: If the HOA hosts social events
│   └── Block parties, holiday decorating contests, yard sales
├── Documents: Links to CC&Rs, bylaws, architectural guidelines
│   └── This section is critical — residents constantly need these docs
├── Contact: Board email, management company info, emergency contacts
│   └── "Submit a maintenance request" or "Report an issue" form
└── Footer: Management company name if applicable
```

### Content Questions
1. "What's the name of your community/HOA?"
2. "Where is it located?"
3. "Who are your board members? (names and titles)"
4. "When do you hold board meetings? (schedule, location)"
5. "Do you have a management company?"
6. "Do you host any community events? (block parties, etc.)"
7. "Do you have documents residents need access to? (CC&Rs, bylaws, guidelines)"
8. "What's the best way for residents to contact the board?"
9. "Do you have community amenities? (pool, clubhouse, playground)"
10. "Do you have a photo of the community entrance or common areas?"

### Unique Features for This Org Type
- **Announcements section:** This is the #1 reason residents visit the site. Make it the first thing they see after the hero. Sorted newest-first.
- **Document library:** Link to CC&Rs, bylaws, meeting minutes, architectural request forms. This is a high-value feature that saves the board from answering the same questions repeatedly.
- **Maintenance/issue reporting form:** "Report a streetlight out," "common area damage," etc.

### What NOT to Do
- Don't make it look like a fun community hub. HOAs are functional. Residents want info, not vibes.
- Don't bury the board contact info. It should be on the homepage.
- Don't forget the documents section. This is the single most useful feature for an HOA site.
- Don't add a newsletter signup unless the HOA specifically wants one. Most HOAs communicate through direct mail or email blasts to a known resident list.
- Don't add ticket sales or vendor registration. HOAs don't run those kinds of events.

---

## 5. PTAs & SCHOOL GROUPS

### Character
Parent-teacher organizations and school booster clubs. The audience is parents (30s-50s), teachers, and school administrators. They're busy, on their phones, and need information quickly. They fundraise heavily — candy sales, fun runs, restaurant nights, auctions. High energy, kid-focused, school-spirit driven.

### Color Palette
- **Use the school's colors.** Ask for them. Every school has colors.
- If no school colors provided:
  - **Primary:** Bright, warm blue (HSL 210 70% 45%) — trustworthy, approachable
  - **Accent:** Cheerful green or orange (HSL 140 60% 45% or HSL 30 80% 50%) — energy, optimism
- **Background:** White
- **Text:** Dark charcoal

Why: School groups ARE the school's brand. Using the school colors creates immediate recognition for parents. When they see the school colors, they know this is about their kid's school.

### Typography
- **Headlines:** Bold sans-serif. Friendly, energetic, modern. These orgs skew younger parents.
- **Body:** System sans-serif, 15-16px.

### Layout Strategy
```
HOME PAGE:
├── Hero: PTA/Booster name + school name
│   └── School mascot or logo if available
│   └── Tagline: "Supporting [School Name] Students"
│   └── CTA: "Upcoming Events" and "Volunteer"
├── Announcements: Current fundraisers, deadlines, sign-ups
│   └── Parents need to know what's due THIS WEEK
│   └── "Spirit Wear orders due Friday!" type urgency
├── Upcoming Events: Card grid sorted by date
│   └── Common: fun runs, book fairs, restaurant nights, dances, carnivals
│   └── Many are fundraisers with ticket sales
├── Ways to Help: Volunteer sign-ups, donation info
│   └── "Volunteer for the Spring Carnival"
│   └── "Donate to the Teacher Appreciation Fund"
│   └── These are the core CTAs for this org type
├── About: What the PTA does, how funds are used
│   └── "Last year we funded $X for [playground equipment, field trips, etc.]"
│   └── Transparency about where money goes builds trust
├── Officers/Board: President, VP, Treasurer, Secretary
├── Contact: PTA email, school office info
│   └── Link to school website
└── Footer: State PTA affiliation, school district
```

### Content Questions
1. "What school is this for?"
2. "Is this a PTA, PTO, or booster club?"
3. "What are the school colors and mascot?"
4. "Who are your officers?"
5. "What events and fundraisers do you run? List them."
6. "Do any events sell tickets? What are the prices?"
7. "Do you need volunteer sign-ups on the site?"
8. "How are funds typically used? (Give examples so you can show impact)"
9. "What's the PTA email or contact method?"
10. "Do you have a school logo I can use?"

### Unique Features for This Org Type
- **Volunteer sign-up forms:** Per-event volunteer slots with time/role selection. This is a killer feature for PTAs.
- **Fundraiser progress:** "We've raised $3,200 of our $5,000 goal!" Progress bars for active fundraisers.
- **Quick-action buttons:** "Buy Spirit Wear," "Sign Up to Volunteer," "Donate" — these should be prominently on the homepage. Parents have 30 seconds between pickup line and their kid getting in the car.

### What NOT to Do
- Don't make it look corporate. This is a parent group, not a law firm.
- Don't forget mobile optimization. 80%+ of PTA traffic is phones in the school pickup line.
- Don't use stock photos of random kids. Privacy is paramount in school contexts. Use event photos that don't show identifiable children, or use no photos.
- Don't make the site complicated. Parents need info in 10 seconds or less. Simplicity wins.

---

## 6. NONPROFITS

### Character
This is the broadest category. Food banks, animal shelters, community foundations, youth programs, arts organizations, health charities. The unifying theme: they need donations and volunteers, and they need to communicate their impact.

### Color Palette
Determine by sub-type:

| Nonprofit Focus | Primary Color | Why |
|---|---|---|
| Hunger / food bank | Warm orange (HSL 25 70% 50%) or green (HSL 140 50% 40%) | Warmth, nourishment, growth |
| Animal welfare | Teal (HSL 175 50% 40%) or warm purple (HSL 280 40% 45%) | Calm, compassionate |
| Youth / education | Bright blue (HSL 210 65% 45%) or green (HSL 150 55% 40%) | Growth, opportunity, trust |
| Health / medical | Blue (HSL 200 55% 40%) or teal (HSL 180 45% 40%) | Trust, calm, clinical-adjacent |
| Arts / culture | Deep teal (HSL 185 50% 35%) or burgundy (HSL 345 50% 35%) | Sophistication, creativity |
| Environment | Green (HSL 150 55% 40%) or earth brown (HSL 30 40% 40%) | Nature, sustainability |
| General community | Warm blue (HSL 215 50% 40%) or teal (HSL 170 40% 42%) | Trustworthy, approachable |

- **Background:** White
- **Text:** Near-black
- **Accent:** Complement to primary (use for donate buttons especially)

### Typography
- **Headlines:** Sans-serif for modern nonprofits, serif for established/historic ones.
- **Rule of thumb:** Founded in last 20 years → sans-serif. Founded 50+ years ago → serif.
- **Body:** System sans-serif, 15-16px.

### Layout Strategy
```
HOME PAGE:
├── Hero: Organization name + mission in one sentence
│   └── Impactful image if available (people being helped, community in action)
│   └── CTA: "Donate" (PRIMARY, most prominent) and "Get Involved"
│   └── The donate button should be IMPOSSIBLE TO MISS
├── Impact / By the Numbers: 3-4 statistics showing what they've done
│   └── "5,000 meals served" "200 families helped" "50 volunteers"
│   └── Numbers are more persuasive than paragraphs
├── Programs / What We Do: Cards for each program area
│   └── REAL descriptions. What do they actually do? Who do they help?
│   └── Each card should answer: "If I donate, what happens?"
├── Upcoming Events: Fundraisers, volunteer days, galas
│   └── Many are ticketed (galas, dinners, golf outings)
│   └── Show price and "Buy Tickets" or "Register" prominently
├── Ways to Give: Donate, volunteer, sponsor, in-kind donations
│   └── Multiple pathways — not everyone can give money
│   └── "Donate goods" "Volunteer your time" "Corporate sponsorship"
├── About: History, mission, team/board
│   └── Board of directors list (important for nonprofit credibility)
├── Contact: Office address, phone, email
│   └── "Schedule a visit" or "Tour our facility" if applicable
└── Footer: 501(c)(3) statement, EIN number, GuideStar/Charity Navigator links
```

### Content Questions
1. "What's your organization's name and mission?"
2. "What type of nonprofit? (food bank, shelter, youth program, etc.)"
3. "When were you founded?"
4. "What programs do you run? Describe each briefly."
5. "Do you have impact statistics? (meals served, families helped, etc.)"
6. "What events do you host? Any ticketed fundraisers?"
7. "How can people help? (donate, volunteer, sponsor, donate goods)"
8. "Do you accept online donations? What platform? (PayPal, Stripe, etc.)"
9. "Who's on your board of directors?"
10. "Do you have your 501(c)(3) EIN number?"
11. "Do you have photos of your work? (serving meals, events, facility)"

### Unique Features for This Org Type
- **Donate button in the header:** Always visible, on every page. Use a warm, action-oriented color (orange, green, or the accent color). This is THE conversion action.
- **Impact statistics:** Large numbers with labels on the homepage. "12,000 meals served in 2025." This is what converts visitors to donors.
- **Multiple giving pathways:** Not just money. Volunteer form, wish list/in-kind donation list, corporate sponsorship tiers.
- **501(c)(3) statement in footer:** "XYZ Foundation is a 501(c)(3) tax-exempt organization. EIN: XX-XXXXXXX. Donations are tax-deductible." This is legally important and builds donor confidence.

### What NOT to Do
- Don't bury the donate button. It should be in the nav bar on every page.
- Don't use generic impact language. "We make a difference" means nothing. "We served 12,000 meals to families in Westmoreland County" means everything.
- Don't forget the 501(c)(3) statement. Donors need this for tax purposes.
- Don't make the site feel like a corporate brochure. Show the human impact — real stories, real numbers.

---

## UNIVERSAL RULES (ALL ORG TYPES)

### Site Content Seeding
For every org type, seed these siteContent keys on first build:

```
org_name             → from questionnaire
org_tagline          → derived from org type + mission
org_mission          → from questionnaire or generated from type
org_address          → from questionnaire  
org_phone            → from questionnaire
org_email            → from questionnaire
meeting_schedule     → from questionnaire (day, time, location)
social_facebook      → from questionnaire
social_instagram     → from questionnaire
home_hero_title      → org name
home_hero_subtitle   → tagline or mission
about_description    → from questionnaire, expanded
footer_copyright     → "© [year] [org name]. All rights reserved."
footer_affiliation   → parent org or district info if applicable
```

### Image Strategy
When no photos are provided:
1. Use the org's logo/emblem as the hero visual on a solid color background
2. Use emoji or Lucide icons for program/service cards instead of photos
3. Use the primary color as hero background with white text overlay
4. NEVER use stock photos of people. They look fake and destroy credibility.
5. A solid-color hero looks intentional. A hero with a bad stock photo looks amateur.

When photos ARE provided:
1. Hero: best photo with dark overlay (bg-black/50) and white text
2. Event cards: event-specific photos with object-cover
3. About section: facility/building photo or group photo
4. Always object-cover with fixed heights. Never let uploads control layout.

### Mobile Priority
All org types: assume 60-80% mobile traffic. Design decisions:
1. Single column on mobile, expand to 2-3 on desktop
2. Touch-friendly buttons (min height 44px)
3. Hamburger nav with scrollable menu
4. Phone numbers as `tel:` links (tappable to call)
5. Addresses as Google Maps links (tappable to navigate)
6. No hover-only interactions (no hover on mobile)

### Event Date Sorting
ALWAYS sort events by date, soonest first, everywhere they appear:
- Event listing page
- Homepage featured/upcoming section  
- Navigation dropdown
- Events without dates go to the bottom

### Recurring Event Handling
If an event repeats (weekly meetings, monthly dinners):
- Display as ONE informational card with the schedule
- "Every Tuesday, 12-1pm at [location]"
- Do NOT create individual entries for every occurrence
- Separate from one-time events visually

### The "Is It Done?" Checklist
Before presenting any site to the user, verify:

1. [ ] Organization name and type are correct
2. [ ] Colors match the org's brand or the org-type strategy above
3. [ ] All text is real content, not AI filler (check every program/service description)
4. [ ] Events sorted by date, soonest first
5. [ ] Recurring events displayed as schedules, not individual entries
6. [ ] Mobile navigation scrolls properly
7. [ ] Images use object-cover (no stretching)
8. [ ] Contact information is complete and correct
9. [ ] No duplicate content on the page (same info shown twice)
10. [ ] Donate button visible on every page (nonprofits only)
11. [ ] 501(c)(3) statement in footer (nonprofits only)
12. [ ] Parent org logo/branding used (service clubs, fraternal orgs)
13. [ ] Meeting schedule displayed clearly
14. [ ] Ticket purchase flow works if ticketing is enabled
15. [ ] No "scroll to explore" or other UX anti-patterns
16. [ ] Page title and meta description set for SEO
17. [ ] All sections have real content or are hidden — never show empty sections
