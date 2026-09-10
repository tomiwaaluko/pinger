import { stripJobHtml } from "../text.js";
import type { FetchLike, Job } from "../types.js";
import { fetchWith429Retries } from "./fetch-retry.js";

const AMAZON_SEARCH_URL = "https://www.amazon.jobs/en/search.json";
const AMAZON_PAGE_SIZE = 100;
const AMAZON_MAX_PAGES = 10;

type AmazonJob = {
  id?: unknown;
  title?: unknown;
  normalized_location?: unknown;
  location?: unknown;
  locations?: unknown;
  job_path?: unknown;
  description?: unknown;
  basic_qualifications?: unknown;
  preferred_qualifications?: unknown;
  job_category?: unknown;
  job_family?: unknown;
  business_category?: unknown;
  team?: unknown;
};

type AmazonSearchResponse = {
  jobs?: AmazonJob[];
};

function amazonSearchUrl(offset: number): string {
  const params = new URLSearchParams({
    offset: String(offset),
    result_limit: String(AMAZON_PAGE_SIZE),
    sort: "relevant",
    base_query: "software engineer",
  });
  return `${AMAZON_SEARCH_URL}?${params.toString()}`;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function amazonLocation(raw: AmazonJob): string {
  const locations = Array.isArray(raw.locations)
    ? raw.locations.map(stringField).filter(Boolean)
    : [];
  return (
    stringField(raw.normalized_location) ||
    locations.join("; ") ||
    stringField(raw.location)
  );
}

function amazonDepartments(raw: AmazonJob): string[] {
  const departments = [
    raw.job_category,
    raw.job_family,
    raw.business_category,
    raw.team,
  ]
    .map(stringField)
    .filter(Boolean);
  if (departments.some((dept) => /software|engineering|aws/i.test(dept))) {
    return ["Engineering"];
  }
  return departments;
}

export function mapAmazonJob(raw: AmazonJob): Job | null {
  const id = stringField(raw.id);
  if (!id) {
    console.error("Dropping Amazon job with invalid id");
    return null;
  }
  const title = stringField(raw.title);
  if (!title) {
    console.error(`Dropping Amazon job id=${id} with invalid title`);
    return null;
  }
  const path = stringField(raw.job_path);
  const absoluteUrl = path.startsWith("/")
    ? `https://www.amazon.jobs${path}`
    : path;
  if (!/^https:\/\//i.test(absoluteUrl)) {
    console.error(`Dropping Amazon job id=${id} with invalid absoluteUrl`);
    return null;
  }
  const content = [
    raw.description,
    raw.basic_qualifications,
    raw.preferred_qualifications,
  ]
    .map(stringField)
    .filter(Boolean)
    .map(stripJobHtml)
    .join("\n\n");
  return {
    id,
    title,
    location: amazonLocation(raw),
    careerSiteCategory: null,
    departments: amazonDepartments(raw),
    absoluteUrl,
    content,
  };
}

export async function listAmazonJobs(
  _company: unknown,
  fetchImpl: FetchLike = fetch,
): Promise<Job[]> {
  const mapped: Job[] = [];
  for (let page = 0; page < AMAZON_MAX_PAGES; page += 1) {
    const response = await fetchWith429Retries(
      amazonSearchUrl(page * AMAZON_PAGE_SIZE),
      {
        fetchImpl,
        label: "Amazon",
        init: {
          headers: { accept: "application/json" },
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Amazon HTTP ${response.status}`);
    }
    const body = (await response.json()) as AmazonSearchResponse;
    const jobs = Array.isArray(body.jobs) ? body.jobs : [];
    mapped.push(
      ...jobs
        .map((job) => mapAmazonJob(job))
        .filter((job): job is Job => job !== null),
    );
    if (jobs.length < AMAZON_PAGE_SIZE) {
      break;
    }
  }
  return mapped;
}
