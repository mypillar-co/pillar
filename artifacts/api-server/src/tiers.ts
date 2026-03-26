// Steward subscription tier catalog
// stripePriceId is populated after running the seed-products script

export interface TierDefinition {
  id: string;
  name: string;
  description: string;
  price: number; // monthly, USD
  features: string[];
  stripePriceId: string | null;
  highlight?: boolean;
  domainIncluded: boolean;    // free domain with plan
  domainAddonAvailable: boolean; // can purchase domain add-on
}

export const TIERS: TierDefinition[] = [
  {
    id: "tier1",
    name: "Tier 1 — Website",
    description: "AI builds your website. You interact with the AI to request any changes.",
    price: 29,
    features: [
      "AI-generated website",
      "Chat to request updates",
      "Subdomain hosting (yourorg.steward.app)",
      "Mobile-responsive design",
      "SEO basics included",
      "Custom domain add-on available (+$24/yr)",
    ],
    stripePriceId: null,
    domainIncluded: false,
    domainAddonAvailable: true,
  },
  {
    id: "tier1a",
    name: "Tier 1a — Hands-Off Website",
    description: "Website + automatic maintenance. Tell us your schedule once and the AI keeps everything current — including social media.",
    price: 59,
    features: [
      "Everything in Tier 1",
      "Autonomous content updates",
      "Social media posting (Facebook, Instagram, X)",
      "Recurring schedule management",
      "No interaction required",
      "1 free custom domain included",
    ],
    stripePriceId: null,
    highlight: true,
    domainIncluded: true,
    domainAddonAvailable: false,
  },
  {
    id: "tier2",
    name: "Tier 2 — Website + Events",
    description: "Website + event dashboard. Manage events, track ticket sales, handle approvals and communications.",
    price: 99,
    features: [
      "Everything in Tier 1",
      "Event creation & management",
      "Ticket sales tracking",
      "Attendee communications",
      "Approval workflows",
      "Event metrics dashboard",
      "1 free custom domain included",
    ],
    stripePriceId: null,
    domainIncluded: true,
    domainAddonAvailable: false,
  },
  {
    id: "tier3",
    name: "Tier 3 — Fully Autonomous",
    description: "Complete hands-off operation. The AI runs your website, events, and social media. You only check in if you want to.",
    price: 149,
    features: [
      "Everything in Tier 2",
      "Fully autonomous event scheduling",
      "AI-generated social content",
      "Autonomous website updates",
      "Priority support",
      "1 free custom domain included",
    ],
    stripePriceId: null,
    domainIncluded: true,
    domainAddonAvailable: false,
  },
];

export function getTierById(tierId: string): TierDefinition | undefined {
  return TIERS.find((t) => t.id === tierId);
}
