import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  fetchGreenhouseJobs,
  mapGreenhouseJob,
} from "../src/greenhouse.js";
import { matchesJob } from "../src/matcher.js";

const fixture = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "fixtures/greenhouse-vercel-trimmed.json",
    ),
    "utf8",
  ),
) as { jobs: unknown[]; meta: { total: number } };

const page1Url =
  "https://boards-api.greenhouse.io/v1/boards/vercel/jobs?content=true";
const page2Url =
  "https://boards-api.greenhouse.io/v1/boards/vercel/jobs?content=true&page=2";

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

describe("mapGreenhouseJob", () => {
  it("maps id, trailing-space title, category, departments, and absolute_url", () => {
    const internal = fixture.jobs.find(
      (row) => (row as { id: number }).id === 6134374004,
    );
    const job = mapGreenhouseJob(internal);
    expect(job.id).toBe("6134374004");
    expect(job.title).toBe("Member of the Technical Staff, Internal Agent ");
    expect(job.careerSiteCategory).toBe("Engineering");
    expect(job.departments).toEqual(["Engineering"]);
    expect(job.absoluteUrl).toBe(
      "https://job-boards.greenhouse.io/vercel/jobs/6134374004",
    );
  });

  it("keeps Trust & Safety as Engineering category and Security department", () => {
    const raw = fixture.jobs.find(
      (row) => (row as { id: number }).id === 5788954004,
    );
    const job = mapGreenhouseJob(raw);
    expect(job.title).toBe("Software Engineer, Trust & Safety");
    expect(job.careerSiteCategory).toBe("Engineering");
    expect(job.departments).toEqual(["Security"]);
    expect(job.absoluteUrl).toBe(
      "https://job-boards.greenhouse.io/vercel/jobs/5788954004",
    );
  });

  it("does not match any captured live fixture job as intern/new-grad SWE", () => {
    const mapped = fixture.jobs.map((row) => mapGreenhouseJob(row));
    expect(mapped.filter((job) => matchesJob(job, "Engineering"))).toEqual([]);
  });

  it("throws when absolute_url is missing, empty, or not https", () => {
    const base = fixture.jobs[1] as Record<string, unknown>;
    expect(() =>
      mapGreenhouseJob({ ...base, absolute_url: undefined }),
    ).toThrow(/absolute_url/);
    expect(() => mapGreenhouseJob({ ...base, absolute_url: "" })).toThrow(
      /absolute_url/,
    );
    expect(() => mapGreenhouseJob({ ...base, absolute_url: "   " })).toThrow(
      /absolute_url/,
    );
    expect(() =>
      mapGreenhouseJob({
        ...base,
        absolute_url: "http://job-boards.greenhouse.io/vercel/jobs/1",
      }),
    ).toThrow(/absolute_url/);
  });
});

describe("fetchGreenhouseJobs", () => {
  it("requests content=true and returns mapped jobs", async () => {
    const urls: string[] = [];
    const jobs = await fetchGreenhouseJobs("vercel", async (input, init) => {
      const url = String(input);
      urls.push(url);
      expect(init?.signal).toBeDefined();
      return jsonResponse(fixture);
    });
    expect(urls).toEqual([page1Url]);
    expect(jobs).toHaveLength(5);
    expect(jobs[0].id).toBe("6136160004");
  });

  it("follows Link rel=next and then accepts matching meta.total", async () => {
    const jobs = await fetchGreenhouseJobs("vercel", async (input) => {
      const url = String(input);
      if (url === page1Url) {
        return jsonResponse(
          { jobs: [fixture.jobs[0]], meta: { total: 2 } },
          { headers: { link: `<${page2Url}>; rel="next"` } },
        );
      }
      if (url === page2Url) {
        return jsonResponse({
          jobs: [fixture.jobs[1]],
          meta: { total: 2 },
        });
      }
      throw new Error(`unexpected url ${url}`);
    });
    expect(jobs.map((job) => job.id)).toEqual(["6136160004", "6134374004"]);
  });

  it("fails when meta.total does not match accumulated jobs", async () => {
    await expect(
      fetchGreenhouseJobs("vercel", async () =>
        jsonResponse({ jobs: [fixture.jobs[0]], meta: { total: 83 } }),
      ),
    ).rejects.toThrow(/pagination incomplete/);
  });

  it("fails on non-200", async () => {
    await expect(
      fetchGreenhouseJobs("vercel", async () => jsonResponse({}, { status: 500 })),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("fails on timeout/abort", async () => {
    await expect(
      fetchGreenhouseJobs("vercel", async () => {
        throw new DOMException("The operation was aborted.", "TimeoutError");
      }),
    ).rejects.toThrow();
  });
});
