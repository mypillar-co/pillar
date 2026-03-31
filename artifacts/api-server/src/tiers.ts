export interface TierDefinition {
  id: string;
  name: string;
  description: string;
  price: number;
  annualPrice: number;
  features: string[];
  stripePriceId: string | null;
  highlight?: boolean;
  domainIncluded: boolean;
  domainAddonAvailable: boolean;
}

export const TIERS: TierDefinition[] = [
  {
    id: "tier1",
    name: "Starter",
    description: "Your AI-built website, live in minutes. Chat to update anytime.",
    price: 29,
    annualPrice: 24,
    features: [
      "AI-generated website in under 10 minutes",
      "Chat-based updates anytime",
      "Subdomain hosting (yourorg.mypillar.co)",
      "Mobile-responsive design",
      "SEO fundamentals included",
      "500 MB media storage",
      "Custom domain add-on (+$24/yr)",
    ],
    stripePriceId: null,
    domainIncluded: false,
    domainAddonAvailable: true,
  },
  {
    id: "tier1a",
    name: "Autopilot",
    description: "Set it and forget it. Your website and social media stay current without you lifting a finger.",
    price: 59,
    annualPrice: 49,
    features: [
      "Everything in Starter",
      "Autonomous content updates",
      "Social media posting (Facebook, Instagram, X)",
      "Recurring schedule management",
      "Zero maintenance required",
      "2 GB media storage",
      "1 free custom domain included",
    ],
    stripePriceId: null,
    highlight: true,
    domainIncluded: true,
    domainAddonAvailable: false,
  },
  {
    id: "tier2",
    name: "Events",
    description: "Run events, sell tickets, and manage attendees alongside your autonomous website.",
    price: 99,
    annualPrice: 84,
    features: [
      "Everything in Autopilot",
      "Event creation & management",
      "Online ticket sales & collection",
      "Attendee communications",
      "Approval workflows",
      "Event metrics & revenue dashboard",
      "5 GB media storage",
      "1 free custom domain included",
      "2.5% platform fee on ticket revenue",
    ],
    stripePriceId: null,
    domainIncluded: true,
    domainAddonAvailable: false,
  },
  {
    id: "tier3",
    name: "Total Operations",
    description: "The full digital agency experience. AI runs your website, events, and social media end to end.",
    price: 149,
    annualPrice: 124,
    features: [
      "Everything in Events",
      "Fully autonomous event scheduling",
      "AI-generated social content calendar",
      "Autonomous website refreshes",
      "Priority support",
      "10 GB media storage",
      "1 free custom domain included",
      "2.5% platform fee on ticket revenue",
    ],
    stripePriceId: null,
    domainIncluded: true,
    domainAddonAvailable: false,
  },
];

export function getTierById(tierId: string): TierDefinition | undefined {
  return TIERS.find((t) => t.id === tierId);
}
