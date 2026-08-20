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
});
