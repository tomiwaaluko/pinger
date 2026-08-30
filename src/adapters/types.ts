import type { CompanyConfig, FetchLike, Job } from "../types.js";

export type AtsKind = "greenhouse" | "ashby" | "workday";

export type AtsAdapter = {
  ats: AtsKind;
  listJobs(company: CompanyConfig, fetch: FetchLike): Promise<Job[]>;
  hydrateContent?(
    company: CompanyConfig,
    fetch: FetchLike,
    jobs: Job[],
  ): Promise<Job[]>;
};
