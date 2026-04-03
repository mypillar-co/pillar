export type JobType =
  | "compile_site"
  | "update_block"
  | "recompute_metrics"
  | "run_auto_update"
  | "import_site"
  | "generate_site";

export interface CompileSitePayload {
  siteId: string;
  mode?: "full_compile" | "block_compile" | "page_compile";
}

export interface UpdateBlockPayload {
  blockId: string;
  siteId: string;
}

export interface RecomputeMetricsPayload {
  eventId: string;
}

export interface RunAutoUpdatePayload {
  siteId: string;
}

export interface ImportSitePayload {
  url: string;
  siteId?: string;
}

export interface GenerateSitePayload {
  interviewBody?: string;
  importRunId?: string;
}

export type JobPayload =
  | CompileSitePayload
  | UpdateBlockPayload
  | RecomputeMetricsPayload
  | RunAutoUpdatePayload
  | ImportSitePayload
  | GenerateSitePayload;
