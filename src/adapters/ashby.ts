import {
  HTTP_429_MAX_RETRIES,
  HTTP_429_RETRY_AFTER_CAP_MS,
  REQUEST_TIMEOUT_MS,
} from "../constants.js";
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

async function fetchWith429Retries(
  url: string,
  fetchImpl: FetchLike,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`Ashby request failed: ${(err as Error).message}`);
    }
    if (response.status !== 429) {
      return response;
    }
    if (attempt >= HTTP_429_MAX_RETRIES) {
      return response;
    }
    const retryAfter = response.headers.get("retry-after");
    let waitMs = 1000 * 2 ** attempt;
    if (retryAfter) {
      const secs = Number(retryAfter);
      if (Number.isFinite(secs) && secs >= 0) {
        waitMs = Math.min(secs * 1000, HTTP_429_RETRY_AFTER_CAP_MS);
      }
    }
    await new Promise((r) => setTimeout(r, waitMs));
    attempt += 1;
  }
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
  const url = raw.jobUrl ?? raw.applyUrl;
  if (typeof url !== "string" || !/^https:\/\//i.test(url.trim())) {
    return null;
  }
  const content =
    raw.descriptionPlain?.trim() ||
    (raw.descriptionHtml ? stripJobHtml(raw.descriptionHtml) : "");
  return {
    id: String(raw.id),
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
  const response = await fetchWith429Retries(url, fetchImpl);
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
