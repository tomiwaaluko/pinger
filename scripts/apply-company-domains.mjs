#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMPANIES = join(ROOT, "companies.yaml");
const DOMAINS = join(ROOT, "data", "company-domains.yaml");

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

const companiesData = parse(readFileSync(COMPANIES, "utf8"));
const domainsData = parse(readFileSync(DOMAINS, "utf8"));
const domains = domainsData?.domains ?? {};

if (!companiesData || !Array.isArray(companiesData.companies)) {
  throw new Error("companies.yaml must contain a companies list");
}

if (!domainsData || typeof domains !== "object" || Array.isArray(domains)) {
  throw new Error("data/company-domains.yaml must contain a domains map");
}

let applied = 0;
const missing = [];

for (const company of companiesData.companies) {
  if (!company?.enabled) continue;

  const domain = domains[company.id];
  if (hasText(domain)) {
    company.domain = domain.trim().toLowerCase();
    applied += 1;
  }

  if (!hasText(company.domain) && !hasText(company.logoUrl)) {
    missing.push(company.id);
  }
}

if (missing.length > 0) {
  throw new Error(
    `Missing domain or logoUrl for enabled companies: ${missing.join(", ")}`,
  );
}

writeFileSync(COMPANIES, stringify(companiesData), "utf8");
console.log(`Applied domains for ${applied} enabled companies`);
