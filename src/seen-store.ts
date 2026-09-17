import {
  collapseJobGroups,
  jobFingerprint,
  type CollapsedJob,
} from "./job-fingerprint.js";
import { readFile, writeFile } from "node:fs/promises";
import type { Job, SeenJob, SeenStore } from "./types.js";

export async function readSeen(seenPath: string): Promise<SeenStore> {
  try {
    const raw = await readFile(seenPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("seen-jobs.json must be an object");
    }
    const store = parsed as SeenStore;
    for (const [companyId, value] of Object.entries(store)) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(
          `seen-jobs.json company ${companyId} must be an object`,
        );
      }
    }
    return store;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

export async function writeSeen(
  seenPath: string,
  store: SeenStore,
): Promise<void> {
  await writeFile(seenPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function isFirstRun(store: SeenStore, companyId: string): boolean {
  return store[companyId] === undefined;
}

export function newMatchingJobGroups(
  matched: Job[],
  companySeen: Record<string, SeenJob>,
): CollapsedJob[] {
  const seenFingerprints = new Set(
    Object.values(companySeen).map((entry) =>
      jobFingerprint({ title: entry.title }),
    ),
  );
  return collapseJobGroups(matched).filter(({ job, siblings }) => {
    if (siblings.some((sibling) => sibling.id in companySeen)) {
      return false;
    }
    if (job.id in companySeen) {
      return false;
    }
    const original = siblings[0] ?? job;
    return !seenFingerprints.has(jobFingerprint(original));
  });
}

export function newMatchingJobs(
  matched: Job[],
  companySeen: Record<string, SeenJob>,
): Job[] {
  return newMatchingJobGroups(matched, companySeen).map((group) => group.job);
}

export function recordJob(
  store: SeenStore,
  companyId: string,
  job: Job,
  firstSeenAt: string,
): void {
  if (store[companyId] === undefined) {
    store[companyId] = {};
  }
  store[companyId][job.id] = { title: job.title, firstSeenAt };
}
