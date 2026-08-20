import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
    expect(mapped.filter((job) => matchesJob(job))).toEqual([]);
  });

  it("returns null when absolute_url is missing, empty, or not https", () => {
    const base = fixture.jobs[1] as Record<string, unknown>;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(mapGreenhouseJob({ ...base, absolute_url: undefined })).toBeNull();
    expect(mapGreenhouseJob({ ...base, absolute_url: "" })).toBeNull();
    expect(mapGreenhouseJob({ ...base, absolute_url: "   " })).toBeNull();
    expect(
      mapGreenhouseJob({
        ...base,
        absolute_url: "http://job-boards.greenhouse.io/vercel/jobs/1",
      }),
    ).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(4);
  });

  it("trims absolute_url whitespace and rejects a missing id", () => {
    const base = fixture.jobs[1] as Record<string, unknown>;
    const job = mapGreenhouseJob({
      ...base,
      absolute_url: " https://job-boards.greenhouse.io/vercel/jobs/6134374004 ",
    });
    expect(job.absoluteUrl).toBe(
      "https://job-boards.greenhouse.io/vercel/jobs/6134374004",
    );
    expect(() => mapGreenhouseJob({ ...base, id: undefined })).toThrow(/id/);
    expect(() => mapGreenhouseJob({ ...base, id: "not-a-number" })).toThrow(
      /id/,
    );
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

  it("drops jobs with bad absolute_url without treating pagination as incomplete", async () => {
    const base = fixture.jobs[0] as Record<string, unknown>;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const jobs = await fetchGreenhouseJobs("vercel", async () =>
      jsonResponse({
        jobs: [fixture.jobs[0], { ...base, id: 9999999999, absolute_url: "" }],
        meta: { total: 2 },
      }),
    );

    expect(jobs.map((job) => job.id)).toEqual(["6136160004"]);
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("retries HTTP 429 and returns jobs after a successful retry", async () => {
    let calls = 0;
    const jobs = await fetchGreenhouseJobs("vercel", async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({}, { status: 429, headers: { "retry-after": "0" } });
      }
      return jsonResponse({ jobs: [fixture.jobs[0]], meta: { total: 1 } });
    });

    expect(jobs).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it("does not retry HTTP 404", async () => {
    let calls = 0;
    await expect(
      fetchGreenhouseJobs("vercel", async () => {
        calls += 1;
        return jsonResponse({}, { status: 404 });
      }),
    ).rejects.toThrow(/HTTP 404/);

    expect(calls).toBe(1);
  });

  it("throws after two HTTP 429 retries", async () => {
    let calls = 0;
    await expect(
      fetchGreenhouseJobs("vercel", async () => {
        calls += 1;
        return jsonResponse({}, { status: 429, headers: { "retry-after": "0" } });
      }),
    ).rejects.toThrow(/HTTP 429/);

    expect(calls).toBe(3);
  });

  it("falls back to exponential backoff for non-numeric Retry-After", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const promise = fetchGreenhouseJobs("vercel", async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse(
          {},
          { status: 429, headers: { "retry-after": "tomorrow" } },
        );
      }
      return jsonResponse({ jobs: [fixture.jobs[0]], meta: { total: 1 } });
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toHaveLength(1);
    expect(calls).toBe(2);
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

  it("rejects a next URL on a different origin", async () => {
    await expect(
      fetchGreenhouseJobs("vercel", async (input) => {
        if (String(input) === page1Url) {
          return jsonResponse(
            { jobs: [fixture.jobs[0]], meta: { total: 2 } },
            {
              headers: {
                link: '<https://evil.example/next>; rel="next"',
              },
            },
          );
        }
        throw new Error(`unexpected url ${String(input)}`);
      }),
    ).rejects.toThrow(/left https:\/\/boards-api.greenhouse.io/);
  });

  it("rejects a pagination cycle", async () => {
    await expect(
      fetchGreenhouseJobs("vercel", async () =>
        jsonResponse(
          { jobs: [fixture.jobs[0]], meta: { total: 2 } },
          { headers: { link: `<${page1Url}>; rel="next"` } },
        ),
      ),
    ).rejects.toThrow(/pagination cycle/);
  });
});
