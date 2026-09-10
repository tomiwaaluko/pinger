import { isUsLocation } from "./location.js";
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

function isInternship(normalized: string): boolean {
  return ["intern", "internship", "co op", "coop"].some((phrase) =>
    hasPhrase(normalized, phrase),
  );
}

function isNewGradTrack(normalized: string): boolean {
  return ["new grad", "newgrad", "new graduate", "graduate", "university"].some(
    (phrase) => hasPhrase(normalized, phrase),
  );
}

function extractFourDigitYears(normalized: string): number[] {
  return [...normalized.matchAll(/\b(20\d{2})\b/g)].map((match) =>
    Number(match[1]),
  );
}

function hasSpring2027(normalized: string): boolean {
  return (
    /\bspring\s*'?(?:2027|27)\b/.test(normalized) ||
    /\b(?:jan(?:uary)?)\s+may\s+2027\b/.test(normalized) ||
    /\bwinter\s*\/\s*spring\s*'?(?:2027|27)\b/.test(normalized)
  );
}

function hasCompetingNonSpringSeason(normalized: string): boolean {
  if (/\b(?:summer|fall|autumn)\b/.test(normalized)) {
    return true;
  }
  return (
    /\bwinter\b/.test(normalized) &&
    !/\bwinter\s*\/\s*spring\s*'?(?:2027|27)\b/.test(normalized)
  );
}

function titleAndContent(job: Job): string {
  return `${normalizeText(job.title)} ${normalizeText(job.content)}`.trim();
}

export function passesBaseGates(job: Job): boolean {
  if (!departmentGate(job.departments)) {
    return false;
  }
  const title = normalizeTitle(job.title);
  const role = ROLE_PHRASES.some((phrase) => hasPhrase(title, phrase));
  if (!role) {
    return false;
  }
  const blob = titleAndContent(job);
  const earlyCareer =
    isInternship(blob) ||
    isNewGradTrack(title) ||
    EARLY_CAREER_PHRASES.some((phrase) => hasPhrase(blob, phrase));
  if (!earlyCareer) {
    return false;
  }
  return isUsLocation(job.location);
}

export function passesSeasonYear(job: Job): boolean {
  const blob = titleAndContent(job);

  if (isInternship(blob)) {
    if (hasCompetingNonSpringSeason(blob)) {
      return false;
    }
    if (extractFourDigitYears(blob).some((year) => year !== 2027)) {
      return false;
    }
    return hasSpring2027(blob);
  }

  if (!isNewGradTrack(blob)) {
    return false;
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
