import { listAshbyJobs } from "./ashby.js";
import { listGreenhouseJobs } from "./greenhouse.js";
import { hydrateWorkdayContent, listWorkdayJobs } from "./workday.js";
import type { AtsAdapter, AtsKind } from "./types.js";

const listNoPortalJobs: AtsAdapter["listJobs"] = async () => [];

function defaultRegistry(): Record<AtsKind, AtsAdapter> {
  return {
    greenhouse: { ats: "greenhouse", listJobs: listGreenhouseJobs },
    ashby: { ats: "ashby", listJobs: listAshbyJobs },
    workday: {
      ats: "workday",
      listJobs: listWorkdayJobs,
      hydrateContent: hydrateWorkdayContent,
    },
    google: { ats: "google", listJobs: listNoPortalJobs },
    meta: { ats: "meta", listJobs: listNoPortalJobs },
    microsoft: { ats: "microsoft", listJobs: listNoPortalJobs },
    amazon: { ats: "amazon", listJobs: listNoPortalJobs },
    apple: { ats: "apple", listJobs: listNoPortalJobs },
    nvidia: { ats: "nvidia", listJobs: listNoPortalJobs },
    openai: { ats: "openai", listJobs: listNoPortalJobs },
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
