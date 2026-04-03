export type ImageRichness = "none" | "low" | "medium" | "high";
export type MissionStrength = "none" | "weak" | "strong";

export interface AiContentSignals {
  eventHeavy: boolean;
  strongMission: boolean;
  membershipDriven: boolean;
  imageRich: boolean;
  minimalContent: boolean;
}

export interface LayoutSignals {
  eventCount: number;
  sponsorCount: number;
  programCount: number;
  imageRichness: ImageRichness;
  missionStrength: MissionStrength;
  membershipPresence: boolean;
  ctaType: string;
  importHasHeroImage: boolean;
  importHasStrongMission: boolean;
  importEventHeavy: boolean;
  aiSignals: AiContentSignals;
}

export type LayoutStrategy =
  | "event-driven"
  | "program-driven"
  | "membership-driven"
  | "visual-first"
  | "minimal"
  | "balanced";
