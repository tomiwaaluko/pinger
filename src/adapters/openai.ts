import type { AshbyCompany, FetchLike, Job } from "../types.js";
import { listAshbyJobs } from "./ashby.js";

const OPENAI_ASHBY_COMPANY: AshbyCompany = {
  id: "openai",
  name: "OpenAI",
  ats: "ashby",
  boardName: "openai",
  enabled: true,
  domain: "openai.com",
};

export async function listOpenAiJobs(
  _company: unknown,
  fetchImpl: FetchLike = fetch,
): Promise<Job[]> {
  return listAshbyJobs(OPENAI_ASHBY_COMPANY, fetchImpl);
}
