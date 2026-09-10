import { describe, expect, it } from "vitest";
import {
  matchesJob,
  normalizeTitle,
  passesBaseGates,
  passesSeasonYear,
} from "../src/matcher.js";
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
    ["Software Engineer Intern", ["Engineering"], false],
    ["SOFTWARE ENGINEER INTERNSHIP", ["Engineering"], false],
    ["Software Engineer Co-op", ["Engineering"], false],
    ["Software Engineer Co op", ["Engineering"], false],
    ["Software Engineer Coop", ["Engineering"], false],
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
  ])("title %s depts %j -> %s", (title, departments, expected) => {
    const internshipContent =
      expected && /\b(?:intern|internship|co-?op|coop)\b/i.test(title)
        ? "Spring 2027 internship on the platform team."
        : "";
    expect(
      matchesJob(
        makeJob({
          title,
          departments,
          careerSiteCategory: "Engineering",
          content: internshipContent,
        }),
      ),
    ).toBe(expected);
  });

  it("keeps US Spring 2027 intern with season in description only", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          location: "San Francisco, CA",
          content: "Spring 2027 internship on the platform team.",
        }),
      ),
    ).toBe(true);
  });

  it("drops season-less intern", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          location: "San Francisco, CA",
          content: "Build APIs.",
        }),
      ),
    ).toBe(false);
  });

  it("drops Summer 2027 intern", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern (Summer 2027)",
          location: "Seattle, WA",
        }),
      ),
    ).toBe(false);
  });

  it("drops Spring/Summer 2027 dual tag", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          location: "Austin, TX",
          content: "Spring/Summer 2027 internship",
        }),
      ),
    ).toBe(false);
  });

  it("keeps Jan-May 2027 spring window", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          location: "Boston, MA",
          content: "Internship dates: January-May 2027",
        }),
      ),
    ).toBe(true);
  });

  it("keeps Winter-May 2027 spring window", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          location: "Boston, MA",
          content: "Internship dates: Winter-May 2027",
        }),
      ),
    ).toBe(true);
  });

  it("keeps yearless new grad in US", () => {
    expect(
      matchesJob(
        makeJob({
          title: "New Grad Software Engineer",
          location: "New York, NY",
          content: "",
        }),
      ),
    ).toBe(true);
  });

  it("matches Scale-style university graduate SWE wording when present", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer, New Grad",
          departments: ["Engineering"],
          location: "San Francisco, CA",
          content: "New graduate program 2027",
        }),
      ),
    ).toBe(true);
  });

  it("matches Stripe-style internship with Spring in body", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineering Intern",
          departments: ["Engineering"],
          location: "Seattle, WA",
          content: "Our Spring 2027 internship cohort",
        }),
      ),
    ).toBe(true);
  });

  it("drops 2026 new grad", () => {
    expect(
      matchesJob(
        makeJob({
          title: "New Grad Software Engineer 2026",
          location: "San Francisco, CA",
        }),
      ),
    ).toBe(false);
  });

  it("intern path wins over university wording for Summer", () => {
    expect(
      matchesJob(
        makeJob({
          title: "University Software Engineer Intern",
          location: "Remote - United States",
          content: "Summer 2027 university recruiting",
        }),
      ),
    ).toBe(false);
  });

  it("drops London-only location", () => {
    expect(
      matchesJob(
        makeJob({
          title: "New Grad Software Engineer",
          location: "London, UK",
        }),
      ),
    ).toBe(false);
  });

  it("exports passesBaseGates true for Workday list intern before season", () => {
    const job = makeJob({
      title: "Software Engineer Intern",
      location: "San Jose, CA",
      content: "",
    });

    expect(passesBaseGates(job)).toBe(true);
    expect(passesSeasonYear(job)).toBe(false);
    expect(matchesJob(job)).toBe(false);
  });

  it("ignores Career Site Categories even when Engineering", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          careerSiteCategory: "Engineering",
          departments: ["Security"],
          content: "Spring 2027 internship on the platform team.",
        }),
      ),
    ).toBe(false);
  });
});
