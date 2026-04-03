const COOKIE_PATTERNS = [
  /cookie/i,
  /privacy policy/i,
  /we use cookies/i,
  /gdpr/i,
  /accept all/i,
  /terms of service/i,
  /terms and conditions/i,
];

const FOOTER_PATTERNS = [
  /all rights reserved/i,
  /copyright \d{4}/i,
  /powered by/i,
  /site by/i,
  /web design by/i,
];

const JUNK_PATTERNS = [
  /^[A-Z\s]{10,}$/, // all-caps junk lines
  /^\s*[\d\s\-\|\/\\]+\s*$/, // number-only lines
];

export function filterImportNoise(text: string): string {
  const lines = text.split("\n");

  const filtered = lines.filter(line => {
    const trimmed = line.trim();

    if (trimmed.length < 3) return false;
    if (trimmed.length > 500 && !trimmed.includes(" ")) return false;

    for (const pattern of COOKIE_PATTERNS) {
      if (pattern.test(trimmed)) return false;
    }

    for (const pattern of FOOTER_PATTERNS) {
      if (pattern.test(trimmed)) return false;
    }

    for (const pattern of JUNK_PATTERNS) {
      if (pattern.test(trimmed)) return false;
    }

    return true;
  });

  return filtered
    .join("\n")
    .replace(/(\n){3,}/g, "\n\n")
    .trim();
}
