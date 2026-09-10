import { PORTAL_ATS_KINDS } from "../types.js";
import { listAshbyJobs } from "./ashby.js";
import { listGreenhouseJobs } from "./greenhouse.js";
import { hydrateWorkdayContent, listWorkdayJobs } from "./workday.js";
import type { AtsAdapter, AtsKind, PortalAtsKind } from "./types.js";

const listNoPortalJobs: AtsAdapter["listJobs"] = async () => [];

function portalAdapters(): Record<PortalAtsKind, AtsAdapter> {
  return Object.fromEntries(
    PORTAL_ATS_KINDS.map((ats) => [
      ats,
      { ats, listJobs: listNoPortalJobs },
    ]),
  ) as Record<PortalAtsKind, AtsAdapter>;
}

function defaultRegistry(): Record<AtsKind, AtsAdapter> {
  return {
    greenhouse: { ats: "greenhouse", listJobs: listGreenhouseJobs },
    ashby: { ats: "ashby", listJobs: listAshbyJobs },
    workday: {
      ats: "workday",
      listJobs: listWorkdayJobs,
      hydrateContent: hydrateWorkdayContent,
    },
    ...portalAdapters(),
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
