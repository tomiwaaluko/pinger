import { describe, expect, it } from "vitest";
import {
  allowEmptyContentAfterHydrate,
  capBucket,
  hasRolePhrase,
  isInternTitle,
  jobTrack,
  matchesJob,
  normalizeTitle,
  passesBaseGates,
  passesSeasonYear,
} from "../src/matcher.js";
import { makeJob } from "./helpers.js";

describe("isInternTitle", () => {
  it("reads intern from the title only", () => {
    expect(
      isInternTitle(makeJob({ title: "Software Engineer Intern", content: "" })),
    ).toBe(true);
    expect(
      isInternTitle(
        makeJob({
          title: "Software Engineer",
          content: "internship experience preferred",
        }),
      ),
    ).toBe(false);
  });
});

describe("hasRolePhrase", () => {
  it("matches whole-token sde but not sdet", () => {
    expect(hasRolePhrase("SDE I")).toBe(true);
    expect(hasRolePhrase("SDET")).toBe(false);
  });
});

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
    ["Associate Software Engineer", ["Engineering"], true],
    ["Junior Software Engineer", ["Engineering"], true],
    ["Account Executive, Commercial", ["Engineering"], false],
    ["Software Engineer, Trust & Safety", ["Security"], false],
    ["Software Engineer, AI SDK", ["Engineering"], true],
    ["Member of the Technical Staff, Internal Agent ", ["Engineering"], false],
    ["Undergraduate Software Engineer", ["Engineering"], true],
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

  it("keeps Summer 2027 intern", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern (Summer 2027)",
          location: "Seattle, WA",
        }),
      ),
    ).toBe(true);
  });

  it("keeps Fall 2027 intern", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern (Fall 2027)",
          location: "Seattle, WA",
        }),
      ),
    ).toBe(true);
  });

  it("keeps standalone Winter 2027 intern", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          location: "Denver, CO",
          content: "Winter 2027 internship",
        }),
      ),
    ).toBe(true);
  });

  it("keeps Spring/Summer 2027 dual tag", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          location: "Austin, TX",
          content: "Spring/Summer 2027 internship",
        }),
      ),
    ).toBe(true);
  });

  it("drops Summer 2026 intern", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern (Summer 2026)",
          location: "Seattle, WA",
        }),
      ),
    ).toBe(false);
  });

  it("keeps Fall '27 short-year intern", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          location: "Chicago, IL",
          content: "Fall '27 internship cohort",
        }),
      ),
    ).toBe(true);
  });

  it("drops conflicting short-year season tags", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          location: "Chicago, IL",
          content: "Summer '27 / Winter '26 internship cohort",
        }),
      ),
    ).toBe(false);
  });

  it("drops Winter 2026 intern", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern (Winter 2026)",
          location: "Seattle, WA",
        }),
      ),
    ).toBe(false);
  });

  it("keeps Winter/Fall 2027 dual tag", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          location: "Austin, TX",
          content: "Winter/Fall 2027 internship",
        }),
      ),
    ).toBe(true);
  });

  it("still drops season-less-but-yeared intern (2027 with no season word)", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          location: "San Francisco, CA",
          content: "Join our 2027 internship class.",
        }),
      ),
    ).toBe(false);
  });

  it("new-grad track ignores season words entirely", () => {
    expect(
      matchesJob(
        makeJob({
          title: "New Grad Software Engineer",
          location: "New York, NY",
          content: "Our Summer 2027 new-grad onboarding cohort.",
        }),
      ),
    ).toBe(true);
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

  it("intern path wins over university wording for Summer 2027", () => {
    expect(
      matchesJob(
        makeJob({
          title: "University Software Engineer Intern",
          location: "Remote - United States",
          content: "Summer 2027 university recruiting",
        }),
      ),
    ).toBe(true);
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

describe("jobTrack", () => {
  it("classifies an intern title as intern", () => {
    expect(
      jobTrack(
        makeJob({
          title: "Software Engineer Intern",
          content: "Summer 2027 internship",
        }),
      ),
    ).toBe("intern");
  });

  it("classifies a new-grad title as new-grad", () => {
    expect(
      jobTrack(makeJob({ title: "New Grad Software Engineer" })),
    ).toBe("new-grad");
  });

  it("intern classification wins when both intern and new-grad language appear", () => {
    expect(
      jobTrack(
        makeJob({
          title: "University Software Engineer Intern",
          content: "Summer 2027 university recruiting",
        }),
      ),
    ).toBe("intern");
  });

  it("returns null for a job with neither track signal", () => {
    expect(
      jobTrack(makeJob({ title: "Staff Software Engineer", content: "" })),
    ).toBe(null);
  });
});

describe("matcher widen keep/drop", () => {
  const us = { location: "San Francisco, CA", content: "", departments: ["Engineering"] };

  it.each([
    ["Software Engineer"],
    ["Software Engineer, Backend"],
    ["Associate Software Engineer"],
    ["Junior Software Engineer"],
    ["Entry Level Software Engineer"],
    ["Early Career Software Engineer"],
    ["Early in Career Software Engineer"],
    ["College Grad Software Engineer"],
    ["University Grad Software Engineer"],
    ["Fresh Grad Software Engineer"],
    ["Software Engineer 1"],
    ["Software Engineer I"],
    ["SDE I"],
    ["SDE 1"],
    ["New Grad Software Engineer"],
    ["AI Engineer"],
    ["SWE"],
    ["Software Engineer, Python 3"],
    ["Software Engineer, iOS 18"],
  ])("keeps %s as new-grad", (title) => {
    const job = makeJob({ ...us, title });
    expect(matchesJob(job)).toBe(true);
    expect(jobTrack(job)).toBe("new-grad");
  });

  it("keeps body-only internship wording on the new-grad path", () => {
    const job = makeJob({
      ...us,
      title: "Software Engineer",
      content: "internship experience preferred",
    });
    expect(matchesJob(job)).toBe(true);
    expect(jobTrack(job)).toBe("new-grad");
  });

  it.each([
    ["Senior Software Engineer"],
    ["Sr Software Engineer"],
    ["Staff Software Engineer"],
    ["Principal Software Engineer"],
    ["Lead Software Engineer"],
    ["Software Engineer II"],
    ["Software Engineer III"],
    ["Software Engineer 2"],
    ["Software Engineer L2"],
    ["Software Engineer, Level 2"],
    ["Software Engineer 3"],
    ["Software Engineer 4"],
    ["SDE 2"],
    ["SDE L3"],
    ["SWE 2"],
    ["Software Engineering Manager"],
    ["Junior Product Manager"],
    ["Engineer 1"],
    ["Founding Engineer"],
    ["SDET"],
  ])("drops %s", (title) => {
    expect(matchesJob(makeJob({ ...us, title }))).toBe(false);
  });

  it("drops London-only bare SWE", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer",
          location: "London, UK",
          content: "",
        }),
      ),
    ).toBe(false);
  });

  it("drops intern title with no 2027 season", () => {
    expect(
      matchesJob(
        makeJob({
          ...us,
          title: "Software Engineer Intern",
          content: "Build APIs.",
        }),
      ),
    ).toBe(false);
  });

  it("drops new-grad SWE with a non-2027 year", () => {
    expect(
      matchesJob(
        makeJob({
          ...us,
          title: "Software Engineer",
          content: "Class of 2026",
        }),
      ),
    ).toBe(false);
  });

  it("intern title wins jobTrack over new-grad wording", () => {
    const job = makeJob({
      ...us,
      title: "New Grad Software Engineer Intern",
      content: "Summer 2027 internship",
    });
    expect(matchesJob(job)).toBe(true);
    expect(jobTrack(job)).toBe("intern");
  });
});

describe("capBucket", () => {
  it("buckets intern titles as intern", () => {
    expect(
      capBucket(
        makeJob({
          title: "Software Engineer Intern",
          content: "Summer 2027 internship",
        }),
      ),
    ).toBe("intern");
  });

  it("buckets associate / SDE I as high-signal new-grad", () => {
    expect(capBucket(makeJob({ title: "Associate Software Engineer", content: "" }))).toBe(
      "high-signal-new-grad",
    );
    expect(capBucket(makeJob({ title: "SDE I", content: "" }))).toBe(
      "high-signal-new-grad",
    );
  });

  it("buckets yearless bare SWE as yearless-bare", () => {
    expect(capBucket(makeJob({ title: "Software Engineer", content: "" }))).toBe(
      "yearless-bare",
    );
  });
});

describe("allowEmptyContentAfterHydrate", () => {
  it("rejects yearless empty-body SWE", () => {
    expect(
      allowEmptyContentAfterHydrate(
        makeJob({ title: "Software Engineer", content: "" }),
      ),
    ).toBe(false);
  });

  it("keeps when the title itself is 2027-only", () => {
    expect(
      allowEmptyContentAfterHydrate(
        makeJob({ title: "Software Engineer, 2027", content: "" }),
      ),
    ).toBe(true);
  });

  it("keeps intern titles whose title has a 2027 season, including short year", () => {
    expect(
      allowEmptyContentAfterHydrate(
        makeJob({
          title: "Software Engineer Intern Fall '27",
          content: "",
        }),
      ),
    ).toBe(true);
  });

  it("ignores intern season that exists only in the body", () => {
    expect(
      allowEmptyContentAfterHydrate(
        makeJob({
          title: "Software Engineer Intern",
          content: "Summer 2027 internship",
        }),
      ),
    ).toBe(false);
  });
});

