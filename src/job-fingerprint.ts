import { normalizeTitle } from "./matcher.js";
import { compareJobIds } from "./soft-cap.js";
import type { Job } from "./types.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function locationPieces(location: string): string[] {
  const loc = normalizeTitle(location);
  if (!loc) {
    return [];
  }
  const withoutUs = loc.replace(/^us\s+/, "").trim();
  const pieces = new Set<string>([loc]);
  if (withoutUs) {
    pieces.add(withoutUs);
  }
  const city = withoutUs.replace(/,?\s*[a-z]{2}$/, "").trim();
  if (city.length >= 3) {
    pieces.add(city);
  }
  return [...pieces].sort((a, b) => b.length - a.length);
}

const TITLE_KEEP = new Set([
  "new",
  "college",
  "grad",
  "graduate",
  "software",
  "engineer",
  "engineering",
  "intern",
  "internship",
  "associate",
  "junior",
  "senior",
  "ai",
  "swe",
  "sde",
]);

function tidyTitle(value: string): string {
  const strippedCityState = value.replace(
    /\b([a-z][a-z .']*),\s*([a-z]{2})\b/g,
    (all, _city: string, suffix: string) =>
      TITLE_KEEP.has(suffix) ? all : " ",
  );
  const strippedCityYear = strippedCityState.replace(
    /,\s*([a-z]+(?:\s+[a-z]+)?)\s+(20\d{2})\b/g,
    (all, city: string, year: string) => {
      const first = city.split(/\s+/)[0];
      if (TITLE_KEEP.has(first)) {
        return all;
      }
      return ` ${year}`;
    },
  );
  return strippedCityYear.replace(/[\s,/]+/g, " ").trim();
}

export function canonicalJobTitle(title: string, location = ""): string {
  let normalized = normalizeTitle(title);
  for (const piece of locationPieces(location)) {
    normalized = normalized.replace(
      new RegExp(`\\b${escapeRegExp(piece)}\\b`, "g"),
      " ",
    );
  }
  return tidyTitle(normalized);
}

export function jobFingerprint(
  job: Pick<Job, "title"> & Partial<Pick<Job, "location">>,
): string {
  return canonicalJobTitle(job.title, job.location ?? "");
}

export type CollapsedJob = {
  job: Job;
  siblings: Job[];
};

export function collapseJobGroups(jobs: Job[]): CollapsedJob[] {
  const uniqueById: Job[] = [];
  const seenIds = new Set<string>();
  for (const job of jobs) {
    if (seenIds.has(job.id)) {
      continue;
    }
    seenIds.add(job.id);
    uniqueById.push(job);
  }

  const groups = new Map<string, Job[]>();
  for (const job of uniqueById) {
    const key = jobFingerprint(job);
    const list = groups.get(key) ?? [];
    list.push(job);
    groups.set(key, list);
  }

  const collapsed: CollapsedJob[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => compareJobIds(a.id, b.id));
    const locations = [
      ...new Set(group.map((job) => job.location).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
    const representative = group[0]!;
    collapsed.push({
      job:
        locations.length <= 1
          ? representative
          : { ...representative, location: locations.join("; ") },
      siblings: group,
    });
  }
  return collapsed;
}

export function collapseJobsByFingerprint(jobs: Job[]): Job[] {
  return collapseJobGroups(jobs).map((group) => group.job);
}
