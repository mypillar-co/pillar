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
    ],
    stripePriceId: null,
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
    ],
    stripePriceId: null,
    highlight: true,
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
    ],
    stripePriceId: null,
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
      "Custom domain included",
    ],
    stripePriceId: null,
  },
];

export function getTierById(tierId: string): TierDefinition | undefined {
  return TIERS.find((t) => t.id === tierId);
}
