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

export function newMatchingJobs(
  matched: Job[],
  companySeen: Record<string, SeenJob>,
): Job[] {
  return matched.filter((job) => !(job.id in companySeen));
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
