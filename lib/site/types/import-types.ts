export interface RankedImage {
  url: string;
  score: number;
  role: "hero" | "logo" | "gallery" | "program" | "unknown";
  width?: number;
  height?: number;
}

export interface ImportFinding {
  findingType: string;
  sourceUrl?: string;
  pageClassification?: string;
  title?: string;
  contentJson: Record<string, unknown>;
  qualityScore: number;
  preserveVerbatim: boolean;
  isSelected: boolean;
}

export interface ImportRunSummary {
  importRunId: string;
  status: string;
  sourceUrl: string;
  detectedSiteType?: string;
  findings: ImportFinding[];
  rankedImages: RankedImage[];
  recommendedStructure?: Record<string, unknown>;
}
