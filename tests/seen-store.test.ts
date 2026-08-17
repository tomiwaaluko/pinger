import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isFirstRun,
  newMatchingJobs,
  readSeen,
  recordJob,
  writeSeen,
} from "../src/seen-store.js";
import { makeJob } from "./helpers.js";

const intern = makeJob({
  id: "5474915004",
  title: "Software Engineer Intern",
});
const other = makeJob({
  id: "6134374004",
  title: "Member of the Technical Staff, Internal Agent ",
});

describe("isFirstRun", () => {
  it("treats a missing company key as first run", () => {
    expect(isFirstRun({}, "vercel")).toBe(true);
  });

  it("does not treat an existing empty object as a first run", () => {
    expect(isFirstRun({ vercel: {} }, "vercel")).toBe(false);
  });
});

describe("newMatchingJobs", () => {
  it("reports a new id after an empty snapshot", () => {
    const news = newMatchingJobs([intern], {});
    expect(news.map((job) => job.id)).toEqual(["5474915004"]);
  });

  it("does not report an id that is already seen, even if it disappeared and returned", () => {
    const seen = {
      "5474915004": {
        title: "Software Engineer Intern",
        firstSeenAt: "2026-08-16T12:00:00.000Z",
      },
    };
    expect(newMatchingJobs([intern], seen)).toEqual([]);
  });
});

describe("readSeen / writeSeen / recordJob", () => {
  it("returns {} when the file is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pinger-seen-"));
    await expect(readSeen(join(dir, "seen-jobs.json"))).resolves.toEqual({});
  });

  it("first run with zero matches writes vercel: {}", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pinger-seen-"));
    const path = join(dir, "seen-jobs.json");
    const store: Record<string, Record<string, never>> = {};
    store.vercel = {};
    await writeSeen(path, store);
    const loaded = await readSeen(path);
    expect(loaded).toEqual({ vercel: {} });
    expect(isFirstRun(loaded, "vercel")).toBe(false);
    expect(newMatchingJobs([intern], loaded.vercel)).toHaveLength(1);
  });

  it("first run with some ids persists them nested by company then greenhouse id", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pinger-seen-"));
    const path = join(dir, "seen-jobs.json");
    const store = {};
    recordJob(store, "vercel", intern, "2026-08-16T12:00:00.000Z");
    recordJob(store, "vercel", other, "2026-08-16T12:00:00.000Z");
    await writeSeen(path, store);
    const loaded = await readSeen(path);
    expect(loaded.vercel["5474915004"]).toEqual({
      title: "Software Engineer Intern",
      firstSeenAt: "2026-08-16T12:00:00.000Z",
    });
    expect(loaded.vercel["6134374004"].title).toBe(
      "Member of the Technical Staff, Internal Agent ",
    );
    expect(newMatchingJobs([intern, other], loaded.vercel)).toEqual([]);
  });

  it("rejects malformed JSON and a non-object company map", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pinger-seen-"));
    const path = join(dir, "seen-jobs.json");
    writeFileSync(path, "not-json");
    await expect(readSeen(path)).rejects.toThrow();
    writeFileSync(path, "[]");
    await expect(readSeen(path)).rejects.toThrow(/object/);
    writeFileSync(path, '{"vercel": null}');
    await expect(readSeen(path)).rejects.toThrow(/vercel/);
  });
});
