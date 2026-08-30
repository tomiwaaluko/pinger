#!/usr/bin/env node
/**
 * Verify Ashby board slugs for refined target companies.
 * Writes data/ashby-boards.tsv (slug, boardName, status).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REFINED = join(ROOT, "data", "target-companies-refined.yaml");
const OVERRIDES = join(ROOT, "data", "ashby-board-overrides.yaml");
const OUT = join(ROOT, "data", "ashby-boards.tsv");
const ASHBY_API = "https://api.ashbyhq.com/posting-api/job-board";

function loadOverrides() {
  try {
    return parse(readFileSync(OVERRIDES, "utf8")) ?? {};
  } catch {
    return {};
  }
}

function parseRefinedAshby() {
  const text = readFileSync(REFINED, "utf8");
  const blocks = text.split(/\n  - slug:/).slice(1);
  const companies = [];
  for (const block of blocks) {
    const slug = block.match(/^ ([^\n]+)/)?.[1]?.trim();
    const ats = block.match(/ats: ([^\n]+)/)?.[1]?.trim();
    if (!slug || ats !== "ashby") continue;
    companies.push({ slug: slug.replace(/"/g, "") });
  }
  return companies;
}

function candidates(slug, overrides) {
  const list = [];
  if (overrides[slug]) list.push(overrides[slug]);
  list.push(slug);
  list.push(slug.replace(/-/g, ""));
  return [...new Set(list)];
}

async function probeBoard(boardName) {
  const res = await fetch(`${ASHBY_API}/${encodeURIComponent(boardName)}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return { status: `http-${res.status}`, jobCount: 0 };
  const body = await res.json();
  const jobs = Array.isArray(body.jobs) ? body.jobs : [];
  return { status: "ok", jobCount: jobs.length };
}

const overrides = loadOverrides();
const companies = parseRefinedAshby();
const rows = ["slug\tboardName\tstatus\tjobCount"];

for (const { slug } of companies) {
  let resolved = null;
  for (const boardName of candidates(slug, overrides)) {
    const result = await probeBoard(boardName);
    if (result.status === "ok") {
      resolved = { boardName, ...result };
      break;
    }
  }
  if (resolved) {
    rows.push(`${slug}\t${resolved.boardName}\t${resolved.status}\t${resolved.jobCount}`);
  } else {
    rows.push(`${slug}\t\tnot-found\t0`);
  }
}

writeFileSync(OUT, `${rows.join("\n")}\n`, "utf8");
console.log(`Wrote ${OUT} (${companies.length} Ashby companies)`);
