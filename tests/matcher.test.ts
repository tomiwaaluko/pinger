import { describe, expect, it } from "vitest";
import { matchesJob, normalizeTitle } from "../src/matcher.js";
import { makeJob } from "./helpers.js";

describe("normalizeTitle", () => {
  it("trims, lowercases, and collapses hyphens and whitespace", () => {
    expect(normalizeTitle("  New-Grad   Software Engineer  ")).toBe(
      "new grad software engineer",
    );
  });
});

describe("matchesJob", () => {
  const category = "Engineering";

  it.each([
    ["Software Engineer Intern", true],
    ["SOFTWARE ENGINEER INTERNSHIP", true],
    ["Software Engineer Co-op", true],
    ["Software Engineer Co op", true],
    ["Software Engineer Coop", true],
    ["New Grad Software Engineer", true],
    ["New-Grad Software Engineer", true],
    ["Newgrad Software Engineer", true],
    ["Graduate Software Engineer", true],
    ["University Software Engineer", true],
    ["AI Engineer Intern", true],
    ["SWE Intern", true],
    ["Software Engineering Intern", true],
    ["Junior Software Engineer Intern", true],
  ])("accepts early-career SWE/AI title %s", (title, expected) => {
    expect(matchesJob(makeJob({ title }), category)).toBe(expected);
  });

  it.each([
    ["Engineering Manager", false],
    ["Engineering Manager Intern", false],
    ["DevRel Engineer Intern", false],
    ["Senior Software Engineer", false],
    ["Associate Software Engineer", false],
    ["Junior Software Engineer", false],
    ["Account Executive, Commercial", false],
    ["Member of the Technical Staff, Internal Agent ", false],
    ["Undergraduate Software Engineer", false],
    ["Software Engineer, Trust & Safety", false],
    ["Software Engineer, AI SDK", false],
  ])("rejects %s", (title, expected) => {
    expect(matchesJob(makeJob({ title }), category)).toBe(expected);
  });

  it("matches category case-insensitively and ignores departments", () => {
    const job = makeJob({
      title: "Software Engineer Intern",
      careerSiteCategory: "engineering",
      departments: ["Security"],
    });
    expect(matchesJob(job, "Engineering")).toBe(true);
  });

  it("rejects missing or non-string Career Site Categories", () => {
    expect(
      matchesJob(makeJob({ careerSiteCategory: null }), category),
    ).toBe(false);
  });

  it("rejects a non-Engineering category even when the title matches", () => {
    const job = makeJob({
      title: "Software Engineer Intern",
      careerSiteCategory: "Security & IT",
    });
    expect(matchesJob(job, "Engineering")).toBe(false);
  });

  it("does not treat intern as a prefix of internal", () => {
    expect(
      matchesJob(
        makeJob({ title: "Member of the Technical Staff, Internal Agent " }),
        category,
      ),
    ).toBe(false);
  });

  it("does not treat graduate as a substring of undergraduate", () => {
    expect(
      matchesJob(makeJob({ title: "Undergraduate Software Engineer" }), category),
    ).toBe(false);
  });

  it("still matches an undergraduate intern role", () => {
    expect(
      matchesJob(
        makeJob({ title: "Undergraduate Software Engineer Intern" }),
        category,
      ),
    ).toBe(true);
  });

  it("matches Trust & Safety intern against Engineering category, not department", () => {
    const job = makeJob({
      title: "Software Engineer Intern, Trust & Safety",
      careerSiteCategory: "Engineering",
      departments: ["Security"],
    });
    expect(matchesJob(job, "Engineering")).toBe(true);
  });
});
