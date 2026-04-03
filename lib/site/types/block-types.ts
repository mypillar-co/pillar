export type BlockType =
  | "hero"
  | "intro"
  | "about"
  | "stats"
  | "cards"
  | "events_list"
  | "featured_event"
  | "sponsor_grid"
  | "faq"
  | "contact"
  | "cta_band"
  | "announcements"
  | "gallery"
  | "join"
  | "volunteer"
  | "membership"
  | "board"
  | "custom_html";

export type VariantKey = string;

export type LockLevel = "editable" | "review_required" | "locked";
export type SourceMode = "manual" | "generated" | "imported" | "dynamic" | "hybrid";
export type UpdatePolicy = "auto_apply" | "suggest_review" | "manual_only";

export type PageType =
  | "home"
  | "about"
  | "programs"
  | "events"
  | "membership"
  | "contact"
  | "faq"
  | "sponsors"
  | "vendors"
  | "join"
  | "donate"
  | "announcements"
  | "custom";

export type CompileMode = "full_compile" | "block_compile" | "page_compile";
