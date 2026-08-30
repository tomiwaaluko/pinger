import { describe, expect, it } from "vitest";
import { listAshbyJobs, mapAshbyJob } from "../src/adapters/ashby.js";
import fixture from "./fixtures/ashby-notion-trimmed.json";

describe("mapAshbyJob", () => {
  it("maps listed job with department and jobUrl", () => {
    const job = mapAshbyJob(fixture.jobs[0]);
    expect(job).not.toBeNull();
    expect(job!.id).toBeTruthy();
    expect(job!.departments).toEqual(["Engineering"]);
    expect(job!.absoluteUrl).toMatch(/^https:\/\//);
    expect(job!.content).toContain("Build product features");
  });

  it("drops unlisted jobs", () => {
    expect(mapAshbyJob(fixture.jobs[1])).toBeNull();
  });

  it("drops jobs without https url", () => {
    expect(
      mapAshbyJob({
        ...fixture.jobs[0],
        jobUrl: "http://insecure.example/jobs/1",
        applyUrl: undefined,
      }),
    ).toBeNull();
  });
});

describe("listAshbyJobs", () => {
  it("fetches and maps jobs from the public API", async () => {
    const jobs = await listAshbyJobs(
      {
        id: "notion",
        name: "Notion",
        ats: "ashby",
        boardName: "notion",
        enabled: true,
      },
      async () =>
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Software Engineer Intern");
  });

  it("throws on 404", async () => {
    await expect(
      listAshbyJobs(
        {
          id: "missing",
          name: "Missing",
          ats: "ashby",
          boardName: "missing",
          enabled: true,
        },
        async () => new Response("{}", { status: 404 }),
      ),
    ).rejects.toThrow(/Ashby HTTP 404/);
  });
});
