# Pillar — Standard Operating Procedures

**Version:** 1.0  
**Effective:** April 2026  
**Owner:** Founder  
**Updated by:** Whoever last ran the process

> These SOPs define how Pillar operates day-to-day. Every contractor should read the SOPs relevant to their role before starting work. The founder updates these whenever a process changes. Do not improvise outside these procedures without founder approval.

---

## SOP 001 — Customer Support Response

**Owner:** Customer Success Coordinator  
**Trigger:** Any new support ticket in the queue  
**SLA:** Respond within 2 business hours; resolve within 24 hours

### Steps

1. Open the support ticket queue in the admin panel
2. Read the ticket fully before responding — do not reply until you understand what the customer actually needs
3. Check the customer's account:
   - What tier are they on?
   - How long have they been a customer?
   - Have they filed previous tickets?
4. Categorize the ticket:
   - **How-to question** → Answer directly with steps; link to documentation if available
   - **Technical bug** → Reproduce if possible; log for the founder; tell the customer "I've flagged this and will follow up within 24 hours"
   - **Billing question** → Check Stripe; answer if straightforward; escalate to founder if refund > $50 is involved
   - **Cancellation request** → Follow SOP 003 (Cancellation)
5. Write a response that:
   - Addresses the specific issue (no copy-paste boilerplate openings)
   - Tells them what happens next if the issue isn't resolved immediately
   - Is written as if from a person, not a helpdesk bot
6. Mark ticket status appropriately: Open → Pending → Resolved
7. If the issue reveals a product problem, log it in the Notion bug tracker and notify the founder

### Escalate to founder when:
- Refund request over $50
- Customer is threatening chargeback or dispute
- Technical issue affects more than one customer
- Customer is a partnership lead or unusually large organization

---

## SOP 002 — New Customer Onboarding

**Owner:** Customer Success Coordinator  
**Trigger:** New trial sign-up (check admin panel daily)  
**Goal:** Get the customer to a live website within 72 hours of sign-up

### Steps

**Day 0 (within 24 hours of sign-up):**
1. Send personal welcome email — not automated, written by the coordinator
   - Subject: "Welcome to Pillar — let's get your website live"
   - Include: who you are, what the next step is, offer to hop on a call if they want a walkthrough
   - Keep it under 100 words

**Day 1–2 (if no action taken):**
2. Check if the customer has started the website builder (check admin panel)
3. If not: send a nudge — "Hey [Name], just checking in — did you get a chance to start your website? It only takes about 10 minutes, and I can walk you through it."
4. If yes: send a congratulations and point them to the next feature (events, social media, etc.)

**Day 3 (if still no website):**
5. Send a final nudge with a clear offer: "Want me to hop on a 10-minute call? I'll walk you through it live."
6. Log this customer as "at-risk" in the tracker

**Day 7 (trial check-in):**
7. Send a mid-trial check-in to all active trial customers
   - Ask: "How's it going? Is there anything that's unclear or not working for you?"
   - Mention: trial ends in 7 days, what happens when it ends

**Day 12 (pre-conversion):**
8. Send trial-ending reminder: "Your free trial ends in 2 days. Here's what you've built — [link]. Here's what you'll keep with a paid plan."

### Success criteria:
- Website is live before trial ends
- Customer has logged in at least 3 times
- No open unresolved tickets at conversion

---

## SOP 003 — Cancellation and Churn Response

**Owner:** Customer Success Coordinator  
**Trigger:** Customer requests cancellation or cancels via the app  
**Goal:** Understand why, save the customer if possible, log the reason always

### Steps

1. When a cancellation request arrives (ticket or in-app), respond within 2 hours
2. Before offering anything, ask: "Before I process this, can I ask what's not working?" — you need the real reason
3. Categorize the reason:
   - **Price** → Offer a downgrade to a lower tier, not a discount (we don't discount)
   - **Not using it** → Ask what got in the way; offer a 15-minute walkthrough; let them pause if possible
   - **Technical problem** → Check if there's a known issue; escalate to founder; offer extension
   - **Organization closed/merged** → Thank them; process cancellation; log org type for product intel
   - **Found a competitor** → Ask which one and why; log it; process cancellation without argument
4. If you save the customer (they stay): log it as a save in the churn tracker
5. If you cannot save them: process the cancellation cleanly, thank them genuinely, and leave the door open: "If you ever restart or need something for another organization, we'd love to have you back."
6. Log every cancellation with: customer name, tier, months active, reason, whether save was attempted, outcome

### Do NOT:
- Offer a discount (we don't discount — it devalues the product and creates expectations)
- Argue with the customer's reason
- Make promises about upcoming features unless the founder has confirmed them

---

## SOP 004 — Social Media Posting (Pillar's Own Accounts)

**Owner:** Growth & Content Coordinator  
**Platforms:** LinkedIn, Facebook (Pillar Page), X  
**Frequency:** At least 5 posts/week across platforms

### Content types (rotate weekly)
1. **Problem post** — Describe a pain the target customer feels; no product mention until the end or not at all
2. **Feature post** — Show Pillar doing something specific; include a screenshot or short video
3. **Org spotlight** — Highlight an org type Pillar serves (without naming real customers unless approved)
4. **Tip post** — Practical advice for running a civic org (non-product)
5. **Engagement post** — Question or poll directed at HOA/lodge/nonprofit admins

### Approval process
- Posts do NOT need founder approval before publishing unless:
  - They make a claim about pricing, features, or capabilities
  - They mention a named organization or person
  - They reference a news event, controversy, or anything sensitive
- If in doubt: send draft to founder, expect response within 4 hours

### Voice and tone
- Write as if you're a peer of the reader, not a brand
- No corporate speak: not "leverage," "synergy," "empower," "solutions"
- Use specific numbers when possible: "saves 3 hours a month" not "saves time"
- No hashtag spam — max 3 relevant hashtags per post

---

## SOP 005 — Outreach Campaign Management

**Owner:** Outreach & Partnerships Coordinator  
**Goal:** Fill the top of the funnel with qualified trial sign-ups via direct outreach

### Prospect research process
1. Find targets using:
   - Public lodge/HOA directories
   - Facebook groups for civic org administrators
   - LinkedIn (search "HOA president," "lodge secretary," "PTA president")
   - State-level organization registries (most grand lodges publish lodge directories)
2. Record in the prospect tracker: org name, contact name, role, email (if public), current website (if any), notes
3. Prioritize orgs with: outdated websites, no social media presence, large membership (higher value), or active event calendar (higher need)

### Outreach sequence
- **Day 1:** First email (personalized opening, 2–3 sentences, soft ask)
- **Day 4:** Follow-up if no reply (different angle — lead with a benefit or question)
- **Day 9:** Final follow-up ("Last one from me — happy to send info or just drop a link to try it free")
- **Day 10+:** Mark as "no response" — do not contact again for 90 days

### Metrics to hit weekly
- 75–100 new prospects researched
- 60–80 outreach emails sent
- 5–10 replies engaged
- 2–5 trial sign-ups attributed to outreach

### What counts as a conversion
- Prospect clicks trial link and starts a sign-up = conversion; log their email in the tracker
- Do not count replies that don't result in a sign-up

---

## SOP 006 — Failed Payment Recovery

**Owner:** Operations & Admin Coordinator (or founder until that role is hired)  
**Trigger:** Stripe webhook fires for failed payment  
**Goal:** Recover the payment without losing the customer

### Steps
1. Stripe will automatically retry failed payments on days 3, 5, and 7
2. On day 1 of failure: send a polite email to the customer
   - Subject: "Heads up — your Pillar payment didn't go through"
   - Body: short, human, no blame; include a direct link to update their payment method
3. On day 5 (if still failed): send a second email — slightly more urgent
4. On day 8 (if still failed): escalate to founder; discuss whether to cancel the subscription or reach out personally
5. Log all failed payments: customer, tier, amount, date, resolution

### Do NOT:
- Threaten the customer
- Disable their account before day 8 without founder approval
- Make exceptions to the payment recovery process without founder sign-off

---

## SOP 007 — Weekly Metrics Review

**Owner:** Founder (with input from all coordinators)  
**Frequency:** Every Monday morning  
**Time:** 30 minutes

### Metrics to review
- MRR (this week vs. last week)
- New trials started
- Trial-to-paid conversions
- Cancellations + churn rate
- Support tickets: volume, average response time, resolution rate
- Outreach: emails sent, reply rate, trial conversions from outreach
- Social: reach, engagement, click-through to landing page
- Failed payments: count, recovered, lost

### Where to find the numbers
- MRR and subscriptions: Stripe dashboard
- Trials and cancellations: Pillar admin panel
- Support: ticket queue summary from Customer Success Coordinator
- Outreach: weekly report from Outreach Coordinator
- Social: Buffer/LinkedIn/Facebook native analytics
- Operations: Notion MRR tracker

### Output
- 5-bullet summary written by founder (or delegated): what went up, what went down, what to focus on this week
- Share with the full contractor team in Notion or email

---

## SOP 008 — Feature Request Handling

**Owner:** Founder  
**Input:** Any contractor or customer can submit a feature request

### Process
1. Customer or contractor logs the request with: what was asked for, by whom, and the exact words used
2. Customer Success Coordinator collects requests weekly and adds them to the Notion feature request log
3. Founder reviews the log every 2 weeks
4. Prioritization criteria:
   - How many customers have asked for this?
   - Does it help with conversion, retention, or expansion?
   - How hard is it to build?
5. Features get one of three statuses: **Planned**, **Considering**, **Not now**
6. If a customer asked and it's Planned: Customer Success follows up with them personally

### What not to do
- Never promise a feature or timeline to a customer without founder confirmation
- Never add a feature request to the public roadmap without founder sign-off

---

## Quick Reference: Escalation Matrix

| Situation | Handle It | Escalate To Founder |
|-----------|-----------|---------------------|
| How-to support question | Customer Success | — |
| Technical bug (one customer) | Customer Success logs it | Founder investigates |
| Technical bug (multiple customers) | Immediately escalate | Founder |
| Refund request under $50 | Customer Success | — |
| Refund request over $50 | — | Founder |
| Chargeback or dispute | — | Founder immediately |
| Customer wants to cancel | Customer Success follows SOP 003 | If 3+ months customer |
| Partnership inquiry | Outreach Coordinator flags | Founder handles |
| Press or media inquiry | — | Founder handles |
| Any legal question | — | Founder immediately |
