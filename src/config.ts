import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { AppConfig, CompanyConfig } from "./types.js";

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function parseCompany(raw: unknown, index: number): CompanyConfig {
  if (raw === null || typeof raw !== "object") {
    throw new Error(`companies[${index}] must be an object`);
  }
  const row = raw as Record<string, unknown>;
  const ats = requireString(row.ats, `companies[${index}].ats`);
  if (ats !== "greenhouse") {
    throw new Error(`companies[${index}].ats must be greenhouse`);
  }
  if (typeof row.enabled !== "boolean") {
    throw new Error(`companies[${index}].enabled must be a boolean`);
  }
  return {
    id: requireString(row.id, `companies[${index}].id`),
    name: requireString(row.name, `companies[${index}].name`),
    ats: "greenhouse",
    boardToken: requireString(
      row.boardToken,
      `companies[${index}].boardToken`,
    ),
    enabled: row.enabled,
  };
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`duplicate ${label}: ${value}`);
    }
    seen.add(value);
  }
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
    companies: (() => {
      const companies = data.companies.map(parseCompany);
      assertUnique(
        companies.map((company) => company.id),
        "companies[].id",
      );
      assertUnique(
        companies.map((company) => company.boardToken),
        "companies[].boardToken",
      );
      return companies;
    })(),
  };
}
