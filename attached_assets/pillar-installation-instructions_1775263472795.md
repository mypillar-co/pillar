# How to Install These Specs in the Pillar Project

## Step 1: Upload the Archive

Upload `pillar-specs.tar.gz` to the Pillar project (mypillar.co Replit workspace).

## Step 2: Extract the Files

Tell the agent in the Pillar project:

---

**PASTE THIS EXACTLY:**

Extract pillar-specs.tar.gz into a directory called `specs/` at the project root. These 9 files are the authoritative rules for how the AI Site Builder interview, crawl, build, and validation pipeline works. They override any existing behavior that conflicts with them.

After extracting, do the following:

1. Create a file called `specs/README.md` that says:
   "These spec files are the AUTHORITATIVE rules for the AI Site Builder. The agent MUST read `pillar-master-index.md` before any site build, crawl, interview, or validation task. These specs override any conflicting behavior in the codebase."

2. Add the following system instruction (or equivalent) to wherever the AI Site Builder agent gets its instructions — whether that's a system prompt, a skill file, a .replit config, an agent instruction file, or a prompt template. Find the right place and add this:

```
MANDATORY: Before building any site, running any interview, crawling any URL, or validating any build, you MUST read specs/pillar-master-index.md first. This file defines the reading order for all 9 specification documents. Follow them exactly. They are not suggestions — they are requirements.

Key rules from the specs:
- If the user provides an existing website URL during the interview, STOP the interview and CRAWL the site first. Do NOT ask remaining questions. Do NOT fill in answers with AI-generated text. Extract real content from the existing site. See specs/pillar-site-crawl-spec.md.
- Every built site MUST have: colored hero (not white), event cards with icons and hover effects, org-type-specific colors, alternating section backgrounds, dark footer, no AI filler text, no duplicate content. See specs/pillar-visual-design-spec.md.
- Homepage MUST show up to 3 featured events near the top. See specs/pillar-event-rendering-spec.md.
- After every build, run the 18-point validation checklist. Do NOT present the site until all checks pass. See specs/pillar-build-validation-checklist.md.
- Events can be created via dashboard OR Autopilot. Both use the same API, produce the same result. See specs/pillar-event-rendering-spec.md.
```

3. Find every place in the codebase where the interview questions are defined or the interview flow is controlled. This might be:
   - A prompt template that lists the interview questions
   - A step-by-step flow that asks questions in order
   - A form or questionnaire component
   - An agent instruction that says "ask these questions"

   In that location, add this logic at question 4 ("Do you have an existing website?"):

   ```
   IF the user provides a URL:
     - STOP the interview. Do NOT show or ask remaining questions.
     - Crawl the URL following specs/pillar-site-crawl-spec.md
     - Use crawled data to auto-fill all remaining fields
     - Only ask follow-up questions for data the crawl didn't find
   ```

4. Find every place where the site is actually built/generated (where the template is populated with content and deployed). In that location, add:

   ```
   AFTER building the site:
     - Run the validation checklist from specs/pillar-build-validation-checklist.md
     - If any check fails, fix it before presenting the site to the user
     - The site MUST have all 8 mandatory visual elements from specs/pillar-visual-design-spec.md
   ```

5. Find where colors/theme are applied during the build. Replace any hardcoded or default color logic with the org-type color rules from specs/pillar-org-design-strategies.md and specs/pillar-visual-design-spec.md.

6. Show me exactly what you changed so I can verify the specs are wired in correctly.

---

## Step 3: Verify It Worked

After the agent makes the changes, tell it:

**"Run the self-test"**

Per `specs/pillar-self-test-spec.md`, it should build a real Norwin Rotary Club demo site with:
- Rotary blue + gold colors (not gray)
- 3 featured event cards on the homepage
- Working ticket forms
- Real event detail pages
- All 18 validation checks passing

If it comes back in seconds and says "done" without a real URL to click — it didn't do it. Tell it: "That's not a real site. Actually build it per specs/pillar-self-test-spec.md."

## Step 4: Test the Crawl

After the self-test passes, test the crawl by starting a new site build and saying:

**"Build a site for Norwin Rotary. Our website is norwinrotary.org"**

The agent should:
1. NOT ask you 8 more questions
2. Crawl norwinrotary.org
3. Show you what it found
4. Build using crawled data

If it dumps all the interview questions anyway, the crawl integration failed. Tell it: "You're ignoring the crawl spec. Read specs/pillar-site-crawl-spec.md — when I give you a URL, you crawl it first instead of asking me to retype everything."

## The 9 Files and What They Do

| File | Purpose |
|---|---|
| `pillar-master-index.md` | Entry point. Reading order and relationships between all docs. |
| `pillar-agent-guide.md` | How to interview users and make design decisions. |
| `pillar-org-design-strategies.md` | Org-type-specific colors, typography, layouts (Rotary, VFW, HOA, PTA, etc.) |
| `pillar-site-crawl-spec.md` | How to extract content from existing websites. |
| `pillar-visual-design-spec.md` | Mandatory visual elements (cards, hover effects, icons, section separation). |
| `pillar-event-rendering-spec.md` | How events appear on homepage, listing, and detail pages. Dashboard + Autopilot. |
| `pillar-admin-operations-guide.md` | Post-build site management via API. |
| `pillar-build-validation-checklist.md` | 18-point quality gate. Run after every build. |
| `pillar-self-test-spec.md` | Agent builds a test site and validates itself. |
