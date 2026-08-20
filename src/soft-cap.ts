import { DISCORD_SOFT_CAP } from "./constants.js";
import type { Job } from "./types.js";

export type BoundJob = { companyId: string; job: Job };

export function selectAttemptWindow(
  bound: BoundJob[],
  cap: number = DISCORD_SOFT_CAP,
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
    jobs.sort((a, b) => Number(a.job.id) - Number(b.job.id));
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

  const deferred = queues.flat();

  return { attempt, deferred };
}
