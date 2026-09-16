import { isUsLocation } from "./location.js";
import type { Job } from "./types.js";

const INTERN_PHRASES = ["intern", "internship", "co op", "coop"] as const;

const ROLE_PHRASES = [
  "software engineer",
  "software engineering",
  "ai engineer",
  "swe",
  "sde",
] as const;

const TITLE_DENY_TOKENS = [
  "senior",
  "sr",
  "staff",
  "principal",
  "lead",
  "manager",
  "director",
  "ii",
  "iii",
  "iv",
] as const;

const ROLE_LEVEL_DENY =
  /\b(?:engineer|sde|swe)(?:\s+[234]|[\s,]+(?:l[234]|level\s+[234]))\b/;

const HIGH_SIGNAL_PHRASES = [
  "junior",
  "entry level",
  "early career",
  "early in career",
  "associate",
  "new grad",
  "college grad",
  "university grad",
  "fresh grad",
  "engineer 1",
  "engineer i",
  "sde 1",
  "sde i",
] as const;

const DEPT_ALLOW = ["engineering", "software", "swe", "ai"] as const;
const DEPT_DENY = [
  "sales",
  "solution",
  "solutions",
  "field",
  "non",
] as const;

export type JobTrack = "intern" | "new-grad";
export type CapBucket = "intern" | "high-signal-new-grad" | "yearless-bare";

export function normalizeTitle(title: string): string {
  return normalizeText(title);
}

function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/[\u2010-\u2015-]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hasPhrase(normalized: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(normalized);
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

export function hasRolePhrase(title: string): boolean {
  const normalized = normalizeTitle(title);
  return ROLE_PHRASES.some((phrase) => hasPhrase(normalized, phrase));
}

function titleDenied(title: string): boolean {
  const normalized = normalizeTitle(title);
  if (TITLE_DENY_TOKENS.some((tok) => hasPhrase(normalized, tok))) {
    return true;
  }
  return ROLE_LEVEL_DENY.test(normalized);
}

export function isInternTitle(job: Job): boolean {
  const title = normalizeTitle(job.title);
  return INTERN_PHRASES.some((phrase) => hasPhrase(title, phrase));
}

export function capBucket(job: Job): CapBucket {
  if (isInternTitle(job)) {
    return "intern";
  }
  const title = normalizeTitle(job.title);
  if (HIGH_SIGNAL_PHRASES.some((phrase) => hasPhrase(title, phrase))) {
    return "high-signal-new-grad";
  }
  return "yearless-bare";
}

/** After Workday/NVIDIA hydrate, empty bodies must not yearless-keep. Title-only 2027 / intern season may still keep. */
export function allowEmptyContentAfterHydrate(job: Job): boolean {
  const title = normalizeTitle(job.title);
  if (isInternTitle(job)) {
    return has2027InternSeason(title);
  }
  const years = extractFourDigitYears(title);
  if (years.length === 0) {
    return false;
  }
  return years.every((year) => year === 2027);
}

function extractFourDigitYears(normalized: string): number[] {
  return [...normalized.matchAll(/\b(20\d{2})\b/g)].map((match) =>
    Number(match[1]),
  );
}

function extractInternSeasonYears(normalized: string): number[] {
  return [
    ...normalized.matchAll(
      /\b(?:spring|summer|fall|autumn|winter)\s*['’]?(\d{2}|\d{4})\b/g,
    ),
  ].map((match) => {
    const value = Number(match[1]);
    return match[1].length === 2 ? 2000 + value : value;
  });
}

function has2027InternSeason(normalized: string): boolean {
  return (
    extractInternSeasonYears(normalized).includes(2027) ||
    /\b(?:jan(?:uary)?|winter)\s+may\s+2027\b/.test(normalized) ||
    /\b(?:spring|summer|fall|autumn|winter)\s*\/\s*(?:spring|summer|fall|autumn|winter)\s*'?(?:2027|27)\b/.test(
      normalized,
    )
  );
}

function titleAndContent(job: Job): string {
  return `${normalizeText(job.title)} ${normalizeText(job.content)}`.trim();
}

/** Which Discord channel a job routes to. Only meaningful for jobs that already pass matchesJob. */
export function jobTrack(job: Job): JobTrack | null {
  if (isInternTitle(job)) {
    return "intern";
  }
  if (hasRolePhrase(job.title) && !titleDenied(job.title)) {
    return "new-grad";
  }
  return null;
}

export function passesBaseGates(job: Job): boolean {
  if (!departmentGate(job.departments)) {
    return false;
  }
  if (!hasRolePhrase(job.title)) {
    return false;
  }
  if (titleDenied(job.title)) {
    return false;
  }
  return isUsLocation(job.location);
}

export function passesSeasonYear(job: Job): boolean {
  const blob = titleAndContent(job);

  if (isInternTitle(job)) {
    if (extractInternSeasonYears(blob).some((year) => year !== 2027)) {
      return false;
    }
    if (extractFourDigitYears(blob).some((year) => year !== 2027)) {
      return false;
    }
    return has2027InternSeason(blob);
  }

  const years = extractFourDigitYears(blob);
  if (years.length === 0) {
    return true;
  }
  if (years.some((year) => year !== 2027)) {
    return false;
  }
  return years.includes(2027);
}

export function matchesJob(job: Job): boolean {
  return passesBaseGates(job) && passesSeasonYear(job);
}
