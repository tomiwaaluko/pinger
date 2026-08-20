import {
  GREENHOUSE_MAX_PAGES,
  HTTP_429_MAX_RETRIES,
  HTTP_429_RETRY_AFTER_CAP_MS,
  REQUEST_TIMEOUT_MS,
} from "./constants.js";
import type { FetchLike, Job } from "./types.js";

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
    console.error("Dropping Greenhouse job with invalid absolute_url");
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
      throw new Error(`Greenhouse request failed: ${(err as Error).message}`);
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

    const response = await fetchWith429Retries(url, fetchImpl);
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
