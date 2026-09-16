import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { stringify } from "yaml";
import { getAdapter } from "./adapters/index.js";
import type { AtsKind } from "./adapters/types.js";
import { loadConfig } from "./config.js";
import { REQUEST_TIMEOUT_MS } from "./constants.js";
import { hasRolePhrase, jobTrack, matchesJob } from "./matcher.js";
import { isStubPortalAtsKind, type CompanyConfig, type Job } from "./types.js";

export const DEFAULT_LISTING_URLS = {
  newGrad:
    "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
  intern:
    "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
} as const;

const NEVER_ENABLE_IDS = new Set(["google", "meta", "microsoft", "apple"]);
const FETCHABLE_ATS = new Set([
  "greenhouse",
  "ashby",
  "workday",
  "amazon",
  "nvidia",
  "openai",
]);

export type CoverageClass =
  | "would-ping"
  | "matcher-drop"
  | "disabled"
  | "custom-no-adapter"
  | "missing"
  | "ambiguous";

export type SimplifyCoverageOptions = {
  fetch: typeof fetch;
  githubToken?: string;
  companiesYamlPath: string;
  reportPath: string;
  suggestedPath: string;
};

export type SimplifyCoverageResult = {
  exitCode: number;
  skippedInvalid: number;
};

type Listing = {
  id?: unknown;
  company_name?: unknown;
  title?: unknown;
  url?: unknown;
  locations?: unknown;
  category?: unknown;
  active?: unknown;
  is_visible?: unknown;
  terms?: unknown;
};

type JoinHit =
  | { kind: "missing" }
  | { kind: "ambiguous" }
  | { kind: "hit"; row: CompanyConfig };

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\b(?:inc|llc|ltd|corp|corporation)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugFromNormalizedName(normalized: string): string {
  const slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "company";
}

export function adapterCanFetch(ats: string): boolean {
  if (!FETCHABLE_ATS.has(ats) || isStubPortalAtsKind(ats)) {
    return false;
  }
  return getAdapter(ats as AtsKind) != null;
}

function isSweEquivalent(listing: Listing): boolean {
  const category = String(listing.category ?? "").toLowerCase();
  if (category === "software engineering" || category === "software") {
    return true;
  }
  return hasRolePhrase(String(listing.title ?? ""));
}

function syntheticJob(listing: Listing): Job {
  const terms = Array.isArray(listing.terms)
    ? listing.terms.map(String).join(" ")
    : "";
  const locations = Array.isArray(listing.locations)
    ? listing.locations.map(String).join("; ")
    : "";
  return {
    id: String(listing.id ?? listing.url ?? ""),
    title: String(listing.title ?? ""),
    location: locations,
    careerSiteCategory: null,
    departments: ["Engineering"],
    absoluteUrl: String(listing.url ?? ""),
    content: terms,
  };
}

function buildJoinIndex(
  companies: CompanyConfig[],
): Map<string, CompanyConfig[]> {
  const index = new Map<string, CompanyConfig[]>();
  for (const row of companies) {
    const key = normalizeCompanyName(row.name);
    const list = index.get(key) ?? [];
    list.push(row);
    index.set(key, list);
  }
  return index;
}

function joinListing(
  listing: Listing,
  index: Map<string, CompanyConfig[]>,
): JoinHit {
  const key = normalizeCompanyName(String(listing.company_name ?? ""));
  const rows = index.get(key) ?? [];
  if (rows.length === 0) return { kind: "missing" };
  if (rows.length !== 1) return { kind: "ambiguous" };
  return { kind: "hit", row: rows[0] };
}

function classify(join: JoinHit, job: Job): CoverageClass {
  if (join.kind === "ambiguous") return "ambiguous";
  if (join.kind === "missing") return "missing";

  const row = join.row;
  if (NEVER_ENABLE_IDS.has(row.id) || !adapterCanFetch(row.ats)) {
    return "custom-no-adapter";
  }
  if (!row.enabled) return "disabled";
  return matchesJob(job) ? "would-ping" : "matcher-drop";
}

async function fetchListingsJson(
  url: string,
  fetchImpl: typeof fetch,
  githubToken: string | undefined,
): Promise<unknown> {
  if (
    url !== DEFAULT_LISTING_URLS.newGrad &&
    url !== DEFAULT_LISTING_URLS.intern
  ) {
    throw new Error("listings url is not allowlisted");
  }

  const first = await fetchImpl(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  let res = first;
  if ((first.status === 429 || first.status === 403) && githubToken) {
    res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${githubToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }
  if (!res.ok) {
    throw new Error(`listings fetch ${res.status}`);
  }
  return res.json();
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "/").replace(/\r?\n/g, " ");
}

function renderReport(
  rows: Array<{
    source: string;
    company: string;
    title: string;
    url: string;
    className: CoverageClass;
    track: string;
  }>,
): string {
  const counts = new Map<string, { newGrad: number; intern: number }>();
  for (const row of rows) {
    const current = counts.get(row.className) ?? { newGrad: 0, intern: 0 };
    if (row.source === "new-grad") {
      current.newGrad += 1;
    } else {
      current.intern += 1;
    }
    counts.set(row.className, current);
  }

  const lines = [
    "# Simplify coverage",
    "",
    "Departments are assumed Engineering and bodies are not fetched — checklist matcher-pass is not a promise the live board would ping.",
    "",
    "| class | new-grad | intern | total |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const className of [
    "would-ping",
    "matcher-drop",
    "disabled",
    "custom-no-adapter",
    "missing",
    "ambiguous",
  ] as const) {
    const c = counts.get(className) ?? { newGrad: 0, intern: 0 };
    lines.push(
      `| ${className} | ${c.newGrad} | ${c.intern} | ${c.newGrad + c.intern} |`,
    );
  }

  lines.push(
    "",
    "| source | company | title | url | class | jobTrack |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const row of rows) {
    lines.push(
      `| ${row.source} | ${escapeTableCell(row.company)} | ${escapeTableCell(row.title)} | ${escapeTableCell(row.url)} | ${row.className} | ${row.track} |`,
    );
  }
  lines.push("");

  return lines.join("\n");
}

export async function runSimplifyCoverage(
  opts: SimplifyCoverageOptions,
): Promise<SimplifyCoverageResult> {
  try {
    const [newGradRaw, internRaw] = await Promise.all([
      fetchListingsJson(
        DEFAULT_LISTING_URLS.newGrad,
        opts.fetch,
        opts.githubToken,
      ),
      fetchListingsJson(DEFAULT_LISTING_URLS.intern, opts.fetch, opts.githubToken),
    ]);
    if (!Array.isArray(newGradRaw) || !Array.isArray(internRaw)) {
      return { exitCode: 2, skippedInvalid: 0 };
    }

    const config = loadConfig(opts.companiesYamlPath);
    const index = buildJoinIndex(config.companies);
    let skippedInvalid = 0;
    const reportRows: Array<{
      source: string;
      company: string;
      title: string;
      url: string;
      className: CoverageClass;
      track: string;
    }> = [];
    const enableIds = new Set<string>();
    const addById = new Map<
      string,
      { id: string; name: string; ats: "custom"; enabled: false }
    >();

    const ingest = (source: "new-grad" | "intern", listings: unknown[]) => {
      for (const raw of listings) {
        const listing = (raw ?? {}) as Listing;
        if (
          typeof listing.company_name !== "string" ||
          listing.company_name.trim() === "" ||
          typeof listing.title !== "string" ||
          listing.title.trim() === "" ||
          typeof listing.url !== "string" ||
          listing.url.trim() === ""
        ) {
          skippedInvalid += 1;
          continue;
        }
        if (listing.active !== true || listing.is_visible !== true) continue;
        if (!isSweEquivalent(listing)) continue;

        const job = syntheticJob(listing);
        const joined = joinListing(listing, index);
        const className = classify(joined, job);
        const track =
          className === "would-ping" || className === "matcher-drop"
            ? (jobTrack(job) ?? "n/a")
            : "n/a";
        reportRows.push({
          source,
          company: listing.company_name,
          title: listing.title,
          url: listing.url,
          className,
          track,
        });

        if (className === "disabled" && joined.kind === "hit") {
          enableIds.add(joined.row.id);
        }
        if (className === "missing") {
          const id = slugFromNormalizedName(
            normalizeCompanyName(listing.company_name),
          );
          if (!addById.has(id)) {
            addById.set(id, {
              id,
              name: listing.company_name,
              ats: "custom",
              enabled: false,
            });
          }
        }
      }
    };

    ingest("new-grad", newGradRaw);
    ingest("intern", internRaw);

    mkdirSync(dirname(opts.reportPath), { recursive: true });
    mkdirSync(dirname(opts.suggestedPath), { recursive: true });
    writeFileSync(opts.reportPath, renderReport(reportRows));
    writeFileSync(
      opts.suggestedPath,
      stringify({
        enable: [...enableIds].sort(),
        add: [...addById.values()].sort((a, b) => a.id.localeCompare(b.id)),
      }),
    );
    return { exitCode: 0, skippedInvalid };
  } catch {
    return { exitCode: 2, skippedInvalid: 0 };
  }
}
