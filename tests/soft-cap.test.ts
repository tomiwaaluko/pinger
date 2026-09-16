import { describe, expect, it } from "vitest";
import { selectAttemptWindow } from "../src/soft-cap.js";
import { makeJob } from "./helpers.js";

describe("selectAttemptWindow", () => {
  it("round-robins so later company ids are not starved", () => {
    const aaa = Array.from({ length: 40 }, (_, i) => ({
      companyId: "aaa",
      job: makeJob({ id: String(i + 1) }),
    }));
    const zzz = [
      { companyId: "zzz", job: makeJob({ id: "100" }) },
      { companyId: "zzz", job: makeJob({ id: "101" }) },
    ];
    const { attempt, deferred } = selectAttemptWindow([...aaa, ...zzz], 25);
    expect(attempt).toHaveLength(25);
    expect(attempt.filter((x) => x.companyId === "zzz")).toHaveLength(2);
    expect(deferred.length).toBe(40 + 2 - 25);
  });

  it("sorts company ids even when later ids appear first in input", () => {
    const zzz = [
      { companyId: "zzz", job: makeJob({ id: "1" }) },
      { companyId: "zzz", job: makeJob({ id: "2" }) },
    ];
    const aaa = Array.from({ length: 40 }, (_, i) => ({
      companyId: "aaa",
      job: makeJob({ id: String(i + 10) }),
    }));
    const { attempt } = selectAttemptWindow([...zzz, ...aaa], 25);
    expect(attempt.filter((x) => x.companyId === "zzz")).toHaveLength(2);
    expect(attempt[0]?.companyId).toBe("aaa");
  });

  it("sorts opaque Workday ids lexicographically", () => {
    const jobs = [
      { companyId: "boeing", job: makeJob({ id: "JR100" }) },
      { companyId: "boeing", job: makeJob({ id: "JR20" }) },
    ];
    const { attempt } = selectAttemptWindow(jobs, 2);
    expect(attempt.map((item) => item.job.id)).toEqual(["JR100", "JR20"]);
  });

  it("sorts numeric ids numerically", () => {
    const jobs = [
      { companyId: "aaa", job: makeJob({ id: "10" }) },
      { companyId: "aaa", job: makeJob({ id: "2" }) },
    ];
    const { attempt } = selectAttemptWindow(jobs, 2);
    expect(attempt.map((item) => item.job.id)).toEqual(["2", "10"]);
  });
});

describe("selectAttemptWindow cap preference", () => {
  it("fills intern and high-signal new-grad before yearless bare SWE", () => {
    const overflow = Array.from({ length: 40 }, (_, i) => ({
      companyId: "aaa",
      job: makeJob({
        id: String(i + 1),
        title: "Software Engineer",
        content: "",
      }),
    }));
    const preferred = [
      {
        companyId: "zzz",
        job: makeJob({
          id: "100",
          title: "Software Engineer Intern",
          content: "Summer 2027 internship",
        }),
      },
      {
        companyId: "zzz",
        job: makeJob({
          id: "101",
          title: "Associate Software Engineer",
          content: "",
        }),
      },
    ];
    const { attempt, deferred } = selectAttemptWindow(
      [...overflow, ...preferred],
      25,
    );
    expect(attempt).toHaveLength(25);
    expect(attempt.filter((item) => item.companyId === "zzz")).toHaveLength(2);
    expect(
      attempt.some((item) => item.job.title === "Software Engineer Intern"),
    ).toBe(true);
    expect(
      attempt.some((item) => item.job.title === "Associate Software Engineer"),
    ).toBe(true);
    expect(deferred).toHaveLength(17);
    expect(deferred.every((item) => item.job.title === "Software Engineer")).toBe(
      true,
    );
  });

  it("does not let yearless-bare steal slots from another company's intern", () => {
    const overflow = Array.from({ length: 40 }, (_, i) => ({
      companyId: "aaa",
      job: makeJob({
        id: String(i + 1),
        title: "Software Engineer",
        content: "",
      }),
    }));
    const internOnly = [
      {
        companyId: "zzz",
        job: makeJob({
          id: "100",
          title: "Software Engineer Intern",
          content: "Fall 2027 internship",
        }),
      },
    ];
    const { attempt } = selectAttemptWindow([...overflow, ...internOnly], 25);
    expect(attempt.filter((item) => item.companyId === "zzz")).toHaveLength(1);
    expect(attempt[0]?.companyId).toBe("zzz");
  });

  it("round-robins preferred jobs across companies before overflow", () => {
    const internsAaa = Array.from({ length: 40 }, (_, i) => ({
      companyId: "aaa",
      job: makeJob({
        id: String(i + 1),
        title: "Software Engineer Intern",
        content: "Spring 2027 internship",
      }),
    }));
    const juniorZzz = [
      {
        companyId: "zzz",
        job: makeJob({
          id: "100",
          title: "Junior Software Engineer",
          content: "",
        }),
      },
      {
        companyId: "zzz",
        job: makeJob({
          id: "101",
          title: "Junior Software Engineer",
          content: "",
        }),
      },
    ];
    const { attempt } = selectAttemptWindow([...internsAaa, ...juniorZzz], 25);
    expect(attempt.filter((item) => item.companyId === "zzz")).toHaveLength(2);
  });
});
