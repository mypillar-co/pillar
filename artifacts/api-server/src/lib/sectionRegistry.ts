export interface SectionDefinition {
  type: string;
  label: string;
  description: string;
  example: Record<string, unknown>;
}

export const SECTION_REGISTRY: Record<string, SectionDefinition> = {
  leadership: {
    type: "leadership",
    label: "Board of Directors / Leadership",
    description: "Displays org officers and board members with name, title, and optional photo",
    example: {
      type: "leadership",
      title: "Our Leadership Team",
      members: [
        { name: "Jane Smith", title: "President", email: "jane@example.org", photoUrl: null },
        { name: "Bob Jones", title: "Treasurer", email: "bob@example.org", photoUrl: null },
      ],
    },
  },
  gallery: {
    type: "gallery",
    label: "Photo Gallery",
    description: "Grid of photos from events or org activities",
    example: {
      type: "gallery",
      title: "Event Photos",
      photos: [
        { url: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800", caption: "Annual Gala 2024" },
      ],
    },
  },
  documents: {
    type: "documents",
    label: "Documents and Resources",
    description: "Downloadable files like bylaws, meeting minutes, annual reports, and forms",
    example: {
      type: "documents",
      title: "Resources",
      documents: [
        { name: "2024 Annual Report", url: "https://example.org/report.pdf", description: "Year in review", category: "Reports" },
      ],
    },
  },
  sponsors_showcase: {
    type: "sponsors_showcase",
    label: "Sponsors Showcase",
    description: "Public-facing display of sponsors with logos and links",
    example: {
      type: "sponsors_showcase",
      title: "Our Sponsors",
      sponsors: [
        { name: "Acme Corp", logoUrl: null, website: "https://acme.com", tier: "Gold" },
      ],
    },
  },
  history: {
    type: "history",
    label: "Our History",
    description: "Timeline or narrative of the organization founding and milestones",
    example: {
      type: "history",
      title: "Our History",
      foundedYear: "1952",
      narrative: "Founded in 1952 by dedicated community leaders.",
      milestones: [{ year: "1952", event: "Organization founded" }],
    },
  },
  volunteer_opportunities: {
    type: "volunteer_opportunities",
    label: "Volunteer Opportunities",
    description: "List of current volunteer needs and how to get involved",
    example: {
      type: "volunteer_opportunities",
      title: "Get Involved",
      intro: "We are always looking for passionate community members.",
      opportunities: [
        { title: "Event Volunteer", description: "Help run our annual fundraiser", commitment: "1 weekend/year", contact: "events@example.org" },
      ],
    },
  },
};

export function getSectionRegistryPrompt(): string {
  const blocks = Object.values(SECTION_REGISTRY).map(
    (s) => `TYPE: "${s.type}" — ${s.label}\n${s.description}\nExample:\n${JSON.stringify(s.example, null, 2)}`,
  );
  return `AVAILABLE SECTION TYPES — you can add any of these to the site by including them in the sections array of the config:\n\n${blocks.join("\n\n")}\n\nWhen adding a new section append it to the existing sections array in the config. Never remove existing sections unless explicitly asked. Always use the exact type string shown above.`;
}

export function validateSection(section: Record<string, unknown>): boolean {
  return typeof section.type === "string" && section.type in SECTION_REGISTRY;
}
