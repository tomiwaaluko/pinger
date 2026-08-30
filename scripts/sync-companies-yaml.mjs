#!/usr/bin/env node
/**
 * Merge refined targets + probe TSVs into companies.yaml.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REFINED = join(ROOT, "data", "target-companies-refined.yaml");
const COMPANIES = join(ROOT, "companies.yaml");
const ASHBY_TSV = join(ROOT, "data", "ashby-boards.tsv");
const WORKDAY_TSV = join(ROOT, "data", "workday-boards.tsv");

const ASHBY_WAVE = new Set([
  "applied-intuition",
  "ashby",
  "clerk",
  "cognition",
  "cursor",
  "linear",
  "mistral-ai",
  "notion",
  "perplexity",
  "posthog",
  "ramp",
  "railway",
  "replit",
  "supabase",
]);

const WORKDAY_TIER1 = new Set([
  "accenture",
  "boeing",
  "cisco",
  "citi",
  "ebay",
  "expedia",
  "intel",
  "mastercard",
  "paypal",
  "samsung",
  "target",
  "visa",
]);

// Slugs that share a Workday site with another canonical slug.
const WORKDAY_SKIP_SLUGS = new Set(["raytheon"]);

// Ashby slugs that share a board with a canonical slug.
const ASHBY_CANONICAL_ALIASES = {
  anysphere: "cursor",
};

function readTsv(path) {
  try {
    const lines = readFileSync(path, "utf8").trim().split("\n");
    const rows = new Map();
    for (const line of lines.slice(1)) {
      const [slug, ...rest] = line.split("\t");
      rows.set(slug, rest);
    }
    return rows;
  } catch {
    return new Map();
  }
}

function parseRefined() {
  const text = readFileSync(REFINED, "utf8");
  const blocks = text.split(/\n  - slug:/).slice(1);
  const companies = [];
  for (const block of blocks) {
    const slug = block.match(/^ ([^\n]+)/)?.[1]?.trim()?.replace(/"/g, "");
    const name = block.match(/name: "([^"]+)"/)?.[1];
    const ats = block.match(/ats: ([^\n]+)/)?.[1]?.trim();
    const boardToken = block.match(/boardToken: "([^"]+)"/)?.[1];
    const tier = parseInt(block.match(/tier: (\d)/)?.[1] || "3", 10);
    const earlyCareer = block.includes("earlyCareerVerified: true");
    if (!slug || !name || !ats || ats === "unknown") continue;
    companies.push({ slug, name, ats, boardToken, tier, earlyCareer });
  }
  return companies;
}

function loadExisting() {
  const data = parse(readFileSync(COMPANIES, "utf8"));
  const byId = new Map();
  for (const row of data.companies ?? []) {
    byId.set(row.id, row);
  }
  return { data, byId };
}

const resetEnabled = process.argv.includes("--reset-enabled");
const enableWaves = new Set(
  process.argv
    .filter((arg) => arg.startsWith("--enable-wave="))
    .map((arg) => arg.split("=")[1]),
);

const ashbyRows = readTsv(ASHBY_TSV);
const workdayRows = readTsv(WORKDAY_TSV);
const refined = parseRefined();
const { data, byId } = loadExisting();

const greenhouseTokenOwner = new Map();
for (const row of byId.values()) {
  if (row.ats === "greenhouse" && row.boardToken) {
    greenhouseTokenOwner.set(row.boardToken, row.id);
  }
}

const workdaySiteOwner = new Map();
for (const row of byId.values()) {
  if (row.ats === "workday" && row.workday) {
    workdaySiteOwner.set(
      `${row.workday.host}\0${row.workday.site}`,
      row.id,
    );
  }
}

const ashbyBoardOwner = new Map();
for (const row of byId.values()) {
  if (row.ats === "ashby" && row.boardName) {
    ashbyBoardOwner.set(row.boardName.toLowerCase(), row.id);
  }
}

for (const company of refined) {
  const existing = byId.get(company.slug);
  let row;

  if (company.ats === "greenhouse" && company.boardToken) {
    const owner = greenhouseTokenOwner.get(company.boardToken);
    if (owner && owner !== company.slug) {
      continue;
    }
    row = {
      id: company.slug,
      name: company.name,
      ats: "greenhouse",
      boardToken: company.boardToken,
      enabled: existing?.enabled ?? false,
    };
  } else if (company.ats === "ashby") {
    if (ASHBY_CANONICAL_ALIASES[company.slug]) {
      byId.delete(company.slug);
      continue;
    }
    const [boardName, status] = ashbyRows.get(company.slug) ?? [];
    if (!boardName || status !== "ok") continue;
    const owner = ashbyBoardOwner.get(boardName.toLowerCase());
    if (owner && owner !== company.slug) {
      byId.delete(company.slug);
      continue;
    }
    row = {
      id: company.slug,
      name: company.name,
      ats: "ashby",
      boardName,
      enabled: existing?.enabled ?? false,
    };
  } else if (company.ats === "workday") {
    if (WORKDAY_SKIP_SLUGS.has(company.slug)) {
      byId.delete(company.slug);
      continue;
    }
    const [host, tenant, site, status] = workdayRows.get(company.slug) ?? [];
    if (!host || status !== "ok") continue;
    const siteKey = `${host}\0${site}`;
    const owner = workdaySiteOwner.get(siteKey);
    if (owner && owner !== company.slug) {
      byId.delete(company.slug);
      continue;
    }
    row = {
      id: company.slug,
      name: company.name,
      ats: "workday",
      workday: { host, tenant, site },
      enabled: existing?.enabled ?? false,
    };
  } else if (company.ats === "custom") {
    row = {
      id: company.slug,
      name: company.name,
      ats: "custom",
      enabled: false,
    };
  } else {
    continue;
  }

  if (resetEnabled) {
    row.enabled = false;
  }
  if (enableWaves.has("ashby") && row.ats === "ashby" && ASHBY_WAVE.has(company.slug)) {
    row.enabled = true;
  }
  if (
    enableWaves.has("workday-tier1") &&
    row.ats === "workday" &&
    (WORKDAY_TIER1.has(company.slug) || (company.tier <= 2 && company.earlyCareer))
  ) {
    row.enabled = true;
  }

  byId.set(company.slug, row);
  if (row.ats === "greenhouse" && row.boardToken) {
    greenhouseTokenOwner.set(row.boardToken, company.slug);
  }
  if (row.ats === "ashby" && row.boardName) {
    ashbyBoardOwner.set(row.boardName.toLowerCase(), company.slug);
  }
  if (row.ats === "workday" && row.workday) {
    workdaySiteOwner.set(
      `${row.workday.host}\0${row.workday.site}`,
      company.slug,
    );
  }
}

data.companies = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(COMPANIES, stringify(data), "utf8");
console.log(`Updated ${COMPANIES} (${data.companies.length} companies)`);
