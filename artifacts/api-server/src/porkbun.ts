// Porkbun Registrar API integration
// Docs: https://porkbun.com/api/json/v3
// Pricing: ~$9.73/yr for .com — we charge $24/yr = ~$14 margin per domain/year

const PB_API = "https://porkbun.com/api/json/v3";

function getCreds() {
  return {
    apikey: process.env.PORKBUN_API_KEY ?? "",
    secretapikey: process.env.PORKBUN_SECRET_KEY ?? "",
  };
}

export function isConfigured(): boolean {
  return !!(process.env.PORKBUN_API_KEY && process.env.PORKBUN_SECRET_KEY);
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${PB_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...getCreds(), ...body }),
  });
  if (!res.ok) throw new Error(`Porkbun HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface AvailabilityResult {
  domain: string;
  available: boolean;
  isPremium: boolean;
  price?: number;
}

interface PorkbunCheckResponse {
  status: string;
  response?: Array<{ domain: string; avail: string; premium: string; price?: string }>;
}

export async function checkAvailability(domain: string): Promise<AvailabilityResult> {
  if (!isConfigured()) {
    return fallbackDnsCheck(domain);
  }
  try {
    const data = await post<PorkbunCheckResponse>("/domain/checkAndRegister", { domain });
    const item = data.response?.[0];
    if (!item) return fallbackDnsCheck(domain);
    return {
      domain,
      available: item.avail === "yes",
      isPremium: item.premium === "1",
      price: item.price ? parseFloat(item.price) : undefined,
    };
  } catch {
    return fallbackDnsCheck(domain);
  }
}

async function fallbackDnsCheck(domain: string): Promise<AvailabilityResult> {
  try {
    const { promises: dns } = await import("dns");
    await dns.resolve(domain, "A");
    return { domain, available: false, isPremium: false };
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    const available = code === "ENOTFOUND" || code === "ENODATA";
    return { domain, available, isPremium: false };
  }
}

export interface RegisterResult {
  success: boolean;
  registrarRef?: string;
  error?: string;
}

interface PorkbunCreateResponse {
  status: string;
  orderId?: string;
  transactionId?: string;
  message?: string;
}

export async function registerDomain(
  domain: string,
  contactInfo: {
    firstName: string;
    lastName: string;
    email: string;
    orgName?: string;
  }
): Promise<RegisterResult> {
  if (!isConfigured()) {
    return {
      success: false,
      error: "Registrar not configured — domain queued for manual registration",
    };
  }

  try {
    const data = await post<PorkbunCreateResponse>("/domain/create", {
      domain,
      years: 1,
      privacy: "1",
      whoisGuard: "1",
      firstName: contactInfo.firstName || "Admin",
      lastName: contactInfo.lastName || "User",
      email: contactInfo.email || "admin@example.com",
      phone: "+1.5555555555",
      address1: "123 Main St",
      city: "Anytown",
      state: "CA",
      zip: "90210",
      country: "US",
    });

    if (data.status === "SUCCESS") {
      return {
        success: true,
        registrarRef: data.orderId ?? data.transactionId,
      };
    }

    return { success: false, error: data.message ?? "Registration failed" };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export interface DnsRecordResult {
  success: boolean;
  recordId?: string;
  error?: string;
}

interface PorkbunDnsCreateResponse {
  status: string;
  id?: number;
  message?: string;
}

/**
 * Create a CNAME record on a Porkbun-registered domain pointing at `target`.
 * Used immediately after registration to automatically wire DNS → Steward.
 */
export async function createCnameRecord(
  domain: string,
  target: string
): Promise<DnsRecordResult> {
  if (!isConfigured()) {
    return { success: false, error: "Registrar not configured" };
  }
  try {
    const data = await post<PorkbunDnsCreateResponse>(`/dns/create/${domain}`, {
      name: "",
      type: "CNAME",
      content: target,
      ttl: "600",
    });
    if (data.status === "SUCCESS") {
      return { success: true, recordId: String(data.id ?? "") };
    }
    return { success: false, error: data.message ?? "DNS record creation failed" };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export interface RenewResult {
  success: boolean;
  newExpiry?: string;
  error?: string;
}

interface PorkbunRenewResponse {
  status: string;
  newExpiry?: string;
  message?: string;
}

/**
 * Renew an existing Porkbun-registered domain for one year.
 */
export async function renewDomain(domain: string): Promise<RenewResult> {
  if (!isConfigured()) {
    return { success: false, error: "Registrar not configured" };
  }
  try {
    const data = await post<PorkbunRenewResponse>(`/domain/renew/${domain}`, { years: 1 });
    if (data.status === "SUCCESS") {
      return { success: true, newExpiry: data.newExpiry };
    }
    return { success: false, error: data.message ?? "Renewal failed" };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Tier 1 domain add-on price (cents)
export const DOMAIN_ADDON_PRICE_CENTS = 2400; // $24/year
export const DOMAIN_ADDON_LABEL = "Custom Domain — 1 Year";
// Tiers that get a domain included at no extra charge
export const FREE_DOMAIN_TIERS = new Set(["tier1a", "tier2", "tier3"]);
