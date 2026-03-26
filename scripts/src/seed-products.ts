/**
 * Seed Steward subscription products and prices in Stripe.
 * 
 * This is idempotent — safe to run multiple times.
 * Run with: pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
 */
import { getUncachableStripeClient } from "./stripeClient";

const TIERS = [
  {
    id: "tier1",
    name: "Steward Tier 1 — Website",
    description: "AI builds your website. You interact with the AI to request any changes.",
    price: 2900, // $29.00
  },
  {
    id: "tier1a",
    name: "Steward Tier 1a — Hands-Off Website",
    description: "Website + automatic maintenance and social media, fully autonomous.",
    price: 5900, // $59.00
  },
  {
    id: "tier2",
    name: "Steward Tier 2 — Website + Events",
    description: "Website + event dashboard with ticket sales, approvals, and communications.",
    price: 9900, // $99.00
  },
  {
    id: "tier3",
    name: "Steward Tier 3 — Fully Autonomous",
    description: "Complete hands-off: AI manages your website, events, and social media.",
    price: 14900, // $149.00
  },
];

async function seedProducts() {
  try {
    const stripe = await getUncachableStripeClient();
    console.log("Seeding Steward subscription products in Stripe...\n");

    for (const tier of TIERS) {
      // Check if product already exists
      const existing = await stripe.products.search({
        query: `metadata['tierId']:'${tier.id}'`,
      });

      if (existing.data.length > 0) {
        const product = existing.data[0];
        console.log(`✓ ${tier.name} already exists (${product.id})`);

        // Check if price exists
        const prices = await stripe.prices.list({ product: product.id, active: true });
        if (prices.data.length > 0) {
          console.log(`  Price: $${tier.price / 100}/month (${prices.data[0].id})`);
        } else {
          const price = await stripe.prices.create({
            product: product.id,
            unit_amount: tier.price,
            currency: "usd",
            recurring: { interval: "month" },
            metadata: { tierId: tier.id },
          });
          console.log(`  Created price: $${tier.price / 100}/month (${price.id})`);
        }
        continue;
      }

      // Create product
      const product = await stripe.products.create({
        name: tier.name,
        description: tier.description,
        metadata: { tierId: tier.id },
      });
      console.log(`Created: ${tier.name} (${product.id})`);

      // Create monthly price
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: tier.price,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { tierId: tier.id },
      });
      console.log(`  Price: $${tier.price / 100}/month (${price.id})`);
    }

    console.log("\n✅ Steward products seeded successfully!");
    console.log("Webhooks will sync this data to your database automatically.");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error seeding products:", msg);
    process.exit(1);
  }
}

seedProducts();
