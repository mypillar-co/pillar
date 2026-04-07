interface ContentHookConfig {
  pillarWebhookUrl?: string;
  orgName: string;
  orgWebsite?: string;
}

interface Strategy {
  priority: "urgent" | "high" | "normal" | "low";
  category: "announcement" | "promotion" | "update" | "milestone" | "recognition" | "internal";
  suggestedPlatforms: string[];
  postImmediately: boolean;
  suggestedTone: string;
  includeImage: boolean;
  includeLink: boolean;
  threadWorthy: boolean;
  cadenceKey: string | null;
  cadenceLimitPerDay: number | null;
}

function fireHook(config: ContentHookConfig, event: string, strategy: Strategy, data: Record<string, unknown>) {
  if (!config.pillarWebhookUrl) return;
  const payload = {
    event,
    orgName: config.orgName,
    orgWebsite: config.orgWebsite || "",
    timestamp: new Date().toISOString(),
    strategy,
    data,
  };
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 5000);
  fetch(config.pillarWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Content-Hook": event,
      "X-Content-Priority": strategy.priority,
      "X-Content-Category": strategy.category,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  }).catch(() => {});
}

export function createContentHook(config: ContentHookConfig) {
  return {
    eventActivated(event: { title: string; slug: string; date: string; time: string; location: string; category: string; description: string; isTicketed: boolean; ticketPrice?: string | null }) {
      fireHook(config, "event.activated", {
        priority: "high", category: "announcement",
        suggestedPlatforms: ["x", "facebook", "instagram"],
        postImmediately: false, suggestedTone: "exciting, inviting",
        includeImage: true, includeLink: true, threadWorthy: false,
        cadenceKey: null, cadenceLimitPerDay: null,
      }, event);
    },
    eventUpdated(event: { title: string; slug: string; date: string; time: string; location: string }, changedFields: string[]) {
      const dateOrTimeChanged = changedFields.includes("date") || changedFields.includes("time");
      fireHook(config, "event.updated", {
        priority: dateOrTimeChanged ? "high" : "normal",
        category: "update",
        suggestedPlatforms: ["x", "facebook"],
        postImmediately: dateOrTimeChanged,
        suggestedTone: "informative, urgent",
        includeImage: false, includeLink: true, threadWorthy: false,
        cadenceKey: null, cadenceLimitPerDay: null,
      }, { ...event, changedFields });
    },
    ticketSalesOpened(event: { title: string; slug: string; date: string; ticketPrice: string | null; ticketCapacity: number | null }) {
      fireHook(config, "ticket_sales.opened", {
        priority: "high", category: "announcement",
        suggestedPlatforms: ["x", "facebook", "instagram"],
        postImmediately: false, suggestedTone: "exciting, promotional",
        includeImage: true, includeLink: true, threadWorthy: false,
        cadenceKey: null, cadenceLimitPerDay: null,
      }, event);
    },
    ticketPurchased(event: { title: string; slug: string; date: string }, totalSold: number, capacity: number | null | undefined) {
      const milestones = [10, 25, 50, 75, 100, 150, 200, 250, 500];
      const pct = capacity ? (totalSold / capacity) * 100 : 0;
      if (milestones.includes(totalSold)) {
        const priority = pct >= 80 ? "high" : "normal";
        fireHook(config, "ticket_sales.milestone", {
          priority, category: "milestone",
          suggestedPlatforms: pct >= 80 ? ["x", "facebook", "instagram"] : ["facebook"],
          postImmediately: pct >= 80,
          suggestedTone: pct >= 80 ? "urgent, scarcity" : "celebratory",
          includeImage: false, includeLink: true, threadWorthy: false,
          cadenceKey: "ticket_milestone", cadenceLimitPerDay: 1,
        }, { ...event, totalSold, capacity, percentSold: pct.toFixed(0) });
      }
      if (capacity && totalSold >= capacity) {
        fireHook(config, "ticket_sales.sold_out", {
          priority: "urgent", category: "announcement",
          suggestedPlatforms: ["x", "facebook", "instagram"],
          postImmediately: true, suggestedTone: "excited, urgent",
          includeImage: false, includeLink: false, threadWorthy: false,
          cadenceKey: null, cadenceLimitPerDay: null,
        }, { ...event, totalSold, capacity });
      }
      fireHook(config, "ticket.purchased", {
        priority: "low", category: "internal",
        suggestedPlatforms: [], postImmediately: false, suggestedTone: "",
        includeImage: false, includeLink: false, threadWorthy: false,
        cadenceKey: null, cadenceLimitPerDay: null,
      }, { ...event, totalSold });
    },
    blogPublished(post: { title: string; slug: string; excerpt?: string | null; category?: string | null; author?: string | null; coverImageUrl?: string | null }) {
      const cat = (post.category || "").toLowerCase();
      const toneMap: Record<string, string> = { recap: "reflective, celebratory", spotlight: "warm, personal", "press release": "professional", announcement: "exciting" };
      const tone = toneMap[cat] || "informative, engaging";
      const threadWorthy = (post.excerpt?.length || 0) > 200;
      fireHook(config, "blog.published", {
        priority: "high", category: "announcement",
        suggestedPlatforms: ["x", "facebook", "instagram"],
        postImmediately: false, suggestedTone: tone,
        includeImage: !!post.coverImageUrl, includeLink: true, threadWorthy,
        cadenceKey: null, cadenceLimitPerDay: null,
      }, post);
    },
    vendorRegistered(reg: { businessName: string; vendorCategory: string; eventType: string }) {
      fireHook(config, "vendor.registered", {
        priority: "low", category: "internal",
        suggestedPlatforms: [], postImmediately: false, suggestedTone: "",
        includeImage: false, includeLink: false, threadWorthy: false,
        cadenceKey: null, cadenceLimitPerDay: null,
      }, reg);
    },
    sponsorAdded(sponsor: { name: string; level: string; eventType?: string }) {
      const isPremium = sponsor.level.toLowerCase().includes("presenting") || sponsor.level.toLowerCase().includes("gold");
      fireHook(config, "sponsor.added", {
        priority: isPremium ? "high" : "normal",
        category: "recognition",
        suggestedPlatforms: isPremium ? ["x", "facebook", "instagram"] : ["facebook"],
        postImmediately: false,
        suggestedTone: "grateful, professional",
        includeImage: false, includeLink: true, threadWorthy: false,
        cadenceKey: "sponsor_shoutout", cadenceLimitPerDay: 2,
      }, sponsor);
    },
  };
}
