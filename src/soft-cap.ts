import { DISCORD_SOFT_CAP } from "./constants.js";
import { capBucket } from "./matcher.js";
import type { Job } from "./types.js";

export type BoundJob = { companyId: string; job: Job };

export function compareJobIds(a: string, b: string): number {
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return aNum - bNum;
  }
  return a.localeCompare(b);
}

function isPreferred(job: Job): boolean {
  const bucket = capBucket(job);
  return bucket === "intern" || bucket === "high-signal-new-grad";
}

function roundRobinFair(
  bound: BoundJob[],
  cap: number,
): { attempt: BoundJob[]; deferred: BoundJob[] } {
  const groups = new Map<string, BoundJob[]>();
  for (const item of bound) {
    const list = groups.get(item.companyId) ?? [];
    list.push(item);
    groups.set(item.companyId, list);
  }

  const companyIds = [...groups.keys()].sort();
  const queues = companyIds.map((id) => {
    const jobs = groups.get(id)!;
    jobs.sort((a, b) => compareJobIds(a.job.id, b.job.id));
    return jobs;
  });

  const attempt: BoundJob[] = [];

  while (attempt.length < cap && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      if (attempt.length >= cap) break;
      if (queue.length === 0) continue;
      attempt.push(queue.shift()!);
    }
  }

  return { attempt, deferred: queues.flat() };
}

export function selectAttemptWindow(
  bound: BoundJob[],
  cap: number = DISCORD_SOFT_CAP,
): { attempt: BoundJob[]; deferred: BoundJob[] } {
  const preferred = bound.filter((item) => isPreferred(item.job));
  const overflow = bound.filter((item) => !isPreferred(item.job));
  const first = roundRobinFair(preferred, cap);
  const second = roundRobinFair(overflow, cap - first.attempt.length);
  return {
    attempt: [...first.attempt, ...second.attempt],
    deferred: [...first.deferred, ...second.deferred],
  };
}
