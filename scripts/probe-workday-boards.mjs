#!/usr/bin/env node
/**
 * Verify Workday CXS list endpoints for curated careers URLs.
 * Writes data/workday-boards.tsv (slug, host, tenant, site, status, jobCount).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REFINED = join(ROOT, "data", "target-companies-refined.yaml");
const OUT = join(ROOT, "data", "workday-boards.tsv");

const LOCALE_SEGMENT = /^[a-z]{2}(?:-[A-Za-z]{2})?$/;

function parseWorkdayCareersUrl(url) {
  const parsed = new URL(url);
  const hostMatch = parsed.hostname.match(
    /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/i,
  );
  if (!hostMatch) {
    throw new Error(`Workday host not recognized: ${parsed.hostname}`);
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  let site = segments[0] ?? "";
  if (LOCALE_SEGMENT.test(site) && segments.length > 1) {
    site = segments[1];
  }
  if (!site) {
    throw new Error(`Workday site segment missing in URL: ${url}`);
  }
  return {
    host: parsed.hostname,
    tenant: hostMatch[1].toLowerCase(),
    site,
  };
}

/** slug -> careers landing URL (expand over time) */
const CAREERS_URLS = {
  boeing:
    "https://boeing.wd1.myworkdayjobs.com/external_subsidiary/job/USA---Maryland/Associate-Software-Engineer_JR2026516706",
  disney:
    "https://disney.wd5.myworkdayjobs.com/en-US/disneycareer/job/Glendale-CA-USA/Software-Engineer-I_10158076",
  expedia:
    "https://expedia.wd108.myworkdayjobs.com/search/job/Seattle/Software-Engineer_R-123",
};

function parseRefinedWorkday() {
  const text = readFileSync(REFINED, "utf8");
  const blocks = text.split(/\n  - slug:/).slice(1);
  const companies = [];
  for (const block of blocks) {
    const slug = block.match(/^ ([^\n]+)/)?.[1]?.trim()?.replace(/"/g, "");
    const ats = block.match(/ats: ([^\n]+)/)?.[1]?.trim();
    if (!slug || ats !== "workday") continue;
    companies.push({ slug });
  }
  return companies;
}

async function probeBoard(host, tenant, site) {
  const url = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept-language": "en-US",
    },
    body: JSON.stringify({
      appliedFacets: {},
      limit: 20,
      offset: 0,
      searchText: "",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return { status: `http-${res.status}`, jobCount: 0 };
  const body = await res.json();
  const postings = Array.isArray(body.jobPostings) ? body.jobPostings : [];
  return { status: postings.length > 0 || body.total ? "ok" : "empty", jobCount: postings.length };
}

const companies = parseRefinedWorkday();
const rows = ["slug\thost\ttenant\tsite\tstatus\tjobCount"];

for (const { slug } of companies) {
  const careersUrl = CAREERS_URLS[slug];
  if (!careersUrl) {
    rows.push(`${slug}\t\t\t\tno-url\t0`);
    continue;
  }
  const { host, tenant, site } = parseWorkdayCareersUrl(careersUrl);
  const result = await probeBoard(host, tenant, site);
  rows.push(`${slug}\t${host}\t${tenant}\t${site}\t${result.status}\t${result.jobCount}`);
}

writeFileSync(OUT, `${rows.join("\n")}\n`, "utf8");
console.log(`Wrote ${OUT} (${companies.length} Workday companies, ${Object.keys(CAREERS_URLS).length} probed)`);
