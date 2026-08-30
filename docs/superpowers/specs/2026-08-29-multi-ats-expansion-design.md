# Multi-ATS expansion (pinger)

Expand the career watcher beyond Greenhouse to cover **Ashby**, **Workday**, and (later) **custom** career portals — using a shared job shape, one matcher, one Discord channel, and the refined **950-company** target list in `data/target-companies-refined.yaml`.

This spec builds on:

- [2026-08-16-career-watcher-design.md](./2026-08-16-career-watcher-design.md) — v1 single-company Greenhouse watcher
- [2026-08-20-multi-company-greenhouse-expansion-design.md](./2026-08-20-multi-company-greenhouse-expansion-design.md) — fleet Greenhouse expansion (implemented on `feat/multi-company-greenhouse`)

Unchanged unless this spec overrides: vault sandbox, fit-note semantics, Discord embed shape, dry-run, merge-write seen-store rules, workflow commit-only-`seen-jobs.json`, fair 25-post soft cap, partial per-company fetch failure.

## Motivation

Of the **950** refined target employers, ATS coverage today is:

| ATS | Companies | Already covered |
| --- | ---: | --- |
| Greenhouse | 641 | Yes (`feat/multi-company-greenhouse`) |
| Workday | 79 | No |
| Ashby | 17 | No |
| Custom | 43 | No (Google, Apple, Amazon, Meta, quant portals, etc.) |
| Unknown | 170 | Needs ATS probing / manual classification |

Early-career SWE roles at Boeing, Disney, Expedia, Intel, JPMorgan, RTX, and most big banks post on **Workday**. High-signal startups (Notion, Cognition, Cursor, Ramp) post on **Ashby**. Without these adapters, pinger misses ~10% of tier-1 targets and all of the hottest AI-native boards.

## Goals

- Support **multiple ATS adapters** behind one pipeline: Greenhouse, Ashby, Workday.
- Keep **one matcher** (department + title rules from the Greenhouse fleet spec).
- Keep **one Discord webhook** and one `seen-jobs.json`.
- Load companies from an expanded `companies.yaml` generated from `data/target-companies-refined.yaml`.
- **Phased enablement**: ship adapters incrementally; most companies stay `enabled: false` until verified.
- Initial enabled waves (after Greenhouse fleet):
  - **Ashby wave**: commit all 17 Ashby rows in `companies.yaml`; enable all 17 once the adapter is verified (small fleet, official API, low runtime cost).
  - **Workday wave**: commit all probed Workday rows; enable **~25–40** tier-1 companies initially (banks, defense, semis, travel). Remaining Workday rows stay `enabled: false` until staged.
- Survive partial fleet failures per company (unchanged).
- Stay near **$0** on GitHub Actions; LLM cost only on new Discord-bound hits.

## Non-goals

- **Custom portal adapters** in this phase (Google, Apple, Amazon, Meta, Jane Street, etc.). They stay in the target list with `ats: custom` and `enabled: false` until a deliberate per-portal effort.
- **Lever**, **iCIMS**, **Taleo**, **SuccessFactors** standalone adapters.
- Scraping HTML careers pages without a JSON feed.
- Auto-mutating `companies.yaml` from a production cron.
- Per-company Discord channels.
- Pinging on job removal; auto-apply; multi-user product.
- ATS discovery at runtime (tenant/board probing during watch runs). Probing is an **offline maintenance script** only.

## Target company inventory

Source of truth for *who* to watch: `data/target-companies-refined.yaml` (950 companies).

Maintenance scripts (already in repo):

| Script | Output |
| --- | --- |
| `scripts/compile-target-companies.mjs` | Raw merge → `data/target-companies.yaml` |
| `scripts/refine-target-companies.mjs` | Refined list → `data/target-companies-refined.yaml` |

New maintenance scripts (this expansion):

| Script | Purpose |
| --- | --- |
| `scripts/probe-ashby-boards.mjs` | Verify Ashby `boardName` slugs; output TSV |
| `scripts/probe-workday-boards.mjs` | Verify Workday CXS list endpoint; output TSV |
| `scripts/sync-companies-yaml.mjs` | Merge refined targets + probe artifacts into `companies.yaml` |

### Config enrichment (refined list → watch config)

`data/target-companies-refined.yaml` records **who** to watch (`ats`, `tier`, `boardToken` for Greenhouse) but not full adapter config for Ashby/Workday. Enrichment is **offline only**:

| Source | Provides |
| --- | --- |
| Refined YAML | `slug`, `name`, `ats`, `boardToken` (Greenhouse only) |
| `data/ashby-boards.tsv` (probe output) | `slug`, `boardName`, `status` |
| `data/workday-boards.tsv` (probe output) | `slug`, `host`, `tenant`, `site`, `status`, `jobCount` |
| `data/ashby-board-overrides.yaml` (curated) | slug → `boardName` when slug ≠ Ashby board slug (e.g. Applied Intuition) |

**Ashby `boardName` resolution** (in order):

1. Curated override in `ashby-board-overrides.yaml`.
2. Verified row in `ashby-boards.tsv` with `status: ok`.
3. Probe guess: `slug` with hyphens removed (e.g. `applied-intuition` → `appliedintuition`) — only if probe returns 200.

**Workday block resolution:**

1. Verified row in `workday-boards.tsv` with `status: ok`.
2. Otherwise skip upsert for that company (no `workday` block in `companies.yaml`).

Careers URLs for probing come from curated seed lists in probe scripts (tier-1/2 employers), manual additions, or future ATS-classification work on the 170 `unknown` rows.

`sync-companies-yaml.mjs` rules:

- Read `data/target-companies-refined.yaml`, probe TSVs, overrides, and existing `companies.yaml`.
- **Skip** refined rows with `ats: unknown` — they never appear in `companies.yaml` until reclassified.
- Upsert when adapter config is verified:
  - `greenhouse` + `boardToken`
  - `ashby` + resolved `boardName`
  - `workday` + `{ host, tenant, site }` from probe TSV
  - `custom` → row with `enabled: false` only (no adapter fields)
- Preserve existing `enabled` flags unless `--reset-enabled` is passed.
- Default **new** entries to `enabled: false`.
- Optional `--enable-wave ashby|workday-tier1` sets `enabled: true` on a curated constant (tier-1 + `earlyCareerVerified`) for initial rollout; Ashby wave enables all 17 verified Ashby rows; Workday wave enables ~25–40, not all 79.

## Architecture

### Adapter registry

Introduce a small ATS layer. Each adapter implements **list** + optional **hydrate** so Workday can defer expensive detail fetches until after match, seen diff, and soft-cap selection:

```typescript
type AtsAdapter = {
  ats: "greenhouse" | "ashby" | "workday";
  listJobs(company: CompanyConfig, fetch: FetchLike): Promise<Job[]>;
  hydrateContent?(
    company: CompanyConfig,
    fetch: FetchLike,
    jobs: Job[],
  ): Promise<Job[]>;
};
```

| Adapter | `listJobs` | `hydrateContent` |
| --- | --- | --- |
| Greenhouse | Full jobs (`content` included) | omitted (no-op) |
| Ashby | Full jobs (`content` included) | omitted (no-op) |
| Workday | List rows; `content: ""` | Fetches `jobDescription` for passed jobs only |

`getAdapter(ats)` returns the registry entry. Export `setAdapterRegistryForTests(...)` (or equivalent) so pipeline tests can stub adapters without live HTTP.

Greenhouse logic moves from `src/greenhouse.ts` into `src/adapters/greenhouse.ts` unchanged in **list** behavior.

```text
companies.yaml
  → config loader (discriminated union by ats)
  → for each enabled company:
       adapter.listJobs → Job[]
       matcher → Job[]
       seen-store diff (per company id)
  → build discord-bound set (new matched ids)
  → soft cap (≤25 attempt window)
  → for Workday jobs in attempt window only:
       adapter.hydrateContent → Job[] with content
  → fit note → Discord
  → merge-write seen-jobs.json
```

Deferred soft-cap jobs stay **unseen** (same as Greenhouse fleet). They are not hydrated this run.

### Canonical `Job` shape

Keep the existing `Job` type from the Greenhouse fleet. All adapters map into it:

| Field | Purpose |
| --- | --- |
| `id` | Stable string id for seen-store (Greenhouse numeric id, Ashby `id`, Workday `jobReqId` — see Workday mapping) |
| `title` | Job title |
| `location` | Display location string |
| `departments` | String array for department gate; **empty array fails the gate** |
| `careerSiteCategory` | Optional; mapped when available; **matcher ignores it** |
| `absoluteUrl` | HTTPS apply/view URL for Discord embed |
| `content` | Plain or HTML description for fit note (untrusted) |

Adapters must drop rows with missing/invalid `absoluteUrl` (same rule as Greenhouse fleet).

### Seen store

Rename the inner key concept from `greenhouseId` to `jobId` in types/docs. **On disk**, existing `seen-jobs.json` entries remain valid — keys were always opaque strings.

```json
{
  "stripe": {
    "1234567": { "title": "Software Engineer, New Grad", "firstSeenAt": "..." }
  },
  "boeing": {
    "JR2026516706": { "title": "Associate Software Engineer", "firstSeenAt": "..." }
  }
}
```

No migration script required. Code treats inner keys as ATS-agnostic `jobId`.

## Config

### Schema (discriminated union)

```yaml
vault:
  careerPath: Career/

llm:
  model: gemini-2.5-flash

companies:
  # Greenhouse (unchanged)
  - id: stripe
    name: Stripe
    ats: greenhouse
    boardToken: stripe
    enabled: true

  # Ashby
  - id: notion
    name: Notion
    ats: ashby
    boardName: notion
    enabled: false

  # Workday
  - id: boeing
    name: Boeing
    ats: workday
    workday:
      host: boeing.wd1.myworkdayjobs.com
      tenant: boeing
      site: external_subsidiary
    enabled: false

  # Custom — config load accepts but watch skips
  - id: google
    name: Google
    ats: custom
    enabled: false
```

### Per-ATS required fields

| `ats` | Required fields | Notes |
| --- | --- | --- |
| `greenhouse` | `boardToken`, `enabled` | Same as fleet spec |
| `ashby` | `boardName`, `enabled` | Slug from `jobs.ashbyhq.com/{boardName}` |
| `workday` | `workday.host`, `workday.tenant`, `workday.site`, `enabled` | Parsed from careers URL during list build |
| `custom` | `enabled` only | Must be `enabled: false` at config load (fail if true) |

### Config validation rules

- `id`: unique lowercase slug (unchanged).
- `ats`: one of `greenhouse`, `ashby`, `workday`, `custom`.
- `enabled`: required boolean.
- `custom` with `enabled: true` → **fail config load** (no adapter yet).
- Unknown keys on company rows ignored (forward compatible).
- Duplicate `boardToken` / `boardName` / `(host, site)` triple → fail config load.

### Workday URL parsing (offline)

Careers URLs follow patterns like:

```text
https://boeing.wd1.myworkdayjobs.com/external_subsidiary/job/...
https://disney.wd5.myworkdayjobs.com/disneycareer/job/...
https://expedia.wd108.myworkdayjobs.com/search/job/...
```

Parser extracts:

- `host` — full hostname (`boeing.wd1.myworkdayjobs.com`)
- `tenant` — subdomain before `.wd{N}` (`boeing`)
- `site` — first path segment after optional locale (`en-US`, `en-us`) (`external_subsidiary`, `disneycareer`, `search`)

Locale segments to strip: `en-US`, `en-us`, `en-GB`, etc.

`scripts/probe-workday-boards.mjs` (new): given a careers URL, verify the CXS list endpoint returns 200 and append a row to `data/workday-boards.tsv`.

`scripts/probe-ashby-boards.mjs` (new): given a slug and candidate `boardName`, verify `GET .../posting-api/job-board/{boardName}` returns 200 and append a row to `data/ashby-boards.tsv`.

## ATS adapters

### Greenhouse (existing)

No behavior change. Move to `src/adapters/greenhouse.ts`.

Contract unchanged from [multi-company Greenhouse spec](./2026-08-20-multi-company-greenhouse-expansion-design.md):

- `GET .../boards/{boardToken}/jobs?content=true`
- 20s timeout; pagination; 429 retry; drop bad `absolute_url` rows.

### Ashby

**Official public API** — documented at [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api).

```http
GET https://api.ashbyhq.com/posting-api/job-board/{boardName}
```

Optional: `?includeCompensation=true` (not needed for matching).

Mapping:

| Job field | Ashby source |
| --- | --- |
| `id` | `id` |
| `title` | `title` |
| `location` | `location` (+ secondary locations joined if present) |
| `departments` | `[department]` if present, else `[]` |
| `absoluteUrl` | `jobUrl` or `applyUrl` |
| `content` | `descriptionPlain` or stripped `descriptionHtml` |

Filter before mapping:

- Skip if `isListed === false`.
- Skip if no `jobUrl` and no `applyUrl`.

Fetch rules:

- Timeout **20 seconds**.
- Retry **429** only (up to 2, same backoff caps as Greenhouse).
- Non-200 → per-company fetch failure.

**Department gate note:** Ashby exposes a single `department` string. Jobs with no department fail the department gate (accepted miss). Before shipping Ashby, capture a real fixture from at least one target board (e.g. Notion) and record what % of SWE postings include `department`. If **>30%** of early-career SWE postings lack department on enabled boards, add a per-company YAML override or title-only department inference in a fast-follow — **not in v1** unless the fixture check fails.

### Workday

**Undocumented CXS JSON API** used by the public careers UI. Not a published contract; build defensively.

#### List endpoint

```http
POST https://{host}/wday/cxs/{tenant}/{site}/jobs
Content-Type: application/json
Accept-Language: en-US

{"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": ""}
```

Critical constraints (documented by multiple integrators):

- **`limit` must be ≤ 20.** Higher values return `200` with an **empty** `jobPostings` array (silent failure).
- Paginate with `offset += 20` until `jobPostings` is empty or `total` exhausted.
- POST required; GET is not useful.

#### Detail endpoint (for description)

```http
GET https://{host}/wday/cxs/{tenant}/{site}{externalPath}
Accept: application/json
```

Returns `jobDescription` (HTML), `timeType`, `jobReqId`, locations, etc.

#### Mapping

| Job field | Workday source |
| --- | --- |
| `id` | **`jobReqId`** if present; else `bulletFields[0]`; else stable id parsed from `externalPath` (last `_`-suffix segment). Must match between list and detail responses for the same posting. |
| `title` | `title` from list item |
| `location` | `locationsText` or joined `locations` |
| `departments` | Parse from `title` or facet metadata if present; default `["Engineering"]` **only when** title matches SWE role tokens — see below |
| `absoluteUrl` | `https://{host}{externalPath}` or `externalUrl` if https |
| `content` | `jobDescription` from detail response |

**Workday department inference (narrow exception):**

Workday list payloads often omit structured departments. For jobs whose titles contain `software engineer`, `software engineering`, `ai engineer`, or whole-token `swe`, set `departments: ["Engineering"]` **only if** the list row has no department field. This is intentionally narrow — it does not apply to generic titles.

Jobs that fail early-career or role title checks never receive the inference.

#### Fetch strategy

**Two-phase** via `listJobs` + `hydrateContent` (cost control):

1. **`listJobs`** — paginate all postings at `limit: 20`; map lightweight rows (`content: ""`); pipeline runs matcher on title + inferred department.
2. **`hydrateContent`** — pipeline calls this **only** for Workday jobs in the soft-cap **attempt window** (new matched ids that survived seen diff and round-robin selection). Fetches `jobDescription` for those ids only.

Do **not** hydrate descriptions for the full board, all matcher hits, or deferred soft-cap jobs in a single run.

#### Fetch rules

- Timeout **20 seconds** per HTTP call.
- Retry **429** only (up to 2). Some tenants sit behind Cloudflare; on **403**, retry once after 2s; if still 403, log per-company fetch failure with `host` and skip seen update for that company.
- Pagination or JSON shape errors → per-company fetch failure.
- Concurrency: max **3** Workday companies in flight (lower than Greenhouse's 10 — heavier pagination).

## Matcher

**Unchanged** from the Greenhouse fleet spec: department gate (allow/deny tokens with word boundaries) + early-career title tokens + SWE/AI role tokens.

No per-ATS matcher variants in this expansion.

### Accepted Workday miss modes

- Non-engineering departments with correct titles (e.g. `Software Engineer` in `Information Technology` if not caught by allow tokens) — accepted.
- Over-broad `Engineering` inference on Workday — mitigated by requiring SWE role tokens before inference.

## Runtime

### Pipeline changes

Replace per-company `fetchJobs` injection with adapter dispatch. Per enabled company:

```typescript
const adapter = getAdapter(company.ats);
const jobs = await adapter.listJobs(company, fetch);
// ... matcher, seen diff, build discordBound ...
```

After `selectAttemptWindow`, hydrate Workday content for attempt-window jobs only:

```typescript
for (const company of workdayCompaniesWithAttemptJobs) {
  const adapter = getAdapter("workday");
  const hydrated = await adapter.hydrateContent!(company, fetch, attemptJobsForCompany);
  // merge content back into attempt window by job.id
}
```

Tests may call `setAdapterRegistryForTests` instead of live adapters.

`custom` companies are excluded before fetch (`enabled: false` enforced at config load).

### Soft-cap job ordering

The Greenhouse fleet soft-cap sorts jobs within each company by id. **This spec extends that rule** for opaque string ids (Workday `JR…`, Ashby UUIDs):

- Parse both ids as integers; if **both** are finite numbers, sort numerically ascending.
- Otherwise sort **lexicographically** ascending (`localeCompare`).

Company id round-robin order is unchanged (sorted `companyId` ascending). Update `selectAttemptWindow` accordingly — do not use `Number(job.id)` alone.

### Concurrency by ATS

| ATS | Max companies in flight |
| --- | ---: |
| Greenhouse | 10 |
| Ashby | 5 |
| Workday | 3 |

Implement as a single pool keyed by adapter type, or sequential batches per ATS — either is fine if totals are respected.

### Partial failure

Extend the Greenhouse fleet table with:

| Failure | Behavior |
| --- | --- |
| Ashby 404 for `boardName` | Per-company fetch failure; log; skip seen update for that company |
| Workday empty `jobPostings` with `limit > 20` | Treat as adapter bug; fail company fetch |
| Workday CXS shape change (missing `jobPostings`) | Per-company fetch failure; alert in logs |
| Workday 403 / Cloudflare block | Retry once after 2s; then per-company fetch failure; log `host`; skip seen update |
| Workday detail fetch fails for one job | Drop `content` for that job; still match and ping with title/location only |
| Mixed ATS run | Same merge-write, soft-cap, exit 2 rules as fleet spec |

### Discord

Unchanged. Primary URL is `absoluteUrl` from whichever ATS posted the job.

Footer: `pinger · {company.id}`.

## Workflows

`watch.yml` and `test.yml` unchanged structurally.

**Ops budget:** With Ashby (17) + Workday (≤40 enabled) + Greenhouse (≤120 enabled), target quiet runs under **~10 minutes**. Workday two-phase fetch is the main duration risk — keep Workday enabled count staged.

**First enable:** Same silent first-run snapshot rules per company as the Greenhouse fleet spec.

## Testing

All tests offline with fakes. No live network in CI.

### Adapter unit tests

**Ashby:**

- Maps `department`, `jobUrl`, `descriptionPlain`.
- Drops `isListed: false`.
- 404 → throws (company fetch failure).

**Workday:**

- Parses careers URL → `{ host, tenant, site }`.
- List pagination at `limit: 20` across 45 postings → 3 requests.
- `limit: 100` fixture returns empty → adapter treats as failure (guard).
- `hydrateContent` called only for attempt-window job ids (not all matcher hits, not deferred jobs).
- Soft-cap sorts `JR2026516706` before `JR9999999999` lexicographically; numeric Greenhouse ids still sort numerically.
- Department inference applies only when title has SWE tokens and no native department.

### Config tests

- `ats: ashby` requires `boardName`.
- `ats: workday` requires `workday.host/tenant/site`.
- `ats: custom` + `enabled: true` fails load.
- Duplicate Workday `(host, site)` fails load.

### Pipeline tests

- Mixed Greenhouse + Ashby + Workday enabled companies in one run.
- One Workday company fails; others still update seen store.
- Discord embed URL uses Ashby `jobUrl` / Workday constructed URL.

## Phased delivery

| Phase | Scope | Enabled target |
| --- | --- | ---: |
| **0** | Greenhouse fleet (done) | ~120 |
| **1** | Ashby adapter + config schema + probe | 17 enabled after verify |
| **2** | Workday adapter + URL probe script | 25–40 |
| **3** | `sync-companies-yaml` from refined list | 950 committed, most disabled |
| **4** | ATS probe for 170 unknowns | reclassify over time |
| **5** | Custom portals | out of scope here |

Recommended implementation order: **schema + adapter interface → Ashby → Workday → sync script**.

Ashby first because it has an official API and only 17 companies. Workday second because it unlocks 79 tier-1/2 employers.

## Success criteria

- A new early-career SWE role at an **enabled Ashby** company (e.g. Notion) produces exactly one Discord embed within one scheduled run.
- A new early-career SWE role at an **enabled Workday** company (e.g. Boeing, Expedia) produces exactly one Discord embed within one scheduled run.
- Greenhouse behavior unchanged for existing enabled companies.
- Disabled companies produce zero network calls across all ATS types.
- `companies.yaml` can represent all 950 refined targets; ≤200 enabled without exceeding Actions time budget on quiet days.
- Workday adapter never sends `limit > 20` on list requests.
- Workday `hydrateContent` runs only for jobs in the soft-cap attempt window (verify via pipeline test spy).
- Quiet mixed-ATS run (≤17 Ashby + ≤40 Workday + ≤120 Greenhouse enabled, no new hits) completes in **<10 minutes** on GitHub Actions `ubuntu-latest`.

## Extensibility (later)

- Custom portal adapters (Google Careers JSON, Amazon Jobs API, Microsoft apply.careers.microsoft.com) — one module per portal family.
- Lever public API (`/lever.co/{company}`) — same adapter pattern.
- Per-company department overrides in YAML if Ashby/Workday misses are too frequent.
- Optional RSS/Atom feeds where companies publish them.
