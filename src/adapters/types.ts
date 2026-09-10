import type { CompanyConfig, FetchLike, Job } from "../types.js";

export type PortalAtsKind =
  | "google"
  | "meta"
  | "microsoft"
  | "amazon"
  | "apple"
  | "nvidia"
  | "openai";

export type AtsKind = "greenhouse" | "ashby" | "workday" | PortalAtsKind;

export type AtsAdapter = {
  ats: AtsKind;
  listJobs(company: CompanyConfig, fetch: FetchLike): Promise<Job[]>;
  hydrateContent?(
    company: CompanyConfig,
    fetch: FetchLike,
    jobs: Job[],
  ): Promise<Job[]>;
};
