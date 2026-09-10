import { describe, expect, it } from "vitest";
import {
  hydrateNvidiaContent,
  listNvidiaJobs,
} from "../src/adapters/nvidia.js";
import { matchesJob, passesBaseGates, passesSeasonYear } from "../src/matcher.js";
import detailFixture from "./fixtures/nvidia-workday-detail.json";
import listFixture from "./fixtures/nvidia-workday-list.json";

describe("listNvidiaJobs", () => {
  it("fetches NVIDIA Workday CXS JSON and maps HTTPS jobs", async () => {
    const bodies: unknown[] = [listFixture, { total: 0, jobPostings: [] }];
    const urls: string[] = [];
    const requestBodies: unknown[] = [];

    const jobs = await listNvidiaJobs({}, async (input, init) => {
      urls.push(String(input));
      requestBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(bodies.shift()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    expect(urls[0]).toBe(
      "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs",
    );
    expect(requestBodies[0]).toMatchObject({ limit: 20, offset: 0 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: "JR2015623",
      title: "Software Engineer Intern",
      location: "Santa Clara, CA",
      departments: ["Engineering"],
      absoluteUrl:
        "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Software-Engineer-Intern_JR2015623",
      content: "",
    });
    expect(passesBaseGates(jobs[0])).toBe(true);
    expect(passesSeasonYear(jobs[0])).toBe(false);
  });
});

describe("hydrateNvidiaContent", () => {
  it("hydrates NVIDIA details so Spring 2027 interns can match", async () => {
    const bodies: unknown[] = [listFixture, { total: 0, jobPostings: [] }];
    const [job] = await listNvidiaJobs({}, async () =>
      new Response(JSON.stringify(bodies.shift()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const hydrated = await hydrateNvidiaContent({}, async (input) => {
      expect(String(input)).toBe(
        "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Software-Engineer-Intern_JR2015623",
      );
      return new Response(JSON.stringify(detailFixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }, [job]);

    expect(hydrated[0].content).toContain("Spring 2027 internship");
    expect(matchesJob(hydrated[0])).toBe(true);
  });
});
