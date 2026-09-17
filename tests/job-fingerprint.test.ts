import { describe, expect, it } from "vitest";
import {
  canonicalJobTitle,
  collapseJobsByFingerprint,
  jobFingerprint,
} from "../src/job-fingerprint.js";
import { makeJob } from "./helpers.js";

describe("canonicalJobTitle", () => {
  it("collapses Visa multi-location new-grad titles to one fingerprint", () => {
    const bellevue = canonicalJobTitle(
      "Software Engineer, New College Grad, Bellevue - 2027",
      "US - Bellevue, WA",
    );
    const foster = canonicalJobTitle(
      "Software Engineer, New College Grad - 2027 Foster City, CA",
      "US - Foster City, CA",
    );
    const austin = canonicalJobTitle(
      "Software Engineer, New College Grad - 2027, Austin, TX",
      "US - Austin, TX",
    );
    expect(bellevue).toBe(foster);
    expect(foster).toBe(austin);
    expect(bellevue).toBe("software engineer new college grad 2027");
  });

  it("does not collapse distinct role titles", () => {
    expect(
      canonicalJobTitle("Software Engineer, Backend", "San Francisco, CA"),
    ).not.toBe(
      canonicalJobTitle("Software Engineer, Frontend", "San Francisco, CA"),
    );
  });
});

describe("collapseJobsByFingerprint", () => {
  it("keeps one posting when the same Workday id repeats", () => {
    const copies = Array.from({ length: 12 }, () =>
      makeJob({
        id: "REF088543W",
        title: "Software Engineer, New College Grad - 2027 Foster City, CA",
        location: "US - Foster City, CA",
      }),
    );
    const collapsed = collapseJobsByFingerprint(copies);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.id).toBe("REF088543W");
  });

  it("keeps one posting for the same role across cities and joins locations", () => {
    const jobs = [
      makeJob({
        id: "REF088530W",
        title: "Software Engineer, New College Grad, Bellevue - 2027",
        location: "US - Bellevue, WA",
      }),
      makeJob({
        id: "REF088543W",
        title: "Software Engineer, New College Grad - 2027 Foster City, CA",
        location: "US - Foster City, CA",
      }),
      makeJob({
        id: "REF088586W",
        title: "Software Engineer, New College Grad - 2027, Austin, TX",
        location: "US - Austin, TX",
      }),
    ];
    const collapsed = collapseJobsByFingerprint(jobs);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.id).toBe("REF088530W");
    expect(collapsed[0]?.location).toBe(
      "US - Austin, TX; US - Bellevue, WA; US - Foster City, CA",
    );
  });
});

describe("jobFingerprint", () => {
  it("matches stored Visa titles without a location field", () => {
    const fromSeen = jobFingerprint({
      title: "Software Engineer, New College Grad, Bellevue - 2027",
      location: "",
    });
    const austin = jobFingerprint({
      title: "Software Engineer, New College Grad - 2027, Austin, TX",
      location: "US - Austin, TX",
    });
    expect(fromSeen).toBe(austin);
  });
});
