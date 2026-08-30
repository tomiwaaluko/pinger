import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  WORKDAY_PAGE_SIZE,
  hydrateWorkdayContent,
  listWorkdayJobs,
  mapWorkdayListItem,
} from "../src/adapters/workday.js";
import detailFixture from "./fixtures/workday-boeing-detail.json";
import page1 from "./fixtures/workday-boeing-list-page1.json";
import page2 from "./fixtures/workday-boeing-list-page2.json";

const boeingCompany = {
  id: "boeing",
  name: "Boeing",
  ats: "workday" as const,
  workday: {
    host: "boeing.wd1.myworkdayjobs.com",
    tenant: "boeing",
    site: "external_subsidiary",
  },
  enabled: true,
};

function fakeFetchSequence(
  responses: Array<{ status?: number; body?: unknown }>,
): typeof fetch {
  let index = 0;
  return async () => {
    const next = responses[index];
    index += 1;
    return new Response(JSON.stringify(next?.body ?? {}), {
      status: next?.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("mapWorkdayListItem", () => {
  it("infers Engineering department only for SWE titles", () => {
    const job = mapWorkdayListItem(boeingCompany, page1.jobPostings[0]);
    expect(job?.departments).toEqual(["Engineering"]);
  });

  it("does not infer department for non-SWE titles", () => {
    const job = mapWorkdayListItem(boeingCompany, {
      title: "Financial Analyst I",
      locationsText: "Chicago, IL",
      externalPath: "/job/Chicago/Financial-Analyst_JR200",
      jobReqId: "JR200",
    });
    expect(job?.departments).toEqual([]);
  });
});

describe("listWorkdayJobs", () => {
  it("paginates at limit 20", async () => {
    const jobs = await listWorkdayJobs(
      boeingCompany,
      fakeFetchSequence([{ body: page1 }, { body: page2 }]),
    );
    expect(jobs.length).toBe(2);
    expect(jobs.every((job) => job.content === "")).toBe(true);
  });

  it("rejects limit > 20 at constant level", () => {
    expect(WORKDAY_PAGE_SIZE).toBe(20);
  });

  it("fails when jobPostings is missing", async () => {
    await expect(
      listWorkdayJobs(boeingCompany, fakeFetchSequence([{ body: {} }])),
    ).rejects.toThrow(/missing jobPostings/);
  });
});

describe("hydrateWorkdayContent", () => {
  it("hydrates only requested jobs", async () => {
    const listed = await listWorkdayJobs(
      boeingCompany,
      fakeFetchSequence([{ body: page1 }, { body: page2 }]),
    );
    const jobA = listed[0];
    const hydrated = await hydrateWorkdayContent(
      boeingCompany,
      fakeFetchSequence([{ body: detailFixture }]),
      [jobA],
    );
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0].content).toContain("flight software");
  });
});
