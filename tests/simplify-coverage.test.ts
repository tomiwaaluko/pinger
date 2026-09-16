import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import {
  adapterCanFetch,
  DEFAULT_LISTING_URLS,
  normalizeCompanyName,
  runSimplifyCoverage,
  slugFromNormalizedName,
} from "../src/simplify-coverage.js";

const companiesYaml = `vault:
  careerPath: Career/
llm:
  model: gemini-2.5-flash
companies:
  - id: vercel
    name: Vercel
    ats: greenhouse
    boardToken: vercel
    enabled: true
  - id: stripe
    name: Stripe
    ats: greenhouse
    boardToken: stripe
    enabled: false
  - id: amazon
    name: Amazon
    ats: amazon
    enabled: false
  - id: google
    name: Google
    ats: custom
    enabled: false
  - id: acme
    name: Acme
    ats: greenhouse
    boardToken: acme
    enabled: true
  - id: acme-holdings
    name: The Acme Inc.
    ats: greenhouse
    boardToken: acme-holdings
    enabled: false
`;

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    company_name: "Vercel",
    title: "Software Engineer",
    url: "https://boards.greenhouse.io/vercel/jobs/1",
    locations: ["San Francisco, CA"],
    category: "Software Engineering",
    active: true,
    is_visible: true,
    terms: [],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeCompanyName", () => {
  it("strips the / inc / punctuation", () => {
    expect(normalizeCompanyName("The Stripe, Inc.")).toBe("stripe");
    expect(normalizeCompanyName("Acme LLC")).toBe("acme");
  });
});

describe("slugFromNormalizedName", () => {
  it("turns a normalized name into a slug", () => {
    expect(slugFromNormalizedName("unknown co")).toBe("unknown-co");
    expect(slugFromNormalizedName("")).toBe("company");
  });
});

describe("adapterCanFetch", () => {
  it("is true for greenhouse/amazon and false for custom/google stubs", () => {
    expect(adapterCanFetch("greenhouse")).toBe(true);
    expect(adapterCanFetch("amazon")).toBe(true);
    expect(adapterCanFetch("custom")).toBe(false);
    expect(adapterCanFetch("google")).toBe(false);
  });
});

describe("runSimplifyCoverage", () => {
  function setup() {
    const dir = mkdtempSync(join(tmpdir(), "pinger-cov-"));
    const companiesYamlPath = join(dir, "companies.yaml");
    writeFileSync(companiesYamlPath, companiesYaml);
    return {
      dir,
      companiesYamlPath,
      reportPath: join(dir, "simplify-coverage-report.md"),
      suggestedPath: join(dir, "companies.suggested.yaml"),
    };
  }

  it("classifies would-ping, matcher-drop, disabled enable, missing add, custom-no-adapter, ambiguous, skipped-invalid", async () => {
    const paths = setup();
    const newGrad = [
      listing({
        id: "keep",
        company_name: "Vercel",
        title: "Software Engineer",
      }),
      listing({
        id: "drop",
        company_name: "Vercel",
        title: "Senior Software Engineer",
      }),
      listing({
        id: "disabled-senior",
        company_name: "Stripe",
        title: "Staff Software Engineer",
      }),
      listing({
        id: "amazon",
        company_name: "Amazon",
        title: "SDE I",
      }),
      listing({
        id: "google",
        company_name: "Google",
        title: "Software Engineer",
      }),
      listing({
        id: "missing",
        company_name: "Unknown Co",
        title: "Software Engineer",
      }),
      listing({
        id: "amb",
        company_name: "Acme",
        title: "Software Engineer",
      }),
      listing({
        id: "bad",
        company_name: "",
        title: "Software Engineer",
        url: "https://example.com",
      }),
    ];
    const intern = [
      listing({
        id: "intern-1",
        company_name: "Vercel",
        title: "Software Engineer Intern",
        category: "Software",
        terms: ["Summer 2027"],
        url: "https://boards.greenhouse.io/vercel/jobs/intern-1",
      }),
    ];

    const result = await runSimplifyCoverage({
      fetch: async (url) => {
        const href = String(url);
        if (href === DEFAULT_LISTING_URLS.newGrad) return jsonResponse(newGrad);
        if (href === DEFAULT_LISTING_URLS.intern) return jsonResponse(intern);
        throw new Error(`unexpected url ${href}`);
      },
      companiesYamlPath: paths.companiesYamlPath,
      reportPath: paths.reportPath,
      suggestedPath: paths.suggestedPath,
    });

    expect(result.exitCode).toBe(0);
    expect(result.skippedInvalid).toBe(1);
    const report = readFileSync(paths.reportPath, "utf8");
    expect(report).toContain("would-ping");
    expect(report).toContain("matcher-drop");
    expect(report).toContain("Departments are assumed Engineering");
    expect(report).toMatch(/Senior Software Engineer[\s\S]*matcher-drop/);
    expect(report).toMatch(/Unknown Co[\s\S]*missing/);
    expect(report).toMatch(/Google[\s\S]*custom-no-adapter/);
    expect(report).toMatch(/Acme[\s\S]*ambiguous/);

    const suggested = parse(readFileSync(paths.suggestedPath, "utf8")) as {
      enable: string[];
      add: Array<{ id: string; name: string; ats: string; enabled: boolean }>;
    };
    expect(suggested.enable).toEqual(expect.arrayContaining(["stripe", "amazon"]));
    expect(suggested.enable).not.toContain("google");
    expect(suggested.enable).not.toContain("acme");
    expect(suggested.add).toEqual([
      {
        id: slugFromNormalizedName(normalizeCompanyName("Unknown Co")),
        name: "Unknown Co",
        ats: "custom",
        enabled: false,
      },
    ]);
  });

  it("writes no output files when a fetch fails", async () => {
    const paths = setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runSimplifyCoverage({
      fetch: async (url) => {
        const href = String(url);
        if (href === DEFAULT_LISTING_URLS.newGrad) {
          return jsonResponse([listing()]);
        }
        return new Response("nope", { status: 500 });
      },
      companiesYamlPath: paths.companiesYamlPath,
      reportPath: paths.reportPath,
      suggestedPath: paths.suggestedPath,
    });
    expect(result.exitCode).toBe(2);
    expect(existsSync(paths.reportPath)).toBe(false);
    expect(existsSync(paths.suggestedPath)).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("listings fetch 500"),
    );
    consoleError.mockRestore();
  });

  it("retries 429 once with GITHUB_TOKEN and then succeeds", async () => {
    const paths = setup();
    const seenAuth: string[] = [];
    const result = await runSimplifyCoverage({
      fetch: async (url, init) => {
        const href = String(url);
        const auth = new Headers(init?.headers).get("authorization");
        seenAuth.push(`${href} ${auth ?? "none"}`);
        if (!auth) {
          return new Response("rate", { status: 429 });
        }
        if (href === DEFAULT_LISTING_URLS.newGrad) {
          return jsonResponse([listing()]);
        }
        return jsonResponse([]);
      },
      githubToken: "ghs_test_token",
      companiesYamlPath: paths.companiesYamlPath,
      reportPath: paths.reportPath,
      suggestedPath: paths.suggestedPath,
    });
    expect(result.exitCode).toBe(0);
    expect(seenAuth.some((row) => row.endsWith("none"))).toBe(true);
    expect(
      seenAuth.some((row) => row.includes("Bearer ghs_test_token")),
    ).toBe(true);
    expect(existsSync(paths.reportPath)).toBe(true);
  });

  it("fail-closes immediately on 403 when GITHUB_TOKEN is unset", async () => {
    const paths = setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runSimplifyCoverage({
      fetch: async () => new Response("nope", { status: 403 }),
      companiesYamlPath: paths.companiesYamlPath,
      reportPath: paths.reportPath,
      suggestedPath: paths.suggestedPath,
    });
    expect(result.exitCode).toBe(2);
    expect(existsSync(paths.reportPath)).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("listings fetch 403"),
    );
    consoleError.mockRestore();
  });
});
