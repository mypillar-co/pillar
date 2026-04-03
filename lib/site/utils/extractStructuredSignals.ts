export interface PageSignals {
  hasContactInfo: boolean;
  hasMission: boolean;
  hasPrograms: boolean;
  hasEvents: boolean;
  hasSponsorMention: boolean;
  hasJoinCta: boolean;
  hasDonateCta: boolean;
  extractedEmail?: string;
  extractedPhone?: string;
  extractedAddress?: string;
  programNames: string[];
  eventNames: string[];
  bodyText: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
const PHONE_RE = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const ADDRESS_RE = /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)[\.,]?\s*(?:[A-Za-z\s]+,\s*)?[A-Z]{2}\s+\d{5}/i;

export function extractStructuredSignals(text: string, pageClass: string): PageSignals {
  const lower = text.toLowerCase();

  const emails = text.match(EMAIL_RE) ?? [];
  const phones = text.match(PHONE_RE) ?? [];
  const addrMatch = text.match(ADDRESS_RE);

  const hasMission = lower.includes("mission") || lower.includes("purpose") || lower.includes("dedicated to") || lower.includes("committed to");
  const hasPrograms = lower.includes("program") || lower.includes("service") || lower.includes("activity") || lower.includes("initiative");
  const hasEvents = lower.includes("event") || lower.includes("calendar") || lower.includes("schedule") || lower.includes("upcoming");
  const hasSponsorMention = lower.includes("sponsor") || lower.includes("partner") || lower.includes("supporter");
  const hasJoinCta = lower.includes("join") || lower.includes("member") || lower.includes("sign up") || lower.includes("register");
  const hasDonateCta = lower.includes("donat") || lower.includes("give") || lower.includes("contribute") || lower.includes("support us");
  const hasContactInfo = emails.length > 0 || phones.length > 0 || !!addrMatch;

  const programNames: string[] = [];
  const eventNames: string[] = [];

  const programMatches = text.match(/(?:Program|Service|Initiative|Activity):\s*([^\n.]{5,60})/gi) ?? [];
  programMatches.forEach(m => {
    const name = m.split(":")[1]?.trim();
    if (name) programNames.push(name);
  });

  const eventMatches = text.match(/(?:Event|Workshop|Meeting|Gathering|Conference|Festival):\s*([^\n.]{5,60})/gi) ?? [];
  eventMatches.forEach(m => {
    const name = m.split(":")[1]?.trim();
    if (name) eventNames.push(name);
  });

  return {
    hasContactInfo,
    hasMission,
    hasPrograms,
    hasEvents,
    hasSponsorMention,
    hasJoinCta,
    hasDonateCta,
    extractedEmail: emails[0],
    extractedPhone: phones[0],
    extractedAddress: addrMatch?.[0],
    programNames: programNames.slice(0, 5),
    eventNames: eventNames.slice(0, 5),
    bodyText: text,
  };
}
