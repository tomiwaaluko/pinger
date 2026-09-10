import { PORTAL_ATS_KINDS } from "../types.js";
import { listAmazonJobs } from "./amazon.js";
import { listAshbyJobs } from "./ashby.js";
import { listGreenhouseJobs } from "./greenhouse.js";
import { hydrateNvidiaContent, listNvidiaJobs } from "./nvidia.js";
import { listOpenAiJobs } from "./openai.js";
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
  const registry: Record<AtsKind, AtsAdapter> = {
    greenhouse: { ats: "greenhouse", listJobs: listGreenhouseJobs },
    ashby: { ats: "ashby", listJobs: listAshbyJobs },
    workday: {
      ats: "workday",
      listJobs: listWorkdayJobs,
      hydrateContent: hydrateWorkdayContent,
    },
    ...portalAdapters(),
  };
  registry.amazon = { ats: "amazon", listJobs: listAmazonJobs };
  registry.nvidia = {
    ats: "nvidia",
    listJobs: listNvidiaJobs,
    hydrateContent: hydrateNvidiaContent,
  };
  registry.openai = { ats: "openai", listJobs: listOpenAiJobs };
  return registry;
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
