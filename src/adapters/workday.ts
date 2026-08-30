import {
  HTTP_429_MAX_RETRIES,
  HTTP_429_RETRY_AFTER_CAP_MS,
  REQUEST_TIMEOUT_MS,
} from "../constants.js";
import { normalizeTitle } from "../matcher.js";
import { stripJobHtml } from "../text.js";
import type { FetchLike, Job, WorkdayCompany } from "../types.js";

export const WORKDAY_PAGE_SIZE = 20;

const SWE_ROLE_PHRASES = [
  "software engineer",
  "software engineering",
  "ai engineer",
  "swe",
] as const;

type WorkdayListItem = {
  title?: string;
  locationsText?: string;
  externalPath?: string;
  externalUrl?: string;
  bulletFields?: string[];
  jobReqId?: string;
  department?: string;
};

type WorkdayListResponse = {
  jobPostings?: WorkdayListItem[];
  total?: number;
};

type WorkdayDetailResponse = {
  jobDescription?: string;
};

function hasPhrase(normalized: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(normalized);
}

function titleHasSweRole(title: string): boolean {
  const normalized = normalizeTitle(title);
  return SWE_ROLE_PHRASES.some((phrase) => hasPhrase(normalized, phrase));
}

function workdayBase(company: WorkdayCompany): string {
  return `https://${company.workday.host}/wday/cxs/${company.workday.tenant}/${company.workday.site}`;
}

function workdayJobId(item: WorkdayListItem): string {
  if (item.jobReqId) {
    return String(item.jobReqId);
  }
  if (Array.isArray(item.bulletFields) && item.bulletFields[0]) {
    return String(item.bulletFields[0]);
  }
  const path = item.externalPath ?? "";
  const suffix = path.split("_").pop();
  if (suffix) {
    return suffix;
  }
  throw new Error("Workday job missing stable id");
}

function inferDepartments(item: WorkdayListItem): string[] {
  if (typeof item.department === "string" && item.department.trim()) {
    return [item.department];
  }
  const title = item.title ?? "";
  if (titleHasSweRole(title)) {
    return ["Engineering"];
  }
  return [];
}

function absoluteUrl(company: WorkdayCompany, item: WorkdayListItem): string | null {
  if (typeof item.externalUrl === "string" && /^https:\/\//i.test(item.externalUrl)) {
    return item.externalUrl.trim();
  }
  if (typeof item.externalPath === "string" && item.externalPath.startsWith("/")) {
    return `https://${company.workday.host}/${company.workday.site}${item.externalPath}`;
  }
  return null;
}

export function workdayDetailPath(
  company: WorkdayCompany,
  job: Job,
): string | null {
  const prefix = `/${company.workday.site}`;
  const pathname = new URL(job.absoluteUrl).pathname;
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  return pathname.slice(prefix.length);
}

export function mapWorkdayListItem(
  company: WorkdayCompany,
  item: WorkdayListItem,
): Job | null {
  const url = absoluteUrl(company, item);
  if (!url) {
    return null;
  }
  return {
    id: workdayJobId(item),
    title: typeof item.title === "string" ? item.title : "",
    location: typeof item.locationsText === "string" ? item.locationsText : "",
    departments: inferDepartments(item),
    careerSiteCategory: null,
    absoluteUrl: url,
    content: "",
  };
}

async function fetchWith429Retries(
  input: string,
  init: RequestInit,
  fetchImpl: FetchLike,
  label: string,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    let response: Response;
    try {
      response = await fetchImpl(input, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`${label} request failed: ${(err as Error).message}`);
    }
    if (response.status === 403 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      attempt += 1;
      continue;
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

export async function fetchWorkdayList(
  company: WorkdayCompany,
  fetchImpl: FetchLike = fetch,
): Promise<WorkdayListItem[]> {
  if (WORKDAY_PAGE_SIZE > 20) {
    throw new Error("Workday list limit must be <= 20");
  }
  const base = workdayBase(company);
  const postings: WorkdayListItem[] = [];
  let offset = 0;

  for (;;) {
    const response = await fetchWith429Retries(
      `${base}/jobs`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept-language": "en-US",
        },
        body: JSON.stringify({
          appliedFacets: {},
          limit: WORKDAY_PAGE_SIZE,
          offset,
          searchText: "",
        }),
      },
      fetchImpl,
      "Workday list",
    );
    if (!response.ok) {
      throw new Error(`Workday HTTP ${response.status}`);
    }
    let body: WorkdayListResponse;
    try {
      body = (await response.json()) as WorkdayListResponse;
    } catch (err) {
      throw new Error(`Workday list request failed: ${(err as Error).message}`);
    }
    if (!Array.isArray(body.jobPostings)) {
      throw new Error("Workday list response missing jobPostings");
    }
    if (body.jobPostings.length === 0) {
      break;
    }
    postings.push(...body.jobPostings);
    offset += WORKDAY_PAGE_SIZE;
  }

  return postings;
}

export async function listWorkdayJobs(
  company: WorkdayCompany,
  fetchImpl: FetchLike = fetch,
): Promise<Job[]> {
  const postings = await fetchWorkdayList(company, fetchImpl);
  return postings
    .map((item) => mapWorkdayListItem(company, item))
    .filter((job): job is Job => job !== null);
}

export async function hydrateWorkdayContent(
  company: WorkdayCompany,
  fetchImpl: FetchLike,
  jobs: Job[],
): Promise<Job[]> {
  const base = workdayBase(company);
  const hydrated: Job[] = [];

  for (const job of jobs) {
    const detailPath = workdayDetailPath(company, job);
    if (!detailPath) {
      hydrated.push(job);
      continue;
    }
    try {
      const response = await fetchWith429Retries(
        `${base}${detailPath}`,
        {
          method: "GET",
          headers: { accept: "application/json" },
        },
        fetchImpl,
        "Workday detail",
      );
      if (!response.ok) {
        hydrated.push(job);
        continue;
      }
      const body = (await response.json()) as WorkdayDetailResponse;
      const content = body.jobDescription
        ? stripJobHtml(body.jobDescription)
        : job.content;
      hydrated.push({ ...job, content });
    } catch {
      hydrated.push(job);
    }
  }

  return hydrated;
}
