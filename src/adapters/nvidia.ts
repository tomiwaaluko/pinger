import type { FetchLike, Job, WorkdayCompany } from "../types.js";
import { hydrateWorkdayContent, listWorkdayJobs } from "./workday.js";

const NVIDIA_WORKDAY_COMPANY: WorkdayCompany = {
  id: "nvidia",
  name: "NVIDIA",
  ats: "workday",
  workday: {
    host: "nvidia.wd5.myworkdayjobs.com",
    tenant: "nvidia",
    site: "NVIDIAExternalCareerSite",
  },
  enabled: true,
  domain: "nvidia.com",
};

export async function listNvidiaJobs(
  _company: unknown,
  fetchImpl: FetchLike = fetch,
): Promise<Job[]> {
  return listWorkdayJobs(NVIDIA_WORKDAY_COMPANY, fetchImpl);
}

export async function hydrateNvidiaContent(
  _company: unknown,
  fetchImpl: FetchLike,
  jobs: Job[],
): Promise<Job[]> {
  return hydrateWorkdayContent(NVIDIA_WORKDAY_COMPANY, fetchImpl, jobs);
}
