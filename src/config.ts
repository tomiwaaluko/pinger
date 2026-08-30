import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type {
  AppConfig,
  AshbyCompany,
  CompanyConfig,
  CustomCompany,
  GreenhouseCompany,
  WorkdayCompany,
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
    } satisfies AshbyCompany;
  }

  if (ats === "workday") {
    return {
      id,
      name,
      ats: "workday",
      workday: parseWorkdayBlock(row.workday, index),
      enabled,
    } satisfies WorkdayCompany;
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
    } satisfies CustomCompany;
  }

  throw new Error(
    `companies[${index}].ats must be greenhouse, ashby, workday, or custom`,
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
