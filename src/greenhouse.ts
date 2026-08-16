import { REQUEST_TIMEOUT_MS } from "./constants.js";
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

export function mapGreenhouseJob(raw: unknown): Job {
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
    throw new Error("Greenhouse job missing absolute_url");
  }
  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
    location: typeof location === "string" ? location : "",
    careerSiteCategory: careerSiteCategory(row.metadata),
    departments,
    absoluteUrl: row.absolute_url,
    content: typeof row.content === "string" ? row.content : "",
  };
}

export async function fetchGreenhouseJobs(
  boardToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<Job[]> {
  let url: string | null =
    `${BOARDS}/${encodeURIComponent(boardToken)}/jobs?content=true`;
  const jobs: Job[] = [];
  let metaTotal: number | undefined;

  while (url) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`Greenhouse request failed: ${(err as Error).message}`);
    }
    if (!response.ok) {
      throw new Error(`Greenhouse HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      jobs?: unknown[];
      meta?: { total?: unknown };
    };
    const pageJobs = Array.isArray(body.jobs) ? body.jobs : [];
    jobs.push(...pageJobs.map(mapGreenhouseJob));
    if (typeof body.meta?.total === "number") {
      metaTotal = body.meta.total;
    }
    url = nextLink(response.headers.get("link"));
  }

  if (typeof metaTotal === "number" && jobs.length !== metaTotal) {
    throw new Error(
      `Greenhouse pagination incomplete: got ${jobs.length} jobs, meta.total ${metaTotal}`,
    );
  }
  return jobs;
}
