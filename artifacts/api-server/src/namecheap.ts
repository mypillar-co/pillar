// Namecheap Reseller API integration
// Docs: https://www.namecheap.com/support/api/methods/

const NC_API_URL = "https://api.namecheap.com/xml.response";
const NC_SANDBOX_URL = "https://api.sandbox.namecheap.com/xml.response";

function getBaseUrl() {
  return process.env.NAMECHEAP_SANDBOX === "true" ? NC_SANDBOX_URL : NC_API_URL;
}

function getCredentials() {
  return {
    ApiUser: process.env.NAMECHEAP_USERNAME ?? "",
    ApiKey: process.env.NAMECHEAP_API_KEY ?? "",
    UserName: process.env.NAMECHEAP_USERNAME ?? "",
    ClientIp: process.env.NAMECHEAP_CLIENT_IP ?? "127.0.0.1",
  };
}

export function isConfigured(): boolean {
  return !!(process.env.NAMECHEAP_API_KEY && process.env.NAMECHEAP_USERNAME);
}

function parseXmlValue(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function parseXmlAttr(xml: string, tag: string, attr: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i"));
  return match?.[1]?.trim() ?? "";
}

async function callApi(params: Record<string, string>): Promise<string> {
  const creds = getCredentials();
  const qs = new URLSearchParams({ ...creds, ...params }).toString();
  const res = await fetch(`${getBaseUrl()}?${qs}`);
  if (!res.ok) throw new Error(`Namecheap HTTP ${res.status}`);
  return res.text();
}

export interface AvailabilityResult {
  domain: string;
  available: boolean;
  isPremium: boolean;
  price?: number;
}

export async function checkAvailability(domain: string): Promise<AvailabilityResult> {
  if (!isConfigured()) {
    return fallbackDnsCheck(domain);
  }
  try {
    const xml = await callApi({ Command: "namecheap.domains.check", DomainList: domain });
    const isAvailable = parseXmlAttr(xml, "Domain", "Available").toLowerCase() === "true";
    const isPremium = parseXmlAttr(xml, "Domain", "IsPremiumName").toLowerCase() === "true";
    return { domain, available: isAvailable, isPremium };
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
    return { success: false, error: "Registrar not configured — domain queued for manual registration" };
  }

  const [sld, ...tldParts] = domain.split(".");
  const tld = tldParts.join(".");

  const registrantContact = {
    RegistrantFirstName: contactInfo.firstName || "Admin",
    RegistrantLastName: contactInfo.lastName || "User",
    RegistrantEmailAddress: contactInfo.email,
    RegistrantPhone: "+1.5555555555",
    RegistrantOrganizationName: contactInfo.orgName ?? "",
    RegistrantAddress1: "123 Main St",
    RegistrantCity: "Anytown",
    RegistrantStateProvince: "CA",
    RegistrantPostalCode: "90210",
    RegistrantCountry: "US",
  };

  const techAdmin = {
    TechFirstName: registrantContact.RegistrantFirstName,
    TechLastName: registrantContact.RegistrantLastName,
    TechEmailAddress: registrantContact.RegistrantEmailAddress,
    TechPhone: registrantContact.RegistrantPhone,
    TechAddress1: registrantContact.RegistrantAddress1,
    TechCity: registrantContact.RegistrantCity,
    TechStateProvince: registrantContact.RegistrantStateProvince,
    TechPostalCode: registrantContact.RegistrantPostalCode,
    TechCountry: registrantContact.RegistrantCountry,
    AdminFirstName: registrantContact.RegistrantFirstName,
    AdminLastName: registrantContact.RegistrantLastName,
    AdminEmailAddress: registrantContact.RegistrantEmailAddress,
    AdminPhone: registrantContact.RegistrantPhone,
    AdminAddress1: registrantContact.RegistrantAddress1,
    AdminCity: registrantContact.RegistrantCity,
    AdminStateProvince: registrantContact.RegistrantStateProvince,
    AdminPostalCode: registrantContact.RegistrantPostalCode,
    AdminCountry: registrantContact.RegistrantCountry,
    AuxBillingFirstName: registrantContact.RegistrantFirstName,
    AuxBillingLastName: registrantContact.RegistrantLastName,
    AuxBillingEmailAddress: registrantContact.RegistrantEmailAddress,
    AuxBillingPhone: registrantContact.RegistrantPhone,
    AuxBillingAddress1: registrantContact.RegistrantAddress1,
    AuxBillingCity: registrantContact.RegistrantCity,
    AuxBillingStateProvince: registrantContact.RegistrantStateProvince,
    AuxBillingPostalCode: registrantContact.RegistrantPostalCode,
    AuxBillingCountry: registrantContact.RegistrantCountry,
  };

  try {
    const xml = await callApi({
      Command: "namecheap.domains.create",
      DomainName: sld,
      TLD: tld,
      Years: "1",
      AddFreeWhoisguard: "yes",
      WGEnabled: "yes",
      ...registrantContact,
      ...techAdmin,
    });

    const status = parseXmlAttr(xml, "DomainCreateResult", "Registered");
    if (status.toLowerCase() === "true") {
      const orderId = parseXmlAttr(xml, "DomainCreateResult", "OrderID");
      return { success: true, registrarRef: orderId };
    }

    const errMsg = parseXmlValue(xml, "Error");
    return { success: false, error: errMsg || "Registration failed" };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Tier 1 domain add-on price (cents)
export const DOMAIN_ADDON_PRICE_CENTS = 2400; // $24/year
export const DOMAIN_ADDON_LABEL = "Custom Domain — 1 Year";
// Tiers that get a free domain
export const FREE_DOMAIN_TIERS = new Set(["tier1a", "tier2", "tier3"]);
