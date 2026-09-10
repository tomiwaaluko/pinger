import { describe, expect, it, vi } from "vitest";
import { listAmazonJobs, mapAmazonJob } from "../src/adapters/amazon.js";
import { matchesJob } from "../src/matcher.js";
import fixture from "./fixtures/amazon-search-trimmed.json";

describe("mapAmazonJob", () => {
  it("maps official search JSON to a matching HTTPS job", () => {
    const job = mapAmazonJob(fixture.jobs[0]);
    expect(job).not.toBeNull();
    expect(job).toMatchObject({
      id: "741dc21a-3363-4e63-9555-f90219c7fd70",
      title: "Software Engineer Intern, Spring 2027",
      location: "Seattle, Washington, USA",
      departments: ["Engineering"],
      absoluteUrl:
        "https://www.amazon.jobs/en/jobs/123456/software-development-engineer-intern-spring-2027",
    });
    expect(job!.content).toContain("Spring 2027 internship");
    expect(matchesJob(job!)).toBe(true);
  });

  it("drops jobs without https URLs", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(mapAmazonJob(fixture.jobs[1])).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      "Dropping Amazon job id=bad-url with invalid absoluteUrl",
    );
  });
});

describe("listAmazonJobs", () => {
  it("fetches the public search API and maps jobs", async () => {
    const urls: string[] = [];
    const jobs = await listAmazonJobs({}, async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    expect(urls).toEqual([
      "https://www.amazon.jobs/en/search.json?offset=0&result_limit=100&sort=relevant&base_query=software+engineer",
    ]);
    expect(jobs).toHaveLength(1);
  });

  it("paginates until Amazon returns a short page", async () => {
    const pageOne = Array.from({ length: 100 }, (_, index) => ({
      ...fixture.jobs[0],
      id: `page-one-${index}`,
    }));
    const pageTwo = [{ ...fixture.jobs[0], id: "page-two-0" }];
    const urls: string[] = [];

    const jobs = await listAmazonJobs({}, async (input) => {
      const url = String(input);
      urls.push(url);
      const body = url.includes("offset=100")
        ? { jobs: pageTwo }
        : { jobs: pageOne };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    expect(urls).toEqual([
      "https://www.amazon.jobs/en/search.json?offset=0&result_limit=100&sort=relevant&base_query=software+engineer",
      "https://www.amazon.jobs/en/search.json?offset=100&result_limit=100&sort=relevant&base_query=software+engineer",
    ]);
    expect(jobs).toHaveLength(101);
    expect(jobs.at(-1)?.id).toBe("page-two-0");
  });

  it("throws on non-200 responses", async () => {
    await expect(
      listAmazonJobs({}, async () => new Response("{}", { status: 503 })),
    ).rejects.toThrow(/Amazon HTTP 503/);
  });
});
