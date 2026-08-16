import type { Job } from "../src/types.js";

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "1",
    title: "Software Engineer Intern",
    location: "Remote - United States",
    careerSiteCategory: "Engineering",
    departments: ["Engineering"],
    absoluteUrl: "https://job-boards.greenhouse.io/vercel/jobs/1",
    content: "&lt;p&gt;Build things.&lt;/p&gt;",
    ...overrides,
  };
}
