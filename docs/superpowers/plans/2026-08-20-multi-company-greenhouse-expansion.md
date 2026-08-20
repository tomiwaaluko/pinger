# Multi-company Greenhouse Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand pinger from a single Vercel board to a Greenhouse fleet (~500 verified tokens in `companies.yaml`, ~80–120 enabled) with department-based matching, partial failure isolation, fair Discord soft-cap, and one shared webhook channel.

**Architecture:** Keep the existing Node CLI + GitHub Actions shape. Change the matcher from Career Site Categories to department allow/deny + existing title rules. Fetch only `enabled` companies with concurrency 10; merge-write `seen-jobs.json` per company; select ≤25 Discord-bound jobs via round-robin before any Gemini call.

**Tech Stack:** Existing stack on `feat/career-watcher` — Node.js 22, TypeScript (ESM, Node16), npm, Vitest, `yaml`, GitHub Actions. No new runtime dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-20-multi-company-greenhouse-expansion-design.md` (overrides parent where they conflict).
- Parent still applies for vault sandbox, fit notes, Discord embed shape, dry-run no-write, workflow commit-only-`seen-jobs.json`, unless this plan/spec overrides.
- **Branch:** Implementation lives on code from `feat/career-watcher`. Before coding: check out / create a branch that contains the v1 app **and** the expansion specs from `master` (merge or rebase as needed). Do not implement against empty `master`.
- Tests: Vitest, all fakes offline (no live Greenhouse, Discord, or Gemini in CI).
- TypeScript ESM with `.js` import specifiers; tests import from `vitest` (no globals).
- Greenhouse: `content=true`, 20s timeout, pagination + `meta.total` check **per company**.
- Retry **only HTTP 429** (Greenhouse and Discord), max 2 retries, honor `Retry-After` capped at 30s.
- Concurrency: **10** companies in flight. Discord posts sequential.
- Soft cap: **25** attempt-window jobs; LLM + Discord only for that window; round-robin by company id.
- Matcher: department gate (deny-any, then allow-some) + early-career + role title rules. **No** Career Site Categories in matching.
- Bad `absolute_url`: drop that job; do **not** fail the company. Compare `meta.total` to **raw** job rows received (before URL drops), not to the filtered `Job[]` length.
- Exit **2** on Discord post failure or vault/Discord missing when Discord-bound hits exist; exit non-zero if every enabled fetch failed (use `2`); exit `0` when zero companies enabled.
- One Discord channel / one webhook. Company name in embed fields.
- **Do not run/deploy `watch.yml` against production until Task 6 lands** (enabled filter + fleet pipeline). Intermediate commits after Task 2 still fetch every company until Task 6.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/types.ts` | Drop `careerSiteCategory` from `CompanyConfig`; add `enabled`; `RunWatcherResult.dryRunDeferred` |
| `src/constants.ts` | `GREENHOUSE_CONCURRENCY`, `DISCORD_SOFT_CAP`, retry constants |
| `src/matcher.ts` | Department gate + title rules; `matchesJob(job)` (no category arg) |
| `src/config.ts` | Parse `enabled`; reject duplicate id/token; no `careerSiteCategory` |
| `src/greenhouse.ts` | Drop bad-URL jobs; 429-only retries |
| `src/discord.ts` | 429-only retries on `postDiscord` |
| `src/soft-cap.ts` | Round-robin attempt-window selection (new) |
| `src/pipeline.ts` | Enabled filter, per-company failure, merge writes, soft-cap before LLM |
| `companies.yaml` | ~500 verified tokens; ~80–120 `enabled: true` |
| `scripts/probe-greenhouse-boards.mjs` | One-shot helper to verify tokens (dev only; not used in Actions) |
| `tests/matcher.test.ts` | Department gate cases from spec |
| `tests/config.test.ts` | `enabled`, duplicates, schema |
| `tests/greenhouse.test.ts` | Bad URL drop, 429 retry, 404 no retry |
| `tests/discord.test.ts` | 429 retry |
| `tests/soft-cap.test.ts` | Round-robin fairness |
| `tests/pipeline.test.ts` | Fleet behaviors from spec |
| `README.md` | Multi-company + `enabled` docs |

Do not invent Ashby adapters, Discord MCP, or a plugin registry.

---

### Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Create working branch from v1 code + expansion specs**

```bash
git fetch origin
git checkout feat/career-watcher
git checkout -b feat/multi-company-greenhouse
git merge master -m "Merge expansion specs into career-watcher codebase"
```

If merge conflicts appear only in docs, keep both. Resolve so `src/` comes from career-watcher and expansion spec/plan from master.

Expected: `src/pipeline.ts` and `docs/superpowers/specs/2026-08-20-multi-company-greenhouse-expansion-design.md` both exist.

- [ ] **Step 2: Verify baseline tests**

```bash
npm ci
npm test
npm run build
```

Expected: all existing tests PASS.

- [ ] **Step 3: Commit branch point if merge created a merge commit; otherwise no commit needed**

---

### Task 1: Department matcher

**Files:**
- Modify: `src/matcher.ts`
- Modify: `src/constants.ts` (optional — keep deny/allow lists in matcher)
- Modify: `tests/matcher.test.ts`
- Modify: `tests/helpers.ts` (defaults still fine)

**Interfaces:**
- Consumes: `Job` with `departments: string[]`, `title: string`
- Produces: `normalizeTitle(title: string): string` (unchanged), `matchesJob(job: Job): boolean` (**remove** `expectedCategory` parameter)

- [ ] **Step 1: Rewrite failing matcher tests for department gate**

Replace category-based expectations in `tests/matcher.test.ts` with:

```typescript
import { describe, expect, it } from "vitest";
import { matchesJob, normalizeTitle } from "../src/matcher.js";
import { makeJob } from "./helpers.js";

describe("normalizeTitle", () => {
  it("trims, lowercases, and collapses hyphens and whitespace", () => {
    expect(normalizeTitle("  New-Grad   Software Engineer  ")).toBe(
      "new grad software engineer",
    );
  });
});

describe("matchesJob", () => {
  it.each([
    ["Software Engineer Intern", ["Engineering"], true],
    ["SOFTWARE ENGINEER INTERNSHIP", ["Engineering"], true],
    ["Software Engineer Co-op", ["Engineering"], true],
    ["Software Engineer Co op", ["Engineering"], true],
    ["Software Engineer Coop", ["Engineering"], true],
    ["New Grad Software Engineer", ["Engineering"], true],
    ["New-Grad Software Engineer", ["Engineering"], true],
    ["Newgrad Software Engineer", ["Engineering"], true],
    ["Graduate Software Engineer", ["Engineering"], true],
    ["University Software Engineer", ["Engineering"], true],
    ["AI Engineer Intern", ["AI"], true],
    ["AI Engineer Intern", ["AI Platform"], true],
    ["SWE Intern", ["Platform Engineering"], true],
    ["Software Engineering Intern", ["Product Engineering"], true],
    ["Software Engineer Intern", ["Software Engineering"], true],
    ["Software Engineer Intern", ["Resolution Engineering"], true],
    ["Junior Software Engineer Intern", ["Engineering"], true],
    ["Undergraduate Software Engineer Intern", ["Engineering"], true],
    ["Software Engineer Intern", ["Sales Engineering"], false],
    ["Software Engineer Intern", ["Solutions Engineering"], false],
    ["Software Engineer Intern", ["Field Engineering"], false],
    ["Software Engineer Intern", ["Non-Engineering"], false],
    ["Software Engineer Intern", ["Retail"], false],
    ["Software Engineer Intern", ["Training"], false],
    ["Software Engineer Intern", ["Maintenance"], false],
    ["Software Engineer Intern", ["Dev Eng"], false],
    ["Software Engineer Intern", ["Sales", "Engineering"], false],
    ["Software Engineer Intern", [], false],
    ["Engineering Manager", ["Engineering"], false],
    ["Engineering Manager Intern", ["Engineering"], false],
    ["DevRel Engineer Intern", ["Engineering"], false],
    ["Senior Software Engineer", ["Engineering"], false],
    ["Associate Software Engineer", ["Engineering"], false],
    ["Junior Software Engineer", ["Engineering"], false],
    ["Account Executive, Commercial", ["Engineering"], false],
    ["Software Engineer, Trust & Safety", ["Security"], false],
    ["Software Engineer, AI SDK", ["Engineering"], false],
    ["Member of the Technical Staff, Internal Agent ", ["Engineering"], false],
    ["Undergraduate Software Engineer", ["Engineering"], false],
  ])("title %s depts %j → %s", (title, departments, expected) => {
    expect(
      matchesJob(
        makeJob({
          title,
          departments,
          careerSiteCategory: "Engineering",
        }),
      ),
    ).toBe(expected);
  });

  it("ignores Career Site Categories even when Engineering", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer Intern",
          careerSiteCategory: "Engineering",
          departments: ["Security"],
        }),
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- tests/matcher.test.ts
```

Expected: FAIL (signature / category still required).

- [ ] **Step 3: Implement matcher**

Replace `src/matcher.ts` with:

```typescript
import type { Job } from "./types.js";

const EARLY_CAREER_PHRASES = [
  "intern",
  "internship",
  "co op",
  "coop",
  "new grad",
  "newgrad",
  "university",
  "graduate",
  "grad",
] as const;

const ROLE_PHRASES = [
  "software engineer",
  "software engineering",
  "ai engineer",
  "swe",
] as const;

const DEPT_ALLOW = ["engineering", "software", "swe", "ai"] as const;
const DEPT_DENY = [
  "sales",
  "solution",
  "solutions",
  "field",
  "non",
] as const;

export function normalizeTitle(title: string): string {
  return title.trim().replace(/-/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function hasPhrase(normalized: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(normalized);
}

function departmentGate(departments: string[]): boolean {
  if (!Array.isArray(departments) || departments.length === 0) {
    return false;
  }
  const normalized = departments.map((d) => normalizeTitle(d));
  if (normalized.some((d) => DEPT_DENY.some((tok) => hasPhrase(d, tok)))) {
    return false;
  }
  return normalized.some((d) => DEPT_ALLOW.some((tok) => hasPhrase(d, tok)));
}

export function matchesJob(job: Job): boolean {
  if (!departmentGate(job.departments)) {
    return false;
  }
  const title = normalizeTitle(job.title);
  const earlyCareer = EARLY_CAREER_PHRASES.some((phrase) =>
    hasPhrase(title, phrase),
  );
  const role = ROLE_PHRASES.some((phrase) => hasPhrase(title, phrase));
  return earlyCareer && role;
}
```

- [ ] **Step 4: Run matcher tests — expect PASS**

```bash
npm test -- tests/matcher.test.ts
```

- [ ] **Step 5: Temporarily fix compile breakage in pipeline/tests that still pass category**

Update every `matchesJob(job, company.careerSiteCategory)` call to `matchesJob(job)` so `npm run build` and other suites can run. Leave config `careerSiteCategory` until Task 2 — pipeline can still read it unused.

Search:

```bash
rg "matchesJob\(" -n
```

- [ ] **Step 6: Commit**

```bash
git add src/matcher.ts tests/matcher.test.ts src/pipeline.ts tests/pipeline.test.ts
git commit -m "feat: match jobs by department gate instead of category"
```

---

### Task 2: Config `enabled` + drop `careerSiteCategory`

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Modify: `tests/config.test.ts`
- Modify: `companies.yaml` (vercel only for now: `enabled: true`, remove category)
- Modify: any test `AppConfig` fixtures (`tests/pipeline.test.ts`, etc.)

**Interfaces:**
- Produces:

```typescript
export type CompanyConfig = {
  id: string;
  name: string;
  ats: "greenhouse";
  boardToken: string;
  enabled: boolean;
};
```

- [ ] **Step 1: Write failing config tests**

In `tests/config.test.ts`, cover:

- parses `enabled: true/false`
- rejects missing `enabled`
- rejects duplicate `id`
- rejects duplicate `boardToken`
- rejects `ats: ashby`
- does not require `careerSiteCategory`
- `companies: []` still fails load (need ≥1 entry); all-disabled is OK for parse

Example assertions:

```typescript
it("requires enabled boolean and rejects duplicates", () => {
  // write temp yaml with two companies same id → throws /companies\[0\].id|duplicate/i
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- tests/config.test.ts
```

- [ ] **Step 3: Update types + config parser**

`CompanyConfig`: remove `careerSiteCategory`; add `enabled: boolean`.

In `parseCompany`:

```typescript
if (typeof row.enabled !== "boolean") {
  throw new Error(`companies[${index}].enabled must be a boolean`);
}
// ... ats greenhouse check ...
return {
  id: requireString(row.id, `companies[${index}].id`),
  name: requireString(row.name, `companies[${index}].name`),
  ats: "greenhouse",
  boardToken: requireString(row.boardToken, `companies[${index}].boardToken`),
  enabled: row.enabled,
};
```

After mapping all companies, check unique `id` and unique `boardToken` (throw on duplicates).

Update `companies.yaml`:

```yaml
vault:
  careerPath: Career/

llm:
  model: gemini-2.5-flash   # starting guess; change if the API rejects it

companies:
  - id: vercel
    name: Vercel
    ats: greenhouse
    boardToken: vercel
    enabled: true
```

Update all test fixtures’ `CompanyConfig` objects the same way.

- [ ] **Step 4: Run config + full suite**

```bash
npm test
npm run build
```

Expected: PASS. **Note:** pipeline still fetches all companies until Task 6 — do not run production `watch.yml` yet. Unknown YAML keys (e.g. leftover `careerSiteCategory`) must be ignored by the parser (add a config test that a company row with an extra unknown field still loads).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/config.ts companies.yaml tests/config.test.ts tests/pipeline.test.ts
git commit -m "feat: require enabled flag and drop careerSiteCategory from config"
```

---

### Task 3: Greenhouse bad-URL drop + 429 retries

**Files:**
- Modify: `src/constants.ts`
- Modify: `src/greenhouse.ts`
- Modify: `tests/greenhouse.test.ts`

**Interfaces:**
- Consumes: `FetchLike`
- Produces: `mapGreenhouseJob(raw): Job | null` (return `null` for bad URL), `fetchGreenhouseJobs(boardToken, fetchImpl?): Promise<Job[]>`

- [ ] **Step 1: Write failing tests first** (then add constants in Step 3 with the implementation)

- Page with one bad `absolute_url` and one good job, `meta.total` equal to **raw** row count (2) → returns only the good job (length 1); does **not** throw pagination incomplete.
- First response 429 with `Retry-After: 0` (or tiny), second 200 → success.
- Response 404 → throws immediately; fetch called once.
- Response 429 then 429 then 429 → throws after 3 attempts (1 + 2 retries).
- `Retry-After` that is not a finite number of seconds → fall back to exponential backoff (do not parse HTTP-date; out of scope).

Use fake `fetchImpl` with a call counter. For backoff tests, stub `Retry-After: 0` so tests stay fast.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- tests/greenhouse.test.ts
```

- [ ] **Step 3: Add constants + implement**

Add to `src/constants.ts`:

```typescript
export const GREENHOUSE_CONCURRENCY = 10;
export const DISCORD_SOFT_CAP = 25;
export const HTTP_429_MAX_RETRIES = 2;
export const HTTP_429_RETRY_AFTER_CAP_MS = 30_000;
```

Change `mapGreenhouseJob` to return `Job | null`: on bad URL, `console.error` once and return `null`.

**Preserve existing pagination safety from v1** — do **not** delete these while editing:
- `assertSameOrigin(next, firstUrl)`
- pagination cycle detection (`visited` set)
- `GREENHOUSE_MAX_PAGES` cap
- `Link: rel="next"` parsing

Existing tests that expect `mapGreenhouseJob` to **throw** on bad `absolute_url` must be rewritten to expect `null`. Any greenhouse fixture helpers that call `matchesJob(job, "Engineering")` must become `matchesJob(job)`. Keep same-origin / cycle / max-pages tests green.

In `fetchGreenhouseJobs` pagination loop:

1. For each page, `rawCount += pageJobs.length` (array length **before** mapping/filtering).
2. Map with `mapGreenhouseJob`, push only non-null jobs into `jobs`.
3. After all pages, if `typeof metaTotal === "number" && rawCount !== metaTotal`, throw pagination incomplete.
4. Return filtered `jobs`.

**Never** compare `meta.total` to `jobs.length` after URL drops.

Add helper:

```typescript
async function fetchWith429Retries(
  url: string,
  fetchImpl: FetchLike,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`Greenhouse request failed: ${(err as Error).message}`);
    }
    if (response.status !== 429) {
      return response;
    }
    if (attempt >= HTTP_429_MAX_RETRIES) {
      return response; // caller throws on !ok
    }
    const retryAfter = response.headers.get("retry-after");
    let waitMs = 1000 * 2 ** attempt;
    if (retryAfter) {
      const secs = Number(retryAfter);
      if (Number.isFinite(secs) && secs >= 0) {
        waitMs = Math.min(secs * 1000, HTTP_429_RETRY_AFTER_CAP_MS);
      }
    }
    await new Promise((r) => setTimeout(r, waitMs));
    attempt += 1;
  }
}
```

Use it instead of raw `fetchImpl` in the pagination loop. Keep throwing on `!response.ok` after retries.

- [ ] **Step 4: Run greenhouse tests**

```bash
npm test -- tests/greenhouse.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/constants.ts src/greenhouse.ts tests/greenhouse.test.ts
git commit -m "fix: drop bad Greenhouse URLs and retry only HTTP 429"
```

---

### Task 4: Discord 429 retries

**Files:**
- Modify: `src/discord.ts`
- Modify: `tests/discord.test.ts`

**Interfaces:**
- Produces: `postDiscord(webhookUrl, embed, fetchImpl?)` — same signature; retries 429 only

- [ ] **Step 1: Failing tests**

- 429 then 204/200 → resolves
- 400 → throws, single attempt
- 429 × 3 → throws after retries

- [ ] **Step 2: Implement** — mirror Greenhouse 429 helper (shared private helper in each file is fine; YAGNI on extracting a shared module unless duplication hurts).

- [ ] **Step 3: Run + commit**

```bash
npm test -- tests/discord.test.ts
git add src/discord.ts tests/discord.test.ts
git commit -m "fix: retry Discord webhook posts only on HTTP 429"
```

---

### Task 5: Soft-cap round-robin helper

**Files:**
- Create: `src/soft-cap.ts`
- Create: `tests/soft-cap.test.ts`

**Interfaces:**
- Consumes: `{ companyId: string; job: Job }[]`, `cap: number`
- Produces:

```typescript
export type BoundJob = { companyId: string; job: Job };

export function selectAttemptWindow(
  bound: BoundJob[],
  cap: number = DISCORD_SOFT_CAP,
): { attempt: BoundJob[]; deferred: BoundJob[] };
```

Normative algorithm: group by `companyId`, **sort company keys ascending**, sort jobs in each group by `Number(job.id)` ascending, then round-robin take one job per company until `cap` or empty. Insertion order of `bound` must not affect company order.

- [ ] **Step 1: Failing tests**

```typescript
it("round-robins so later company ids are not starved", () => {
  const aaa = Array.from({ length: 40 }, (_, i) => ({
    companyId: "aaa",
    job: makeJob({ id: String(i + 1) }),
  }));
  const zzz = [
    { companyId: "zzz", job: makeJob({ id: "100" }) },
    { companyId: "zzz", job: makeJob({ id: "101" }) },
  ];
  const { attempt, deferred } = selectAttemptWindow([...aaa, ...zzz], 25);
  expect(attempt).toHaveLength(25);
  expect(attempt.filter((x) => x.companyId === "zzz")).toHaveLength(2);
  expect(deferred.length).toBe(40 + 2 - 25);
});

it("sorts company ids even when later ids appear first in input", () => {
  const zzz = [
    { companyId: "zzz", job: makeJob({ id: "1" }) },
    { companyId: "zzz", job: makeJob({ id: "2" }) },
  ];
  const aaa = Array.from({ length: 40 }, (_, i) => ({
    companyId: "aaa",
    job: makeJob({ id: String(i + 10) }),
  }));
  // zzz listed first on purpose — must still round-robin by sorted id
  const { attempt } = selectAttemptWindow([...zzz, ...aaa], 25);
  expect(attempt.filter((x) => x.companyId === "zzz")).toHaveLength(2);
  expect(attempt[0]?.companyId).toBe("aaa");
});
```

- [ ] **Step 2: Implement + pass + commit**

```bash
npm test -- tests/soft-cap.test.ts
git add src/soft-cap.ts tests/soft-cap.test.ts
git commit -m "feat: select Discord attempt window with fair round-robin"
```

---

### Task 6: Fleet pipeline

**Files:**
- Modify: `src/pipeline.ts`
- Modify: `src/types.ts`
- Modify: `tests/pipeline.test.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Consumes: `matchesJob(job)`, `selectAttemptWindow`, `resolveCareerDir`, `GREENHOUSE_CONCURRENCY`, company `enabled` / `name` / `id`
- Produces:

```typescript
export type RunWatcherResult = {
  exitCode: 0 | 2;
  dryRunPings: DryRunPing[];
  dryRunDeferred: DryRunPing[];
};
```

CLI JSON (print-only aliases of those fields):

```json
{ "attempt": /* dryRunPings */, "deferredSoftCapped": /* dryRunDeferred */ }
```

Keep TypeScript field names `dryRunPings` / `dryRunDeferred` everywhere in code and tests. Only the CLI stdout JSON uses `attempt` / `deferredSoftCapped`.

- [ ] **Step 1: Write failing pipeline tests** (fakes only)

Required cases:

1. **Unsafe vault path** (`careerPath: "../"`) → exit non-zero (throw/propagate), **no** `writeSeen`, no fetch needed after resolve fails.
2. **Zero enabled** → exit 0, `fetchJobs` never called, seen file unchanged.
3. **Disabled company** never fetched.
4. **Mixed first-run + ping:** company A absent key → snapshot only; company B present with new id → Discord; both in one seen write. Embed Company field equals config `name`.
5. **One company fetch throws** while another succeeds (run both in same concurrency batch) → other company still snapshots/pings; failed company’s seen key unchanged. Use fakes that reject/resolve without relying on wall-clock timing.
6. **All enabled fetch fail** → exit 2; no seen write.
7. **Vault missing/unreadable** with Discord-bound hits + a first-run company → exit 2, first-run written, Discord-bound unseen, `postDiscord`/`generateFitNote` not called.
8. **Webhook missing** with Discord-bound hits + a first-run company → same write/exit behavior as (7).
9. **Discord mid-fleet failure:** job1 posts OK, job2 throws → `exitCode: 2`; job1 recorded seen; job2 not; first-run snapshots from other companies still persisted.
10. **Soft-cap before LLM:** 40 jobs company `aaa` + 2 `zzz` → `generateFitNote` called ≤25 times; `zzz` jobs included; deferred not recorded seen.
11. **DRY_RUN** → `dryRunPings` = attempt window, `dryRunDeferred` = deferred; no write / no Discord / no LLM.
12. **Merge write:** existing `disabledco` key in seen file survives a run that never fetches it.
13. **Retain/adapt v1 pipeline regressions** (do not delete these when rewriting the file): missing `GEMINI_API_KEY` → fallback fit text + Discord still posts; `generateFitNote` throw → fallback + still posts; existing empty `{}` company key is **not** first-run; quiet day (no new jobs) → no seen write / exit 0.

- [ ] **Step 2: Implement `runWatcher` fully**

Keep the existing `fitForJob` helper (LLM try/catch → `FALLBACK_FIT_NOTE` / empty-vault note). Do not inline Gemini calls without that fallback.

Required control flow (implement this, not a thinner sketch). Wrap the body after sandbox + enabled check in `try`/`finally` so seen flushes even on unexpected throw:

```typescript
export async function runWatcher(
  opts: RunWatcherOptions,
): Promise<RunWatcherResult> {
  // 1) Sandbox first — must throw/fail before any seen write
  const careerDir = resolveCareerDir(
    opts.vaultDir,
    opts.config.vault.careerPath,
  );

  const emptyResult = (): RunWatcherResult => ({
    exitCode: 0,
    dryRunPings: [],
    dryRunDeferred: [],
  });

  const enabled = opts.config.companies.filter((c) => c.enabled);
  if (enabled.length === 0) {
    console.error("No enabled companies in companies.yaml");
    return emptyResult();
  }

  const nameById = new Map(
    opts.config.companies.map((c) => [c.id, c.name] as const),
  );

  const store = await opts.readSeen(opts.seenPath);
  const nextStore: SeenStore = structuredClone(store);
  let anyDiscordFailure = false;
  const firstRunCompanyIds = new Set<string>();
  let postDirty = false;
  const fetchFailures: string[] = [];
  const discordBound: BoundJob[] = [];

  const writeMerged = async () => {
    if (firstRunCompanyIds.size > 0 || postDirty) {
      await opts.writeSeen(opts.seenPath, nextStore);
    }
  };

  try {
    async function processCompany(company: CompanyConfig): Promise<void> {
      try {
        const jobs = await opts.fetchJobs(company);
        const matched = jobs.filter((job) => matchesJob(job));
        if (isFirstRun(store, company.id)) {
          if (!opts.dryRun) {
            nextStore[company.id] = {};
            for (const job of matched) {
              recordJob(nextStore, company.id, job, opts.now().toISOString());
            }
            firstRunCompanyIds.add(company.id);
          }
          return;
        }
        const news = newMatchingJobs(matched, store[company.id] ?? {}).sort(
          (a, b) => Number(a.id) - Number(b.id),
        );
        for (const job of news) {
          discordBound.push({ companyId: company.id, job });
        }
      } catch (err) {
        console.error(
          `Greenhouse fetch failed for ${company.id}:`,
          String(err),
        );
        fetchFailures.push(company.id);
      }
    }

    // Concurrency 10: each task must catch internally (never reject the pool).
    // Chunked Promise.all is acceptable (max 10 in flight); a sliding worker
    // pool is optional. Do NOT use bare Promise.all on fetchJobs.
    for (let i = 0; i < enabled.length; i += GREENHOUSE_CONCURRENCY) {
      const chunk = enabled.slice(i, i + GREENHOUSE_CONCURRENCY);
      await Promise.all(chunk.map((c) => processCompany(c)));
    }

    if (fetchFailures.length === enabled.length && enabled.length > 0) {
      return { exitCode: 2, dryRunPings: [], dryRunDeferred: [] };
    }

    const { attempt, deferred } = selectAttemptWindow(discordBound);
    const toPing = (b: BoundJob): DryRunPing => ({
      companyId: b.companyId,
      jobId: b.job.id,
      title: b.job.title,
      absoluteUrl: b.job.absoluteUrl,
      location: b.job.location,
    });

    if (opts.dryRun) {
      return {
        exitCode: 0,
        dryRunPings: attempt.map(toPing),
        dryRunDeferred: deferred.map(toPing),
      };
    }

    if (attempt.length > 0) {
      const webhookUrl = opts.env.DISCORD_WEBHOOK_URL;
      if (!webhookUrl) {
        return {
          exitCode: 2,
          dryRunPings: [],
          dryRunDeferred: [],
        };
      }

      let vault: VaultContents;
      try {
        vault = await opts.readVaultMarkdown(careerDir);
      } catch {
        return { exitCode: 2, dryRunPings: [], dryRunDeferred: [] };
      }

      for (const { companyId, job } of attempt) {
        const companyName = nameById.get(companyId) ?? companyId;
        // fitForJob must keep LLM try/catch → FALLBACK_FIT_NOTE
        const fit = truncate(await fitForJob(opts, vault, job), FIT_NOTE_CAP);
        try {
          await opts.postDiscord(
            webhookUrl,
            buildDiscordEmbed({
              job,
              companyName,
              companyId,
              fit,
            }),
          );
          recordJob(nextStore, companyId, job, opts.now().toISOString());
          postDirty = true;
        } catch (err) {
          console.error(`Discord post failed for job ${job.id}:`, String(err));
          anyDiscordFailure = true;
        }
      }
    }

    return {
      exitCode: anyDiscordFailure ? 2 : 0,
      dryRunPings: [],
      dryRunDeferred: [],
    };
  } finally {
    // Parent v1 behavior: flush seen even if an unexpected error escapes the try.
    if (!opts.dryRun) {
      await writeMerged();
    }
  }
}
```

**Critical rules:**

- Always `structuredClone` the full seen map; never rebuild from only this run’s companies.
- On vault/webhook failure with Discord-bound hits: persist first-run snapshots already in `nextStore` via `finally`; do **not** mark Discord-bound ids; exit `2`.
- Company embed name comes from `nameById`, not from guessing.
- `finally` must call `writeMerged` for non-dry runs so posted jobs are not lost if something throws after a successful Discord post.

- [ ] **Step 3: Update `cli.ts` dry-run print**

```typescript
console.log(
  JSON.stringify(
    {
      attempt: result.dryRunPings,
      deferredSoftCapped: result.dryRunDeferred,
    },
    null,
    2,
  ),
);
```

- [ ] **Step 4: Full test + build**

```bash
npm test
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.ts src/types.ts src/cli.ts tests/pipeline.test.ts
git commit -m "feat: run multi-company fleet with soft-cap and merge seen writes"
```

---

### Task 7: Probe script + companies.yaml fleet

**Files:**
- Create: `scripts/probe-greenhouse-boards.mjs`
- Modify: `companies.yaml`
- Modify: `README.md` (brief: how to re-probe; **do not** wire the probe into CI/`watch.yml`/`test.yml`)
- Modify: `tests/config.test.ts` (load real `companies.yaml` assertions)

**Interfaces:** none for runtime — script is manual only.

- [ ] **Step 1: Add probe script**

Create `scripts/probe-greenhouse-boards.mjs` that:

1. Reads a large candidate token list (hardcoded array + optional stdin lines).
2. `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs` (no `content`) with concurrency ≤8.
3. On HTTP 429: sleep using `Retry-After` seconds (cap 30s) or 2s/4s backoff; retry up to 2 times; then record failure.
4. Prints TSV: `token\tstatus\ttotal`.
5. Writes `companies.generated.yaml` only for HTTP 200 tokens.
6. **Id rule:** `id` = board token lowercased; if two candidates would collide after kebab normalization, keep the first and log the skipped duplicate `boardToken` (config load rejects duplicates — never emit them).
7. **Name rule:** use a small manual map for known brands (Vercel, Cloudflare, …); otherwise Title Case the token (`andurilindustries` → `Andurilindustries` is acceptable for disabled rows; fix important enabled names manually in Step 3).

Include seed tokens already known live, for example:

`vercel`, `stripe`, `cloudflare`, `figma`, `datadog`, `roblox`, `postman`, `spacex`, `andurilindustries`, `canonical`, `nuro`, `anthropic`, `xai`, `mongodb`, `gitlab`, `airbnb`, `discord`, `dropbox`, `fastly`, `launchdarkly`, `elastic`, `grafanalabs`, `planetscale`, `cockroachlabs`, `airtable`, `mixpanel`, `amplitude`, `webflow`, `algolia`, `mozilla`, `scaleai`, `togetherai`, `clickhouse`, `jetbrains`, `duolingo`, `mercury`, `twitch`, `newrelic`, `gleanwork`, `tailscale`, `temporaltechnologies`, `honeycomb`, `waymo`, `databricks`, `block`, `coinbase`, `reddit`, `lyft`, `pinterest`, `asana`, `robinhood`, `intercom`, `instacart`, `okta`, `brex`, `affirm`, `twilio`, `chime`, `netlify`, `prisma`, `inflectionai`, `customerio`, `descope`, …

Expand candidates aggressively until **≥500** HTTP 200 boards are found. If after a thorough candidate pass you still have fewer than 500, stop and document the shortfall in README (exact count); commit all verified boards — do not invent tokens.

- [ ] **Step 2: Run probe (network allowed for this step only; not CI)**

```bash
node scripts/probe-greenhouse-boards.mjs > probe-gh-boards.tsv
```

- [ ] **Step 3: Build `companies.yaml`**

Rules:

- Every HTTP 200 token gets an entry: unique `id`, `name`, `ats: greenhouse`, `boardToken`, `enabled`.
- Set `enabled: true` for **80–120** high-signal tech boards (dev tools, cloud, AI, infra, fintech, product). Must include at least: `vercel`, `cloudflare`, `stripe`, `figma`, `datadog`, `postman`, `anthropic`, `discord`, `planetscale`, `launchdarkly`, `grafanalabs`, `mongodb`, `gitlab`, `airbnb`, `roblox`. Prefer leaving mega-boards like `spacex` / `andurilindustries` **disabled** unless you accept longer Actions runs.
- All others `enabled: false`.
- Keep `vault` / `llm` headers unchanged.
- Never enable more than 120 without updating the README ops budget warning.
- **First enabled wave:** expect a longer Actions run (all new companies take silent first-run snapshots with `content=true`). Optionally stage enablement (e.g. 20 → 80 → 120) if the first wave approaches the job timeout. No Discord value until after those snapshots.
- Add to `.gitignore`: `probe-gh-boards.tsv`, `companies.generated.yaml` (probe artifacts; do not commit them).

- [ ] **Step 4: Assert fleet size in tests**

Add a vitest that loads real `companies.yaml` via `loadConfig` and asserts:

- `companies.length >= 500` **or** (if shortfall documented) `companies.length` equals the README-stated verified count
- unique `id` and unique `boardToken`
- `80 <= companies.filter(c => c.enabled).length <= 120`

- [ ] **Step 5: Commit**

```bash
git add scripts/probe-greenhouse-boards.mjs companies.yaml README.md tests/config.test.ts .gitignore
git commit -m "chore: add Greenhouse fleet companies.yaml and probe script"
```

Do **not** add the probe script to `package.json` test/watch scripts or GitHub Actions. Do **not** commit `probe-gh-boards.tsv` or `companies.generated.yaml`.

---

### Task 8: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Document:

- Multi-company Greenhouse fleet; one Discord channel.
- Matcher uses departments (Engineering/Software/SWE/AI, deny Sales/Solutions/Field/non), not Career Site Categories.
- `enabled: true|false` — only enabled boards are fetched; flip flags to expand.
- Soft cap 25 fair round-robin; dry-run JSON shows `attempt` + `deferredSoftCapped` (from `dryRunPings` / `dryRunDeferred`).
- First-run silence is **per company**.
- **Ops budget:** aim to finish a watch run in under ~8 minutes at ≤120 enabled boards (concurrency 10, 20s timeouts). Grow `enabled` only after quiet runs stay well under the Actions job timeout. Cost scales with enabled count, not the full committed list.
- **First enabled wave:** the first non-dry run after enabling many boards only writes silent per-company snapshots (no Discord). That run can be slower than steady state because every new board fetches `content=true`. If it approaches the Actions timeout, enable in stages (e.g. 20 → 80 → 120).
- Probe script is manual maintenance only; never wired into CI. Ignore `probe-gh-boards.tsv` / `companies.generated.yaml`.
- Link to expansion spec.

- [ ] **Step 2: Full verification**

```bash
npm test
npm run build
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe multi-company Greenhouse watcher usage"
```

---

## Spec coverage checklist (self-review)

| Spec requirement | Task |
| --- | --- |
| Department allow/deny whole-token + deny-any | Task 1 |
| v1 title traps + early-career/role cases | Task 1 |
| Drop Career Site Categories matching | Task 1 |
| `enabled` + remove `careerSiteCategory` + duplicates + ignore unknown keys | Task 2 |
| Bad URL drop; `meta.total` vs **raw** count; 429-only Greenhouse | Task 3 |
| Discord 429-only | Task 4 |
| Fair soft-cap ≤25 before LLM (sorted round-robin) | Tasks 5–6 |
| Vault sandbox abort before seen write | Task 6 |
| Zero enabled exit 0 | Task 6 |
| Mixed first-run + ping; merge seen write | Task 6 |
| Vault/Discord missing → first-run only, exit 2 | Task 6 |
| Discord mid-fleet failure → partial seen + exit 2 | Task 6 |
| Retain v1 LLM-fallback / empty-`{}` / quiet-day tests | Task 6 |
| `try`/`finally` seen flush after successful posts | Task 6 |
| DRY_RUN attempt + deferred | Task 6 |
| Partial company fetch failure isolation (`Promise.all` + non-rejecting tasks) | Task 6 |
| Embed Company = config `name` | Task 6 |
| ~500 verified / 80–120 enabled yaml; probe not in CI; gitignore probe artifacts | Task 7 |
| README + ops budget + first-wave note | Task 8 |
| Concurrency 10 | Task 6 (+ constant Task 3) |
| `content=true` kept; pagination guards retained | Task 3 |

## Placeholder scan

No TBD/TODO steps. Company list generation uses a real probe script rather than hand-pasting 500 rows into this plan.

## Type consistency

- `matchesJob(job: Job): boolean`
- `CompanyConfig.enabled: boolean` — no `careerSiteCategory`
- `selectAttemptWindow(bound, cap) → { attempt, deferred }`
- `RunWatcherResult`: `dryRunPings`, `dryRunDeferred` (CLI JSON aliases: `attempt`, `deferredSoftCapped`)
- Exit codes `0 | 2`
- `mapGreenhouseJob` → `Job | null`; pagination uses raw row count vs `meta.total`
