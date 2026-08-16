import type { Job } from "./types.js";

const EARLY_CAREER_PHRASES = [
  "intern",
  "internship",
  "co op",
  "coop",
  "new grad",
  "newgrad",
  "university",
  "graduate",
  "grad",
] as const;

const ROLE_PHRASES = [
  "software engineer",
  "software engineering",
  "ai engineer",
  "swe",
] as const;

export function normalizeTitle(title: string): string {
  return title.trim().replace(/-/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function hasPhrase(normalized: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(normalized);
}

export function matchesJob(job: Job, expectedCategory: string): boolean {
  if (typeof job.careerSiteCategory !== "string") {
    return false;
  }
  if (
    job.careerSiteCategory.toLowerCase() !== expectedCategory.toLowerCase()
  ) {
    return false;
  }
  const title = normalizeTitle(job.title);
  const earlyCareer = EARLY_CAREER_PHRASES.some((phrase) =>
    hasPhrase(title, phrase),
  );
  const role = ROLE_PHRASES.some((phrase) => hasPhrase(title, phrase));
  return earlyCareer && role;
}
