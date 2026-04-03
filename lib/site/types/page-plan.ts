import type { BlockType, VariantKey, LockLevel, SourceMode, UpdatePolicy, PageType } from "./block-types.js";

export interface BindingSpec {
  bindingType: string;
  sourceType: string;
  queryConfigJson: Record<string, unknown>;
  displayConfigJson?: Record<string, unknown>;
  updatePolicy: UpdatePolicy;
}

export interface PlannedBlock {
  id: string;
  blockType: BlockType;
  variantKey: VariantKey;
  title?: string;
  sortOrder: number;
  lockLevel: LockLevel;
  sourceMode: SourceMode;
  contentJson?: Record<string, unknown>;
  settingsJson?: Record<string, unknown>;
  bindingSpec?: BindingSpec;
}

export interface PlannedPage {
  id: string;
  title: string;
  slug: string;
  pageType: PageType;
  isHomepage: boolean;
  sortOrder: number;
  blocks: PlannedBlock[];
}

export interface PagePlan {
  orgId: string;
  siteId: string;
  strategy: string;
  pages: PlannedPage[];
  navItems: Array<{
    label: string;
    slug: string;
    navLocation: "header" | "footer" | "both";
    sortOrder: number;
  }>;
}
