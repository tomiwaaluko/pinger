import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("loadConfig", () => {
  it("parses the committed Vercel company entry", () => {
    const config = loadConfig(join(repoRoot, "companies.yaml"));
    expect(config.vault.careerPath).toBe("Career/");
    expect(config.llm.model).toBe("gemini-2.5-flash");
    expect(config.companies).toHaveLength(1);
    expect(config.companies[0]).toEqual({
      id: "vercel",
      name: "Vercel",
      ats: "greenhouse",
      boardToken: "vercel",
      careerSiteCategory: "Engineering",
    });
  });

  it("defaults careerPath to Career/ when omitted", () => {
    const dir = mkdtempSync(join(tmpdir(), "pinger-config-"));
    const path = join(dir, "companies.yaml");
    writeFileSync(
      path,
      `
llm:
  model: gemini-2.5-flash
companies:
  - id: vercel
    name: Vercel
    ats: greenhouse
    boardToken: vercel
    careerSiteCategory: Engineering
`,
    );
    expect(loadConfig(path).vault.careerPath).toBe("Career/");
  });

  it("rejects a non-greenhouse ats", () => {
    const dir = mkdtempSync(join(tmpdir(), "pinger-config-"));
    const path = join(dir, "companies.yaml");
    writeFileSync(
      path,
      `
llm:
  model: gemini-2.5-flash
companies:
  - id: acme
    name: Acme
    ats: lever
    boardToken: acme
    careerSiteCategory: Engineering
`,
    );
    expect(() => loadConfig(path)).toThrow(/greenhouse/);
  });
});
