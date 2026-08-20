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
- Bad `absolute_url`: drop that job; do **not** fail the company.
- Exit **2** on Discord post failure or vault/Discord missing when Discord-bound hits exist; exit non-zero if every enabled fetch failed (use `2`); exit `0` when zero companies enabled.
- One Discord channel / one webhook. Company name in embed fields.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/types.ts` | Drop `careerSiteCategory` from `CompanyConfig`; add `enabled`; extend dry-run result with deferred ids |
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
    ["AI Engineer Intern", ["AI"], true],
    ["AI Engineer Intern", ["AI Platform"], true],
    ["Software Engineer Intern", ["Software Engineering"], true],
    ["SWE Intern", ["Platform Engineering"], true],
    ["Software Engineer Intern", ["Resolution Engineering"], true],
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
    ["Senior Software Engineer", ["Engineering"], false],
    ["Software Engineer, Trust & Safety", ["Security"], false],
    ["Member of the Technical Staff, Internal Agent ", ["Engineering"], false],
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

Expected: PASS (pipeline still fetches all companies; enabled filter is Task 5).

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

- [ ] **Step 1: Add constants**

```typescript
export const GREENHOUSE_CONCURRENCY = 10;
export const DISCORD_SOFT_CAP = 25;
export const HTTP_429_MAX_RETRIES = 2;
export const HTTP_429_RETRY_AFTER_CAP_MS = 30_000;
```

- [ ] **Step 2: Write failing tests**

- Page with one bad `absolute_url` and one good job → returns only the good job (length 1).
- First response 429 with `Retry-After: 0` (or tiny), second 200 → success.
- Response 404 → throws immediately; fetch called once.
- Response 429 then 429 then 429 → throws after 3 attempts (1 + 2 retries).

Use fake `fetchImpl` with a call counter. For backoff tests, stub `Retry-After: 0` so tests stay fast.

- [ ] **Step 3: Implement**

Change `mapGreenhouseJob` to return `Job | null`: on bad URL, `console.error` once and return `null`. In `fetchGreenhouseJobs`, `pageJobs.map(...).filter((j): j is Job => j !== null)`.

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

- [ ] **Step 1: Failing test**

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
```

Algorithm: group by `companyId`, sort company keys ascending, sort jobs in each group by `Number(job.id)`, then round-robin pop until `cap` or empty.

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
- Modify: `src/types.ts` (`DryRunPing` / result may add `deferredSoftCapped: DryRunPing[]`)
- Modify: `tests/pipeline.test.ts`
- Modify: `src/cli.ts` if dry-run JSON shape changes

**Interfaces:**
- Consumes: updated `matchesJob`, `selectAttemptWindow`, company `enabled`
- Produces: `runWatcher` exit codes per spec

- [ ] **Step 1: Write failing pipeline tests** (fakes only)

Required cases:

1. **Zero enabled** → exit 0, `fetchJobs` never called, seen file unchanged.
2. **Disabled company** never fetched.
3. **Mixed first-run + ping:** company A absent key → snapshot only; company B present with new id → Discord; both in one seen write.
4. **One company fetch throws** → other company still snapshots/pings; failed company’s seen key unchanged.
5. **All enabled fetch fail** → exit 2.
6. **Vault missing with Discord-bound hits + a first-run company** → exit 2, first-run written, Discord-bound unseen, `postDiscord`/`generateFitNote` not called.
7. **Soft-cap before LLM:** 40 jobs company `aaa` + 2 `zzz` → `generateFitNote` called ≤25 times; `zzz` jobs included; deferred not recorded seen.
8. **DRY_RUN** → prints attempt window; includes deferred list; no write / no Discord / no LLM.
9. **Merge write:** existing `disabledco` key in seen file survives a run that never fetches it.

Sketch for result type:

```typescript
export type RunWatcherResult = {
  exitCode: 0 | 2;
  dryRunPings: DryRunPing[];
  dryRunDeferred: DryRunPing[];
};
```

- [ ] **Step 2: Implement pipeline** (behavioral outline — implement fully in code)

```typescript
const enabled = opts.config.companies.filter((c) => c.enabled);
if (enabled.length === 0) {
  console.error("No enabled companies in companies.yaml");
  return { exitCode: 0, dryRunPings: [], dryRunDeferred: [] };
}

const store = await opts.readSeen(opts.seenPath);
const nextStore: SeenStore = { ...structuredClone(store) }; // or deep clone
let anyDiscordFailure = false;
let firstRunDirty = false;
let postDirty = false;
const fetchFailures: string[] = [];
const discordBound: BoundJob[] = [];

// concurrency-10 map over enabled
for (const company of /* batches of 10 */) {
  try {
    const jobs = await opts.fetchJobs(company);
    const matched = jobs.filter((job) => matchesJob(job));
    if (isFirstRun(store, company.id)) {
      if (!opts.dryRun) {
        nextStore[company.id] = {};
        for (const job of matched) {
          recordJob(nextStore, company.id, job, opts.now().toISOString());
        }
        firstRunDirty = true;
      }
      continue;
    }
    const news = newMatchingJobs(matched, store[company.id] ?? {}).sort(
      (a, b) => Number(a.id) - Number(b.id),
    );
    for (const job of news) {
      discordBound.push({ companyId: company.id, job });
    }
  } catch (err) {
    console.error(`Greenhouse fetch failed for ${company.id}:`, String(err));
    fetchFailures.push(company.id);
  }
}

if (fetchFailures.length === enabled.length) {
  // no seen write
  return { exitCode: 2, dryRunPings: [], dryRunDeferred: [] };
}

const { attempt, deferred } = selectAttemptWindow(discordBound);

if (opts.dryRun) {
  // map attempt/deferred to DryRunPing; no write
  return { exitCode: 0, dryRunPings: ..., dryRunDeferred: ... };
}

if (attempt.length > 0) {
  const webhookUrl = opts.env.DISCORD_WEBHOOK_URL;
  // if !webhookUrl or vault read fails:
  //   writeSeen only if firstRunDirty (nextStore first-run keys); return exit 2
  // else fit+post sequential; recordJob into nextStore on success
}

if (firstRunDirty || postDirty) {
  await opts.writeSeen(opts.seenPath, nextStore); // full merge object
}
```

Implement real concurrency with a simple pool (e.g. process `enabled` in chunks of `GREENHOUSE_CONCURRENCY` with `Promise.all`).

**Critical:** Always start from full loaded `store` / `nextStore` clone; never rebuild from only this run’s companies.

Vault read failure when `attempt.length > 0`: write first-run-only changes (compare keys that were first-run this pass), do not mark Discord-bound ids, exit 2.

- [ ] **Step 3: Update `cli.ts` dry-run print**

Print JSON like:

```json
{ "attempt": [ ... ], "deferredSoftCapped": [ ... ] }
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
- Modify: `README.md` (brief: how to re-probe)

**Interfaces:** none for runtime — script is manual.

- [ ] **Step 1: Add probe script**

Create `scripts/probe-greenhouse-boards.mjs` that:

1. Reads a candidate token list (hardcode a large array of slugs + optional stdin lines).
2. `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs` (no content) with concurrency ~12.
3. Prints TSV: `token\tstatus\ttotal`.
4. Optionally writes `companies.generated.yaml` fragments.

Include seed tokens already known live from research, for example:

`vercel`, `stripe`, `cloudflare`, `figma`, `datadog`, `roblox`, `postman`, `spacex`, `andurilindustries`, `canonical`, `nuro`, `anthropic`, `xai`, `mongodb`, `gitlab`, `airbnb`, `discord`, `dropbox`, `fastly`, `launchdarkly`, `elastic`, `grafanalabs`, `planetscale`, `cockroachlabs`, `airtable`, `mixpanel`, `amplitude`, `webflow`, `algolia`, `mozilla`, `scaleai`, `togetherai`, `clickhouse`, `jetbrains`, `duolingo`, `mercury`, `twitch`, `newrelic`, `gleanwork`, `tailscale`, `temporaltechnologies`, `honeycomb`, `waymo`, `databricks`, `block`, `coinbase`, `reddit`, `lyft`, `pinterest`, `asana`, `robinhood`, `intercom`, `instacart`, `okta`, `brex`, `affirm`, `twilio`, `chime`, `netlify`, `prisma`, `inflectionai`, `customerio`, `descope`, …

Expand the candidate list aggressively (common tech brand slugs) until ≥500 HTTP 200 boards are found, or document the shortfall and commit all verified boards.

- [ ] **Step 2: Run probe (network allowed for this step only)**

```bash
node scripts/probe-greenhouse-boards.mjs > /tmp/gh-boards.tsv
```

- [ ] **Step 3: Build `companies.yaml`**

Rules:

- Every HTTP 200 token gets an entry: `id` = token (kebab if needed), `name` = Title Case heuristic or manual map for known brands, `ats: greenhouse`, `boardToken`, `enabled`.
- Set `enabled: true` for ~80–120 high-signal tech boards (dev tools, cloud, AI, infra, fintech, product) including at least: vercel, cloudflare, stripe, figma, datadog, postman, anthropic, discord, planetscale, launchdarkly, grafanalabs, mongodb, gitlab, airbnb, roblox, spacex (optional — large board), etc.
- All others `enabled: false`.
- Keep `vault` / `llm` headers unchanged.
- Do not enable more than ~120 without an ops note in README.

- [ ] **Step 4: Config still parses**

```bash
node -e "import { loadConfig } from './dist/config.js'; console.log(loadConfig('companies.yaml').companies.filter(c=>c.enabled).length)"
```

Or run a small vitest that loads the real `companies.yaml` and asserts `companies.length >= 100`, unique ids, and enabled count between 80 and 120.

- [ ] **Step 5: Commit**

```bash
git add scripts/probe-greenhouse-boards.mjs companies.yaml README.md tests/config.test.ts
git commit -m "chore: add Greenhouse fleet companies.yaml and probe script"
```

---

### Task 8: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Document:

- Multi-company Greenhouse fleet; one Discord channel.
- Matcher uses departments (Engineering/Software/SWE/AI, deny Sales/Solutions/Field/non), not Career Site Categories.
- `enabled: true|false` — only enabled boards are fetched; flip flags to expand.
- Soft cap 25 fair round-robin; dry-run shows `attempt` + `deferredSoftCapped`.
- First-run silence is **per company**.
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
| Drop Career Site Categories matching | Task 1 |
| `enabled` + remove `careerSiteCategory` + duplicates | Task 2 |
| Bad URL drop; 429-only Greenhouse | Task 3 |
| Discord 429-only | Task 4 |
| Fair soft-cap ≤25 before LLM | Tasks 5–6 |
| Zero enabled exit 0 | Task 6 |
| Mixed first-run + ping; merge seen write | Task 6 |
| Vault/Discord missing → first-run only, exit 2 | Task 6 |
| DRY_RUN attempt + deferred | Task 6 |
| Partial company fetch failure isolation | Task 6 |
| ~500 verified / ~80–120 enabled yaml | Task 7 |
| README | Task 8 |
| Concurrency 10 | Task 6 (+ constant Task 3) |
| `content=true` kept | Task 3 (unchanged URL) |

## Placeholder scan

No TBD/TODO steps. Company list generation uses a real probe script rather than hand-pasting 500 rows into this plan.

## Type consistency

- `matchesJob(job: Job): boolean`
- `CompanyConfig.enabled: boolean` — no `careerSiteCategory`
- `selectAttemptWindow(bound, cap) → { attempt, deferred }`
- `RunWatcherResult` includes `dryRunDeferred`
- Exit codes `0 | 2`
