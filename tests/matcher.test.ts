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
  it.each([
    ["Software Engineer Intern", ["Engineering"], true],
    ["SOFTWARE ENGINEER INTERNSHIP", ["Engineering"], true],
    ["Software Engineer Co-op", ["Engineering"], true],
    ["Software Engineer Co op", ["Engineering"], true],
    ["Software Engineer Coop", ["Engineering"], true],
    ["New Grad Software Engineer", ["Engineering"], true],
    ["New-Grad Software Engineer", ["Engineering"], true],
    ["Newgrad Software Engineer", ["Engineering"], true],
    ["Graduate Software Engineer", ["Engineering"], true],
    ["University Software Engineer", ["Engineering"], true],
    ["AI Engineer Intern", ["AI"], true],
    ["AI Engineer Intern", ["AI Platform"], true],
    ["SWE Intern", ["Platform Engineering"], true],
    ["Software Engineering Intern", ["Product Engineering"], true],
    ["Software Engineer Intern", ["Software Engineering"], true],
    ["Software Engineer Intern", ["Resolution Engineering"], true],
    ["Junior Software Engineer Intern", ["Engineering"], true],
    ["Undergraduate Software Engineer Intern", ["Engineering"], true],
    ["Software Engineer Intern", ["Sales Engineering"], false],
    ["Software Engineer Intern", ["Solutions Engineering"], false],
    ["Software Engineer Intern", ["Field Engineering"], false],
    ["Software Engineer Intern", ["Non-Engineering"], false],
    ["Software Engineer Intern", ["Retail"], false],
    ["Software Engineer Intern", ["Training"], false],
    ["Software Engineer Intern", ["Maintenance"], false],
    ["Software Engineer Intern", ["Dev Eng"], false],
    ["Software Engineer Intern", ["Sales", "Engineering"], false],
    ["Software Engineer Intern", [], false],
    ["Engineering Manager", ["Engineering"], false],
    ["Engineering Manager Intern", ["Engineering"], false],
    ["DevRel Engineer Intern", ["Engineering"], false],
    ["Senior Software Engineer", ["Engineering"], false],
    ["Associate Software Engineer", ["Engineering"], false],
    ["Junior Software Engineer", ["Engineering"], false],
    ["Account Executive, Commercial", ["Engineering"], false],
    ["Software Engineer, Trust & Safety", ["Security"], false],
    ["Software Engineer, AI SDK", ["Engineering"], false],
    ["Member of the Technical Staff, Internal Agent ", ["Engineering"], false],
    ["Undergraduate Software Engineer", ["Engineering"], false],
  ])("title %s depts %j → %s", (title, departments, expected) => {
    expect(
      matchesJob(
        makeJob({
          title,
          departments,
          careerSiteCategory: "Engineering",
        }),
      ),
    ).toBe(expected);
  });

  it("ignores Career Site Categories even when Engineering", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          careerSiteCategory: "Engineering",
          departments: ["Security"],
        }),
      ),
    ).toBe(false);
  });
});
