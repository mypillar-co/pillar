# Pillar — Financial Plan

**Currency:** USD  
**Model:** Monthly recurring revenue (MRR), subscription SaaS  
**Updated:** March 2026

---

## Revenue Model

**Tiers and pricing:**
| Tier | Monthly Price | Annual Price | Assumed % of customer base |
|------|--------------|--------------|---------------------------|
| Starter ($29) | $29 | $290 | 25% |
| Autopilot ($59) | $59 | $590 | 40% |
| Events ($99) | $99 | $990 | 25% |
| Total Operations ($149) | $149 | $1,490 | 10% |

**Blended ARPU (monthly):** $66.70  
*Calculation: (0.25×29) + (0.40×59) + (0.25×99) + (0.10×149) = $66.70*

---

## Cost Structure

### Fixed monthly costs (current)

| Item | Monthly Cost | Notes |
|------|-------------|-------|
| Replit deployment | ~$25–50 | Scales with usage |
| PostgreSQL (Replit) | $0 | Included |
| Domain (mypillar.co) | ~$1 | Annual amortized |
| **Total fixed** | **~$50/mo** | |

### Variable costs (per customer/usage)

| Item | Cost | Notes |
|------|------|-------|
| OpenAI (site generation) | ~$0.05–0.15 per site built | One-time per customer |
| OpenAI (social content) | ~$0.002–0.005 per post | ~50 posts/mo per customer = $0.10–0.25/mo |
| Anthropic (support chat) | ~$0.001 per message | Minimal |
| Stripe fees | 2.9% + $0.30/transaction | On each monthly charge |
| Porkbun domain purchase | ~$10–15 per domain | Only for customers who buy a domain through Pillar |
| **Variable per customer/mo** | **~$0.50–2.00** | Mostly AI + Stripe |

### People costs (contractors, hired as MRR milestones hit)

| Role | Monthly Cost | Hire Trigger |
|------|-------------|--------------|
| Customer Success Coordinator | $1,200–$1,800 | $3,000 MRR |
| Growth & Content Coordinator | $1,200–$2,000 | $5,000 MRR |
| Outreach & Partnerships Coordinator | $800–$1,200 | $7,500 MRR |
| Operations & Admin Coordinator | $400–$900 | $10,000 MRR |

---

## Revenue Projections

### Conservative scenario
*Assumes: slow word-of-mouth growth, no partnerships, founder doing outreach alone*

| Month | New Customers | Total Customers | MRR | Costs | Net |
|-------|--------------|----------------|-----|-------|-----|
| Apr 2026 | 5 | 5 | $334 | $50 | $284 |
| May 2026 | 8 | 12 | $800 | $75 | $725 |
| Jun 2026 | 10 | 20 | $1,334 | $100 | $1,234 |
| Jul 2026 | 12 | 30 | $2,001 | $200 | $1,801 |
| Aug 2026 | 14 | 42 | $2,801 | $300 | $2,501 |
| Sep 2026 | 15 | 54 | $3,602 | $1,500* | $2,102 |
| Oct 2026 | 18 | 68 | $4,535 | $1,600 | $2,935 |
| Nov 2026 | 20 | 83 | $5,536 | $3,000** | $2,536 |
| Dec 2026 | 22 | 100 | $6,670 | $3,100 | $3,570 |
| Mar 2027 | 35 | 175 | $11,673 | $5,200 | $6,473 |
| Jun 2027 | 50 | 275 | $18,343 | $6,500 | $11,843 |
| Dec 2027 | 75 | 500 | $33,350 | $8,500 | $24,850 |

\* Customer Success hire  
\*\* + Growth hire

### Base scenario
*Assumes: outreach coordinator hired at month 9, one partnership deal in month 12*

| Month | Total Customers | MRR | Net After Costs |
|-------|----------------|-----|-----------------|
| Jun 2026 | 25 | $1,668 | $1,500 |
| Sep 2026 | 60 | $4,002 | $2,202 |
| Dec 2026 | 120 | $8,004 | $3,804 |
| Mar 2027 | 220 | $14,674 | $7,174 |
| Jun 2027 | 380 | $25,346 | $14,346 |
| Dec 2027 | 750 | $50,025 | $32,025 |

### Optimistic scenario
*Assumes: partnership deal with grand lodge network month 9 (100+ customers), SEO hits*

| Month | Total Customers | MRR | Net After Costs |
|-------|----------------|-----|-----------------|
| Sep 2026 | 150 | $10,005 | $5,705 |
| Dec 2026 | 300 | $20,010 | $12,010 |
| Jun 2027 | 700 | $46,690 | $28,190 |
| Dec 2027 | 1,500 | $100,050 | $62,050 |

---

## Break-Even Analysis

**Current monthly fixed costs:** ~$50  
**Break-even (no contractors):** 1 customer  
**Break-even (with Customer Success hired):** ~22 customers ($1,500 cost ÷ $66.70 ARPU)  
**Break-even (full team):** ~84 customers ($5,600 total costs ÷ $66.70 ARPU)

---

## Key Metrics to Track Weekly

| Metric | Formula | Target |
|--------|---------|--------|
| MRR | Active customers × ARPU | Growing 15–25%/mo early |
| Trial-to-paid conversion | Paid ÷ (paid + cancelled trials) | >35% |
| Monthly churn rate | Cancelled ÷ total customers | <5%/mo |
| Customer LTV | ARPU ÷ monthly churn rate | >$1,000 |
| CAC (cost to acquire) | Sales/marketing spend ÷ new customers | <$100 early |
| LTV:CAC ratio | LTV ÷ CAC | >10:1 target |
| Net revenue churn | MRR lost to cancels - MRR gained from upgrades | Negative (expansion > churn) |

---

## Assumptions and Notes

1. **Churn assumption:** 4% monthly churn used in projections (industry average for SMB SaaS is 3–7%). Civic orgs that get set up tend to stay — switching costs are high once a website is live and social accounts are connected.

2. **Trial conversion:** 35% of trial starters become paying customers. This is conservative. With active Customer Success, it should be 40–50%.

3. **Annual billing:** Not yet offered. When introduced, offering 2 months free on annual should improve cash flow significantly and reduce churn.

4. **AI costs:** At scale (1,000+ customers), AI costs may increase. At $0.50–2.00/customer/month, even at 1,000 customers that's $500–$2,000/month — manageable relative to $65,000+ MRR.

5. **Stripe fees:** At $50,000 MRR, Stripe fees are roughly $1,550/month. Consider negotiating custom Stripe pricing at $250K+ annual volume.

6. **Infrastructure scaling:** Replit deployment costs will increase at scale. Budget $200–500/month at 500 customers, and evaluate moving to dedicated hosting at 1,000+ customers.

---

## Funding Strategy

**Bootstrapped.** No outside funding needed to reach profitability.

- Months 1–3: Founder-funded (costs under $100/mo)
- Months 4–9: Self-funded from MRR
- Month 9+: Profitable, reinvesting into contractor hires
- Year 2: Evaluate whether to raise seed funding to accelerate outreach or partnerships

**If raising:** A $250K pre-seed round at $20,000 MRR would allow immediate full-team hiring and a paid acquisition budget to accelerate to $100K MRR within 12 months.
