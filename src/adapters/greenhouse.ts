import { GREENHOUSE_MAX_PAGES } from "../constants.js";
import type { FetchLike, GreenhouseCompany, Job } from "../types.js";
import { fetchWith429Retries } from "./fetch-retry.js";

const BOARDS = "https://boards-api.greenhouse.io/v1/boards";

function nextLink(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/i);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function careerSiteCategory(metadata: unknown): string | null {
  if (!Array.isArray(metadata)) {
    return null;
  }
  const entry = metadata.find(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      (item as { name?: unknown }).name === "Career Site Categories",
  ) as { value?: unknown } | undefined;
  return typeof entry?.value === "string" ? entry.value : null;
}

function greenhouseId(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    return raw.trim();
  }
  throw new Error("Greenhouse job missing id");
}

function assertSameOrigin(next: string, first: string): void {
  let nextUrl: URL;
  try {
    nextUrl = new URL(next);
  } catch {
    throw new Error(`Greenhouse pagination URL is invalid: ${next}`);
  }
  const firstUrl = new URL(first);
  if (nextUrl.origin !== firstUrl.origin) {
    throw new Error(
      `Greenhouse pagination URL left ${firstUrl.origin}: ${next}`,
    );
  }
}

export function mapGreenhouseJob(raw: unknown): Job | null {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Greenhouse job must be an object");
  }
  const row = raw as Record<string, unknown>;
  const location =
    row.location !== null && typeof row.location === "object"
      ? (row.location as { name?: unknown }).name
      : undefined;
  const departments = Array.isArray(row.departments)
    ? row.departments
        .map((dept) =>
          dept !== null && typeof dept === "object"
            ? (dept as { name?: unknown }).name
            : undefined,
        )
        .filter((name): name is string => typeof name === "string")
    : [];
  if (
    typeof row.absolute_url !== "string" ||
    !/^https:\/\//i.test(row.absolute_url.trim())
  ) {
    const rawId = row.id;
    const id =
      typeof rawId === "number" || typeof rawId === "string"
        ? ` id=${String(rawId)}`
        : "";
    console.error(`Dropping Greenhouse job${id} with invalid absolute_url`);
    return null;
  }
  return {
    id: greenhouseId(row.id),
    title: typeof row.title === "string" ? row.title : "",
    location: typeof location === "string" ? location : "",
    careerSiteCategory: careerSiteCategory(row.metadata),
    departments,
    absoluteUrl: row.absolute_url.trim(),
    content: typeof row.content === "string" ? row.content : "",
  };
}

export async function fetchGreenhouseJobs(
  boardToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<Job[]> {
  const firstUrl = `${BOARDS}/${encodeURIComponent(boardToken)}/jobs?content=true`;
  let url: string | null = firstUrl;
  const jobs: Job[] = [];
  let metaTotal: number | undefined;
  let rawCount = 0;
  const visited = new Set<string>();

  while (url) {
    if (visited.has(url)) {
      throw new Error(`Greenhouse pagination cycle at ${url}`);
    }
    if (visited.size >= GREENHOUSE_MAX_PAGES) {
      throw new Error(
        `Greenhouse pagination exceeded ${GREENHOUSE_MAX_PAGES} pages`,
      );
    }
    visited.add(url);

    const response = await fetchWith429Retries(url, {
      fetchImpl,
      label: "Greenhouse",
    });
    if (!response.ok) {
      throw new Error(`Greenhouse HTTP ${response.status}`);
    }
    let body: { jobs?: unknown[]; meta?: { total?: unknown } };
    try {
      body = (await response.json()) as {
        jobs?: unknown[];
        meta?: { total?: unknown };
      };
    } catch (err) {
      throw new Error(`Greenhouse request failed: ${(err as Error).message}`);
    }
    const pageJobs = Array.isArray(body.jobs) ? body.jobs : [];
    rawCount += pageJobs.length;
    for (const pageJob of pageJobs) {
      const job = mapGreenhouseJob(pageJob);
      if (job) {
        jobs.push(job);
      }
    }
    if (typeof body.meta?.total === "number") {
      metaTotal = body.meta.total;
    }
    const next = nextLink(response.headers.get("link"));
    if (next) {
      assertSameOrigin(next, firstUrl);
    }
    url = next;
  }

  if (typeof metaTotal === "number" && rawCount !== metaTotal) {
    throw new Error(
      `Greenhouse pagination incomplete: got ${rawCount} raw jobs, meta.total ${metaTotal}`,
    );
  }
  return jobs;
}

export async function listGreenhouseJobs(
  company: GreenhouseCompany,
  fetchImpl: FetchLike = fetch,
): Promise<Job[]> {
  return fetchGreenhouseJobs(company.boardToken, fetchImpl);
}
