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

const DEPT_ALLOW = ["engineering", "software", "swe", "ai"] as const;
const DEPT_DENY = [
  "sales",
  "solution",
  "solutions",
  "field",
  "non",
] as const;

export function normalizeTitle(title: string): string {
  return title.trim().replace(/-/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function hasPhrase(normalized: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(normalized);
}

function departmentGate(departments: string[]): boolean {
  if (!Array.isArray(departments) || departments.length === 0) {
    return false;
  }
  const normalized = departments.map((d) => normalizeTitle(d));
  if (normalized.some((d) => DEPT_DENY.some((tok) => hasPhrase(d, tok)))) {
    return false;
  }
  return normalized.some((d) => DEPT_ALLOW.some((tok) => hasPhrase(d, tok)));
}

export function matchesJob(job: Job): boolean {
  if (!departmentGate(job.departments)) {
    return false;
  }
  const title = normalizeTitle(job.title);
  const earlyCareer = EARLY_CAREER_PHRASES.some((phrase) =>
    hasPhrase(title, phrase),
  );
  const role = ROLE_PHRASES.some((phrase) => hasPhrase(title, phrase));
  return earlyCareer && role;
}
