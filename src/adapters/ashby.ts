import { fetchWith429Retries } from "./fetch-retry.js";
import { stripJobHtml } from "../text.js";
import type { AshbyCompany, FetchLike, Job } from "../types.js";

const ASHBY_API = "https://api.ashbyhq.com/posting-api/job-board";

export type AshbyPosting = {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  department?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  isListed?: boolean;
};

function ashbyId(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  return null;
}

function formatLocation(raw: AshbyPosting): string {
  const parts = [raw.location];
  if (Array.isArray(raw.secondaryLocations)) {
    for (const entry of raw.secondaryLocations) {
      if (typeof entry?.location === "string" && entry.location.trim()) {
        parts.push(entry.location);
      }
    }
  }
  return parts.filter((part): part is string => Boolean(part?.trim())).join("; ");
}

export function mapAshbyJob(raw: AshbyPosting): Job | null {
  if (raw.isListed === false) {
    return null;
  }
  const id = ashbyId(raw.id);
  if (!id) {
    console.error("Dropping Ashby job with invalid id");
    return null;
  }
  if (typeof raw.title !== "string" || !raw.title.trim()) {
    console.error(`Dropping Ashby job id=${id} with invalid title`);
    return null;
  }
  const url = raw.jobUrl ?? raw.applyUrl;
  if (typeof url !== "string" || !/^https:\/\//i.test(url.trim())) {
    console.error(`Dropping Ashby job id=${id} with invalid absolute_url`);
    return null;
  }
  const content =
    raw.descriptionPlain?.trim() ||
    (raw.descriptionHtml ? stripJobHtml(raw.descriptionHtml) : "");
  return {
    id,
    title: raw.title,
    location: formatLocation(raw),
    departments: raw.department ? [raw.department] : [],
    careerSiteCategory: null,
    absoluteUrl: url.trim(),
    content,
  };
}

export async function listAshbyJobs(
  company: AshbyCompany,
  fetchImpl: FetchLike = fetch,
): Promise<Job[]> {
  const url = `${ASHBY_API}/${encodeURIComponent(company.boardName)}`;
  const response = await fetchWith429Retries(url, {
    fetchImpl,
    label: "Ashby",
  });
  if (!response.ok) {
    throw new Error(`Ashby HTTP ${response.status}`);
  }
  let body: { jobs?: AshbyPosting[] };
  try {
    body = (await response.json()) as { jobs?: AshbyPosting[] };
  } catch (err) {
    throw new Error(`Ashby request failed: ${(err as Error).message}`);
  }
  const postings = Array.isArray(body.jobs) ? body.jobs : [];
  return postings
    .map((posting) => mapAshbyJob(posting))
    .filter((job): job is Job => job !== null);
}
