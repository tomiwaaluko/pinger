import { readFileSync } from "node:fs";
import { parse } from "yaml";
import {
  isPortalAtsKind,
  PORTAL_ATS_KINDS,
  type AppConfig,
  type AshbyCompany,
  type CompanyConfig,
  type CustomCompany,
  type GreenhouseCompany,
  type PortalCompany,
  type WorkdayCompany,
} from "./types.js";

/** Stable seen-store / Greenhouse path segment: lowercase kebab slug, no whitespace. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireSlug(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (value !== value.trim() || !SLUG_PATTERN.test(value)) {
    throw new Error(
      `${label} must be a lowercase slug (a-z, 0-9, hyphen-separated)`,
    );
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function optionalDomain(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = requireString(value, label);
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(s)) {
    throw new Error(`${label} must be a DNS hostname`);
  }
  return s.toLowerCase();
}

function optionalLogoUrl(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = requireString(value, label);
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must be https`);
  if (url.username || url.password) {
    throw new Error(`${label} must not include userinfo`);
  }
  return s;
}

function parseBrandingFields(
  row: Record<string, unknown>,
  index: number,
): { domain?: string; logoUrl?: string } {
  const domain = optionalDomain(row.domain, `companies[${index}].domain`);
  const logoUrl = optionalLogoUrl(row.logoUrl, `companies[${index}].logoUrl`);
  return {
    ...(domain !== undefined && { domain }),
    ...(logoUrl !== undefined && { logoUrl }),
  };
}

function parseWorkdayBlock(
  raw: unknown,
  index: number,
): WorkdayCompany["workday"] {
  if (raw === null || typeof raw !== "object") {
    throw new Error(`companies[${index}].workday must be an object`);
  }
  const row = raw as Record<string, unknown>;
  return {
    host: requireString(row.host, `companies[${index}].workday.host`),
    tenant: requireString(row.tenant, `companies[${index}].workday.tenant`),
    site: requireString(row.site, `companies[${index}].workday.site`),
  };
}

function parseCompany(raw: unknown, index: number): CompanyConfig {
  if (raw === null || typeof raw !== "object") {
    throw new Error(`companies[${index}] must be an object`);
  }
  const row = raw as Record<string, unknown>;
  const ats = requireString(row.ats, `companies[${index}].ats`);
  const id = requireSlug(row.id, `companies[${index}].id`);
  const name = requireString(row.name, `companies[${index}].name`);
  const enabled = requireBoolean(row.enabled, `companies[${index}].enabled`);
  const branding = parseBrandingFields(row, index);

  if (ats === "greenhouse") {
    return {
      id,
      name,
      ats: "greenhouse",
      boardToken: requireSlug(
        row.boardToken,
        `companies[${index}].boardToken`,
      ),
      enabled,
      ...branding,
    } satisfies GreenhouseCompany;
  }

  if (ats === "ashby") {
    return {
      id,
      name,
      ats: "ashby",
      boardName: requireString(
        row.boardName,
        `companies[${index}].boardName`,
      ),
      enabled,
      ...branding,
    } satisfies AshbyCompany;
  }

  if (ats === "workday") {
    return {
      id,
      name,
      ats: "workday",
      workday: parseWorkdayBlock(row.workday, index),
      enabled,
      ...branding,
    } satisfies WorkdayCompany;
  }

  if (isPortalAtsKind(ats)) {
    return {
      id,
      name,
      ats,
      enabled,
      ...branding,
    } satisfies PortalCompany;
  }

  if (ats === "custom") {
    if (enabled) {
      throw new Error(
        `companies[${index}]: custom ATS must have enabled: false`,
      );
    }
    return {
      id,
      name,
      ats: "custom",
      enabled: false,
      ...branding,
    } satisfies CustomCompany;
  }

  throw new Error(
    `companies[${index}].ats must be greenhouse, ashby, workday, ${PORTAL_ATS_KINDS.join(", ")}, or custom`,
  );
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`duplicate ${label}: ${value}`);
    }
    seen.add(key);
  }
}

function validateCompanyUniqueness(companies: CompanyConfig[]): void {
  assertUnique(
    companies.map((company) => company.id),
    "companies[].id",
  );

  const greenhouse = companies.filter((c) => c.ats === "greenhouse");
  assertUnique(
    greenhouse.map((c) => c.boardToken),
    "companies[].boardToken",
  );

  const ashby = companies.filter((c) => c.ats === "ashby");
  assertUnique(
    ashby.map((c) => c.boardName.toLowerCase()),
    "companies[].boardName",
  );

  const workday = companies.filter((c) => c.ats === "workday");
  const workdayKeys = workday.map(
    (c) => `${c.workday.host.toLowerCase()}\0${c.workday.site.toLowerCase()}`,
  );
  assertUnique(workdayKeys, "companies[].workday (host, site)");
}

export function loadConfig(path: string): AppConfig {
  const data = parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  if (data === null || typeof data !== "object") {
    throw new Error("companies.yaml must be a mapping");
  }
  const vaultRaw =
    data.vault && typeof data.vault === "object"
      ? (data.vault as Record<string, unknown>)
      : {};
  const llmRaw =
    data.llm && typeof data.llm === "object"
      ? (data.llm as Record<string, unknown>)
      : {};
  if (!Array.isArray(data.companies) || data.companies.length === 0) {
    throw new Error("companies.yaml must list at least one company");
  }
  const companies = data.companies.map(parseCompany);
  validateCompanyUniqueness(companies);

  return {
    vault: {
      careerPath:
        typeof vaultRaw.careerPath === "string" && vaultRaw.careerPath.trim()
          ? vaultRaw.careerPath
          : "Career/",
    },
    llm: {
      model: requireString(llmRaw.model, "llm.model"),
    },
    companies,
  };
}
