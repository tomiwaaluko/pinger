import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function writeTempYaml(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pinger-config-"));
  const path = join(dir, "companies.yaml");
  writeFileSync(path, content);
  return path;
}

const baseCompany = `
  - id: vercel
    name: Vercel
    ats: greenhouse
    boardToken: vercel
    enabled: true
`;

describe("loadConfig", () => {
  it("parses the committed Greenhouse company fleet", () => {
    const config = loadConfig(join(repoRoot, "companies.yaml"));
    expect(config.vault.careerPath).toBe("Career/");
    expect(config.llm.model).toBe("gemini-2.5-flash");
    expect(config.companies.length).toBeGreaterThanOrEqual(500);

    const ids = config.companies.map((company) => company.id);
    const boardTokens = config.companies
      .filter((company) => company.ats === "greenhouse")
      .map((company) => company.boardToken);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(boardTokens).size).toBe(boardTokens.length);

    const enabled = config.companies.filter((company) => company.enabled);
    expect(enabled.length).toBeGreaterThanOrEqual(80);
    expect(enabled.length).toBeLessThanOrEqual(150);

    const enabledTokens = new Set(enabled.map((company) => company.boardToken));
    for (const requiredToken of [
      "vercel",
      "cloudflare",
      "stripe",
      "figma",
      "datadog",
      "postman",
      "anthropic",
      "discord",
      "planetscale",
      "launchdarkly",
      "grafanalabs",
      "mongodb",
      "gitlab",
      "airbnb",
      "roblox",
    ]) {
      expect(enabledTokens.has(requiredToken)).toBe(true);
    }
  });

  it("every enabled company has domain or logoUrl", () => {
    const enabled = loadConfig(join(repoRoot, "companies.yaml")).companies.filter(
      (company) => company.enabled,
    );
    for (const company of enabled) {
      expect(
        ("domain" in company && company.domain) ||
          ("logoUrl" in company && company.logoUrl),
      ).toBeTruthy();
    }
  });

  it("parses enabled true and false", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: a
    name: A
    ats: greenhouse
    boardToken: a
    enabled: true
  - id: b
    name: B
    ats: greenhouse
    boardToken: b
    enabled: false
`);
    const config = loadConfig(path);
    expect(config.companies[0].enabled).toBe(true);
    expect(config.companies[1].enabled).toBe(false);
  });

  it("rejects missing enabled", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: vercel
    name: Vercel
    ats: greenhouse
    boardToken: vercel
`);
    expect(() => loadConfig(path)).toThrow(/companies\[0\]\.enabled must be a boolean/);
  });

  it("rejects duplicate id", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: vercel
    name: Vercel
    ats: greenhouse
    boardToken: vercel
    enabled: true
  - id: vercel
    name: Vercel Two
    ats: greenhouse
    boardToken: other
    enabled: true
`);
    expect(() => loadConfig(path)).toThrow(/duplicate/i);
  });

  it("rejects id with surrounding whitespace", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: "vercel "
    name: Vercel
    ats: greenhouse
    boardToken: vercel
    enabled: true
`);
    expect(() => loadConfig(path)).toThrow(/companies\[0\]\.id must be a lowercase slug/);
  });

  it("rejects uppercase id", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: Vercel
    name: Vercel
    ats: greenhouse
    boardToken: vercel
    enabled: true
`);
    expect(() => loadConfig(path)).toThrow(/companies\[0\]\.id must be a lowercase slug/);
  });

  it("rejects duplicate boardToken", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: a
    name: A
    ats: greenhouse
    boardToken: shared
    enabled: true
  - id: b
    name: B
    ats: greenhouse
    boardToken: shared
    enabled: true
`);
    expect(() => loadConfig(path)).toThrow(/duplicate/i);
  });

  it("rejects boardToken with surrounding whitespace", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: vercel
    name: Vercel
    ats: greenhouse
    boardToken: "vercel "
    enabled: true
`);
    expect(() => loadConfig(path)).toThrow(
      /companies\[0\]\.boardToken must be a lowercase slug/,
    );
  });

  it("rejects uppercase boardToken", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: vercel
    name: Vercel
    ats: greenhouse
    boardToken: Vercel
    enabled: true
`);
    expect(() => loadConfig(path)).toThrow(
      /companies\[0\]\.boardToken must be a lowercase slug/,
    );
  });

  it("loads ashby company with boardName", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: notion
    name: Notion
    ats: ashby
    boardName: notion
    enabled: false
`);
    const config = loadConfig(path);
    expect(config.companies[0]).toMatchObject({
      ats: "ashby",
      boardName: "notion",
      enabled: false,
    });
  });

  it("loads workday company with workday block", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: boeing
    name: Boeing
    ats: workday
    workday:
      host: boeing.wd1.myworkdayjobs.com
      tenant: boeing
      site: external_subsidiary
    enabled: false
`);
    const config = loadConfig(path);
    expect(config.companies[0].ats).toBe("workday");
    if (config.companies[0].ats === "workday") {
      expect(config.companies[0].workday.site).toBe("external_subsidiary");
    }
  });

  it("loads enabled portal company without adapter-specific fields", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: google
    name: Google
    ats: google
    enabled: true
    domain: google.com
`);
    expect(loadConfig(path).companies[0]).toEqual({
      id: "google",
      name: "Google",
      ats: "google",
      enabled: true,
      domain: "google.com",
    });
  });

  it("rejects custom with enabled true", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: google
    name: Google
    ats: custom
    enabled: true
`);
    expect(() => loadConfig(path)).toThrow(/custom.*enabled/i);
  });

  it("rejects duplicate workday host and site", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: a
    name: A
    ats: workday
    workday:
      host: boeing.wd1.myworkdayjobs.com
      tenant: boeing
      site: external
    enabled: false
  - id: b
    name: B
    ats: workday
    workday:
      host: boeing.wd1.myworkdayjobs.com
      tenant: boeing
      site: external
    enabled: false
`);
    expect(() => loadConfig(path)).toThrow(/duplicate/i);
  });

  it("rejects an unknown ats", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: acme
    name: Acme
    ats: lever
    enabled: true
`);
    expect(() => loadConfig(path)).toThrow(/greenhouse, ashby, workday, google/);
  });

  it("does not require careerSiteCategory", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
${baseCompany}
`);
    const config = loadConfig(path);
    expect(config.companies[0]).not.toHaveProperty("careerSiteCategory");
  });

  it("ignores unknown company fields such as careerSiteCategory", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: vercel
    name: Vercel
    ats: greenhouse
    boardToken: vercel
    enabled: true
    careerSiteCategory: Engineering
`);
    const config = loadConfig(path);
    expect(config.companies[0]).toEqual({
      id: "vercel",
      name: "Vercel",
      ats: "greenhouse",
      boardToken: "vercel",
      enabled: true,
    });
  });

  it("rejects empty companies list", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies: []
`);
    expect(() => loadConfig(path)).toThrow(/at least one company/);
  });

  it("allows all-disabled companies for parse", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: a
    name: A
    ats: greenhouse
    boardToken: a
    enabled: false
`);
    const config = loadConfig(path);
    expect(config.companies[0].enabled).toBe(false);
  });

  it("defaults careerPath to Career/ when omitted", () => {
    const path = writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
${baseCompany}
`);
    expect(loadConfig(path).vault.careerPath).toBe("Career/");
  });

  it("accepts domain and https logoUrl", () => {
    const path = writeTempYaml(`
vault:
  careerPath: Career/
llm:
  model: gemini-2.5-flash
companies:
  - id: stripe
    name: Stripe
    ats: greenhouse
    boardToken: stripe
    enabled: true
    domain: stripe.com
    logoUrl: https://cdn.example/stripe.png
`);
    const company = loadConfig(path).companies[0];
    expect(company).toMatchObject({
      domain: "stripe.com",
      logoUrl: "https://cdn.example/stripe.png",
    });
  });

  it("rejects domain with path", () => {
    expect(() =>
      loadConfig(
        writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: stripe
    name: Stripe
    ats: greenhouse
    boardToken: stripe
    enabled: true
    domain: stripe.com/foo
`),
      ),
    ).toThrow(/domain/i);
  });

  it("rejects http logoUrl and userinfo", () => {
    expect(() =>
      loadConfig(
        writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: stripe
    name: Stripe
    ats: greenhouse
    boardToken: stripe
    enabled: true
    logoUrl: http://x
`),
      ),
    ).toThrow();
    expect(() =>
      loadConfig(
        writeTempYaml(`
llm:
  model: gemini-2.5-flash
companies:
  - id: stripe
    name: Stripe
    ats: greenhouse
    boardToken: stripe
    enabled: true
    logoUrl: https://user:pass@x/y
`),
      ),
    ).toThrow();
  });
});
