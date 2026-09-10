import type { CompanyConfig, FetchLike, Job, PortalAtsKind } from "../types.js";

export type { PortalAtsKind } from "../types.js";

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
