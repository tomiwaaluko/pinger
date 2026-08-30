import { listAshbyJobs } from "./ashby.js";
import { listGreenhouseJobs } from "./greenhouse.js";
import { hydrateWorkdayContent, listWorkdayJobs } from "./workday.js";
import type { AtsAdapter, AtsKind } from "./types.js";

const notImplemented = (ats: string): AtsAdapter["listJobs"] => async () => {
  throw new Error(`${ats} adapter not implemented`);
};

function defaultRegistry(): Record<AtsKind, AtsAdapter> {
  return {
    greenhouse: { ats: "greenhouse", listJobs: listGreenhouseJobs },
    ashby: { ats: "ashby", listJobs: listAshbyJobs },
    workday: {
      ats: "workday",
      listJobs: listWorkdayJobs,
      hydrateContent: hydrateWorkdayContent,
    },
  };
}

let registry: Record<AtsKind, AtsAdapter> = defaultRegistry();

export function getAdapter(ats: AtsKind): AtsAdapter {
  return registry[ats];
}

export function setAdapterRegistryForTests(
  next: Partial<Record<AtsKind, AtsAdapter>>,
): void {
  registry = { ...registry, ...next };
}

export function resetAdapterRegistryForTests(): void {
  registry = defaultRegistry();
}
