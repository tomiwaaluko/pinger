# Multi-ATS Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ashby and Workday adapters to pinger so the watcher can monitor early-career SWE roles across ~950 target companies, not just Greenhouse boards.

**Architecture:** Introduce an ATS adapter registry (`getAdapter(ats).listJobs` + optional `hydrateContent` for Workday) that maps all sources into the existing canonical `Job` type. Extend `companies.yaml` with discriminated union config for `ashby` and `workday`. Ship Ashby first (official API, 17 companies), then Workday (CXS JSON API, 79 companies). Custom portals remain `enabled: false`.

**Tech Stack:** Node.js 22, TypeScript, Vitest, YAML config, GitHub Actions (unchanged workflows).

**Spec:** [2026-08-29-multi-ats-expansion-design.md](../specs/2026-08-29-multi-ats-expansion-design.md)

## Global Constraints

- Matcher rules unchanged from `feat/multi-company-greenhouse` (department gate + early-career + SWE/AI role).
- One Discord webhook; fair 25-post soft cap per run.
- Merge-write `seen-jobs.json`; workflow commits only that file.
- 20s HTTP timeout; 429 retry up to 2 with backoff (Greenhouse/Ashby/Workday).
- Workday list requests: `limit` must be **20** (never higher).
- Workday `hydrateContent` runs only for jobs in the soft-cap attempt window (after seen diff).
- Soft-cap within-company sort: numeric ids when both parse as numbers; else lexicographic `localeCompare`.
- `custom` ATS entries must load with `enabled: false`; `enabled: true` fails config load.
- Refined `ats: unknown` rows are never synced into `companies.yaml`.
- All tests offline — no live network in CI.

---

### Task 1: Adapter interface and config discriminated union

**Files:**
- Create: `src/adapters/types.ts`
- Create: `src/adapters/index.ts`
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Modify: `src/pipeline.ts` (wire adapter dispatch)
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `getAdapter(ats: AtsKind): AtsAdapter` with `listJobs` + optional `hydrateContent`
- Produces: `setAdapterRegistryForTests(...)` for pipeline stubs
- Produces: `CompanyConfig` union type with `greenhouse | ashby | workday | custom` variants
- Consumes: existing `Job` type (unchanged fields)

- [ ] **Step 1: Write failing config tests for Ashby and Workday entries**

```typescript
// tests/config.test.ts — add cases
it("loads ashby company with boardName", () => {
  const cfg = loadConfig(fixturePath("companies-ashby.yaml"));
  expect(cfg.companies[0]).toMatchObject({
    ats: "ashby",
    boardName: "notion",
    enabled: false,
  });
});

it("loads workday company with workday block", () => {
  const cfg = loadConfig(fixturePath("companies-workday.yaml"));
  expect(cfg.companies[0].ats).toBe("workday");
  expect(cfg.companies[0].workday.site).toBe("external_subsidiary");
});

it("rejects custom enabled true", () => {
  expect(() => loadConfig(fixturePath("companies-custom-enabled.yaml"))).toThrow(
    /custom.*enabled/i,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL — `ats must be greenhouse`

- [ ] **Step 3: Extend types and config parser**

```typescript
// src/types.ts
export type GreenhouseCompany = {
  id: string;
  name: string;
  ats: "greenhouse";
  boardToken: string;
  enabled: boolean;
};

export type AshbyCompany = {
  id: string;
  name: string;
  ats: "ashby";
  boardName: string;
  enabled: boolean;
};

export type WorkdayCompany = {
  id: string;
  name: string;
  ats: "workday";
  workday: { host: string; tenant: string; site: string };
  enabled: boolean;
};

export type CustomCompany = {
  id: string;
  name: string;
  ats: "custom";
  enabled: false;
};

export type CompanyConfig =
  | GreenhouseCompany
  | AshbyCompany
  | WorkdayCompany
  | CustomCompany;
```

Update `src/config.ts` `parseCompany` to branch on `ats`. Reject `custom` + `enabled: true`.

- [ ] **Step 4: Create adapter registry stub**

```typescript
// src/adapters/types.ts
export type AtsAdapter = {
  ats: "greenhouse" | "ashby" | "workday";
  listJobs(company: CompanyConfig, fetch: FetchLike): Promise<Job[]>;
  hydrateContent?(
    company: CompanyConfig,
    fetch: FetchLike,
    jobs: Job[],
  ): Promise<Job[]>;
};

// src/adapters/index.ts
import { fetchGreenhouseJobs } from "./greenhouse.js";
import type { AtsAdapter } from "./types.js";

let registry: Record<"greenhouse" | "ashby" | "workday", AtsAdapter> = {
  greenhouse: { ats: "greenhouse", listJobs: fetchGreenhouseJobs },
  ashby: { ats: "ashby", listJobs: async () => { throw new Error("not implemented"); } },
  workday: { ats: "workday", listJobs: async () => { throw new Error("not implemented"); } },
};

export function getAdapter(ats: "greenhouse" | "ashby" | "workday"): AtsAdapter {
  return registry[ats];
}

export function setAdapterRegistryForTests(
  next: Partial<Record<"greenhouse" | "ashby" | "workday", AtsAdapter>>,
): void {
  registry = { ...registry, ...next };
}
```

Move existing `src/greenhouse.ts` → `src/adapters/greenhouse.ts` (re-export from old path or update imports).

Update `src/pipeline.ts` to call `getAdapter(company.ats).listJobs(company, fetch)` instead of direct Greenhouse import. Skip `custom` companies in the enabled list (defensive; config should prevent enabled custom). Defer Workday `hydrateContent` until after soft-cap selection (Task 4 + Task 6).

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS (existing tests + new config tests)

---

### Task 2: Ashby adapter

**Files:**
- Create: `src/adapters/ashby.ts`
- Create: `tests/fixtures/ashby-notion-trimmed.json`
- Test: `tests/ashby.test.ts`

**Interfaces:**
- Produces: `listAshbyJobs(company: AshbyCompany, fetch: FetchLike): Promise<Job[]>`
- Consumes: `GET https://api.ashbyhq.com/posting-api/job-board/{boardName}`

- [ ] **Step 1: Write failing Ashby mapper tests**

```typescript
// tests/ashby.test.ts
import { mapAshbyJob } from "../src/adapters/ashby.js";
import fixture from "./fixtures/ashby-notion-trimmed.json";

it("maps listed job with department and jobUrl", () => {
  const job = mapAshbyJob(fixture.jobs[0]);
  expect(job.id).toBeTruthy();
  expect(job.departments).toEqual(["Engineering"]);
  expect(job.absoluteUrl).toMatch(/^https:\/\//);
});

it("drops unlisted jobs", () => {
  expect(mapAshbyJob({ ...fixture.jobs[0], isListed: false })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ashby.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Ashby adapter**

```typescript
// src/adapters/ashby.ts
const ASHBY_API = "https://api.ashbyhq.com/posting-api/job-board";

export function mapAshbyJob(raw: AshbyPosting): Job | null {
  if (raw.isListed === false) return null;
  const url = raw.jobUrl ?? raw.applyUrl;
  if (!url?.startsWith("https://")) return null;
  return {
    id: String(raw.id),
    title: raw.title,
    location: raw.location ?? "",
    departments: raw.department ? [raw.department] : [],
    careerSiteCategory: null,
    absoluteUrl: url,
    content: raw.descriptionPlain ?? stripHtml(raw.descriptionHtml ?? ""),
  };
}

export async function listAshbyJobs(company: AshbyCompany, fetch: FetchLike): Promise<Job[]> {
  const url = `${ASHBY_API}/${encodeURIComponent(company.boardName)}`;
  // 20s timeout, 429 retry — same helper as Greenhouse
  const data = await fetchJsonWithRetry(fetch, url);
  return data.jobs.map(mapAshbyJob).filter((j): j is Job => j !== null);
}
```

Wire into `src/adapters/index.ts`.

- [ ] **Step 4: Add fixture and run tests**

Run: `npm test -- tests/ashby.test.ts`
Expected: PASS

- [ ] **Step 5: Pipeline integration test with fake Ashby fetch**

Extend `tests/pipeline.test.ts` with one Ashby company in config; stub `getAdapter` or inject fetch. Assert Discord embed URL is Ashby `jobUrl`.

---

### Task 3: Ashby probe script + Workday URL parser

**Files:**
- Create: `src/adapters/workday-url.ts`
- Create: `scripts/probe-ashby-boards.mjs`
- Create: `scripts/probe-workday-boards.mjs`
- Create: `data/ashby-board-overrides.yaml` (curated slug → boardName exceptions)
- Test: `tests/workday-url.test.ts`

**Interfaces:**
- Produces: `parseWorkdayCareersUrl(url: string): { host, tenant, site }`
- Produces: CLI that reads `data/target-companies-refined.yaml` workday entries and verifies CXS list endpoint

- [ ] **Step 1: Write failing URL parser tests**

```typescript
it("parses boeing careers URL", () => {
  expect(
    parseWorkdayCareersUrl(
      "https://boeing.wd1.myworkdayjobs.com/external_subsidiary/job/USA---Maryland/Associate-Software-Engineer_JR2026516706",
    ),
  ).toEqual({
    host: "boeing.wd1.myworkdayjobs.com",
    tenant: "boeing",
    site: "external_subsidiary",
  });
});

it("strips en-US locale segment", () => {
  expect(
    parseWorkdayCareersUrl(
      "https://disney.wd5.myworkdayjobs.com/en-US/disneycareer/job/Glendale-CA-USA/Software-Engineer-I_10158076",
    ).site,
  ).toBe("disneycareer");
});
```

- [ ] **Step 2: Implement parser and probe script**

`parseWorkdayCareersUrl` uses `URL` + regex on hostname for `tenant.wdN.myworkdayjobs.com`.

`scripts/probe-workday-boards.mjs`:
- Read refined YAML workday companies + curated careers URL seeds.
- For each, POST list endpoint with `limit: 20`, `offset: 0`.
- Output TSV: `slug, host, tenant, site, status, jobCount` → `data/workday-boards.tsv`.

`scripts/probe-ashby-boards.mjs`:
- Read refined YAML ashby companies.
- Resolve `boardName` via overrides → probe slug guess → verify API 200.
- Output TSV: `slug, boardName, status` → `data/ashby-boards.tsv`.

- [ ] **Step 3: Run parser tests**

Run: `npm test -- tests/workday-url.test.ts`
Expected: PASS

---

### Task 4: Workday adapter

**Files:**
- Create: `src/adapters/workday.ts`
- Create: `tests/fixtures/workday-boeing-list.json`
- Create: `tests/fixtures/workday-boeing-detail.json`
- Test: `tests/workday.test.ts`

**Interfaces:**
- Produces: `listWorkdayJobs(company, fetch): Promise<Job[]>` — `content: ""`
- Produces: `hydrateWorkdayContent(company, fetch, jobs): Promise<Job[]>` — detail fetch for passed jobs only

- [ ] **Step 1: Write failing Workday tests**

```typescript
it("paginates at limit 20", async () => {
  const fetch = fakeFetchSequence([page1, page2, emptyPage]);
  const jobs = await listWorkdayJobs(boeingCompany, fetch);
  expect(jobs.length).toBe(25);
  expect(jobs.every((j) => j.content === "")).toBe(true);
});

it("hydrates only requested jobs", async () => {
  const listed = [jobA, jobB];
  const fetch = fakeFetchDetail(jobA.id);
  const hydrated = await hydrateWorkdayContent(boeingCompany, fetch, [jobA]);
  expect(hydrated).toHaveLength(1);
  expect(hydrated[0].content).toContain("jobDescription");
});
```

- [ ] **Step 2: Implement Workday list + detail fetch**

```typescript
export const WORKDAY_PAGE_SIZE = 20;

async function fetchWorkdayList(company: WorkdayCompany, fetch: FetchLike) {
  const base = `https://${company.workday.host}/wday/cxs/${company.workday.tenant}/${company.workday.site}`;
  const postings = [];
  let offset = 0;
  for (;;) {
    const body = { appliedFacets: {}, limit: WORKDAY_PAGE_SIZE, offset, searchText: "" };
    const res = await postJson(fetch, `${base}/jobs`, body, { "Accept-Language": "en-US" });
    const batch = res.jobPostings ?? [];
    if (batch.length === 0) break;
    postings.push(...batch);
    offset += WORKDAY_PAGE_SIZE;
  }
  return postings;
}
```

Detail hydration lives in `hydrateWorkdayContent` — pipeline calls it only for attempt-window Workday jobs (Task 6).

Wire Workday adapter as `{ listJobs: listWorkdayJobs, hydrateContent: hydrateWorkdayContent }`.

- [ ] **Step 3: Run tests and wire adapter**

Run: `npm test -- tests/workday.test.ts`
Expected: PASS

---

### Task 5: Companies YAML sync script

**Files:**
- Create: `scripts/sync-companies-yaml.mjs`
- Modify: `companies.yaml` (via script output)
- Test: manual — run script, inspect diff

- [ ] **Step 1: Implement sync script**

Reads `data/target-companies-refined.yaml`, `data/ashby-boards.tsv`, `data/workday-boards.tsv`, `data/ashby-board-overrides.yaml`, and existing `companies.yaml`.

For each refined entry:
- **Skip** `ats: unknown`
- `ats: greenhouse` + `boardToken` → upsert greenhouse row
- `ats: ashby` + verified `boardName` from probe TSV / overrides → upsert ashby row
- `ats: workday` + verified `workday` block from probe TSV → upsert workday row
- `ats: custom` → upsert with `enabled: false`

Preserve existing `enabled` flags unless `--reset-enabled`. Support `--enable-wave ashby|workday-tier1`.

- [ ] **Step 2: Run probe + sync**

```bash
node scripts/probe-ashby-boards.mjs
node scripts/probe-workday-boards.mjs
node scripts/sync-companies-yaml.mjs
```

Verify `companies.yaml` contains Boeing, Disney, Expedia, Intel, etc. with correct `workday` blocks.

- [ ] **Step 3: Enable initial waves**

Use `sync-companies-yaml.mjs --enable-wave ashby` then `--enable-wave workday-tier1`, or manually set `enabled: true` for:
- All 17 verified Ashby companies
- ~25 Workday tier-1 (`earlyCareerVerified` + tier ≤ 2)
- Keep Greenhouse enabled wave as-is (~120)

---

### Task 6: End-to-end pipeline and docs

**Files:**
- Modify: `src/pipeline.ts` (Workday `hydrateContent` after soft-cap)
- Modify: `src/soft-cap.ts` (lexicographic id sort fallback)
- Modify: `tests/soft-cap.test.ts`
- Modify: `tests/pipeline.test.ts`
- Modify: `README.md`
- Modify: `src/constants.ts` (ATS concurrency caps)

- [ ] **Step 1: Fix soft-cap id sort for opaque string ids**

Add test: Workday ids `JR100` vs `JR20` sort lexicographically (`JR100` before `JR20`). Greenhouse numeric ids still sort numerically (`2` before `10`).

- [ ] **Step 2: Wire Workday hydrateContent in pipeline**

After `selectAttemptWindow`, call `hydrateContent` only for Workday jobs in `attempt`. Spy in test: `hydrateContent` not called for deferred or non-Workday jobs.

- [ ] **Step 3: Mixed-ATS pipeline test**

One enabled company per ATS type in fixture config. Fake adapters return one new early-career SWE job each. Assert 3 Discord posts (or soft-cap behavior) and seen-store keys under correct company ids.

- [ ] **Step 4: Update README**

Document:
- Supported ATS types
- How to regenerate company list (`compile` → `refine` → `probe-ashby` / `probe-workday` → `sync`)
- How to enable new companies

- [ ] **Step 5: Full test suite**

Run: `npm test`
Expected: all PASS

---

## Self-review (spec coverage)

| Spec requirement | Task |
| --- | --- |
| Adapter registry (`listJobs` + `hydrateContent`) | Task 1, 4, 6 |
| Ashby official API + probe | Task 2, 3 |
| Workday CXS API, limit ≤ 20 | Task 4 |
| Workday URL parser + probe | Task 3 |
| Config enrichment TSVs + sync | Task 5 |
| Config discriminated union | Task 1 |
| `custom` enabled: false enforcement | Task 1 |
| Two-phase Workday detail fetch (attempt window only) | Task 4, 6 |
| Soft-cap lexicographic id sort | Task 6 |
| sync-companies-yaml from refined list | Task 5 |
| Matcher unchanged | No task (no code changes) |
| Partial failure / merge-write | Task 6 pipeline test |
| ATS concurrency caps | Task 6 constants |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-29-multi-ats-expansion.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach do you want?
