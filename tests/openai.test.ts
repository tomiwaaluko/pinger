import { describe, expect, it } from "vitest";
import { listOpenAiJobs } from "../src/adapters/openai.js";
import { matchesJob } from "../src/matcher.js";
import fixture from "./fixtures/openai-ashby-trimmed.json";

describe("listOpenAiJobs", () => {
  it("fetches OpenAI from Ashby's public posting API", async () => {
    const urls: string[] = [];
    const jobs = await listOpenAiJobs({}, async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    expect(urls).toEqual([
      "https://api.ashbyhq.com/posting-api/job-board/openai",
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: "8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3",
      title: "Software Engineer, New Grad",
      location: "San Francisco, CA; New York, NY",
      departments: ["Engineering"],
      absoluteUrl:
        "https://jobs.ashbyhq.com/openai/8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3",
    });
    expect(jobs[0].content).toContain("New graduate program");
    expect(matchesJob(jobs[0])).toBe(true);
  });

  it("throws on non-200 responses", async () => {
    await expect(
      listOpenAiJobs({}, async () => new Response("{}", { status: 404 })),
    ).rejects.toThrow(/Ashby HTTP 404/);
  });
});
