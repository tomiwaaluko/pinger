# Multi-company Greenhouse expansion (pinger)

Expand the career watcher from a single Vercel board to a large Greenhouse fleet (up to ~500 companies), with department-based matching and one Discord channel for all pings.

This spec builds on [2026-08-16-career-watcher-design.md](./2026-08-16-career-watcher-design.md). Unchanged behavior (vault sandbox, fit notes, Discord embed shape, dry-run, seen-store nesting, workflow commit rules) stays as in that doc unless this spec overrides it.

Parent success criteria that still mention Career Site Categories matching are **superseded** by this expansion’s department + title matcher.

## Motivation

Early-career SWE and AI Engineer roles appear across many Greenhouse boards, not only Vercel. v1 already treated a second Greenhouse company as a config entry; this expansion makes that real at fleet scale while keeping hosting on GitHub Actions and a single Discord webhook.

## Goals

- Commit ~500 **verified** Greenhouse board tokens in `companies.yaml`.
- Each company has `enabled: true|false`. Only enabled companies are fetched.
- Initial **enabled** wave: ~80–120 high-signal tech boards (dev tools, cloud, AI, infra, fintech, product). The rest ship disabled so coverage grows by flipping flags.
- Match via **department + title** rules shared by all companies (no per-company category field).
- Keep **one** Discord channel and one `DISCORD_WEBHOOK_URL`.
- Survive partial fleet failures: one bad board must not block other companies.
- Stay near $0: cost scales with enabled count, not the full committed list.

## Non-goals

- Ashby, Lever, Workday, or other non-Greenhouse adapters.
- Per-company Discord channels or Discord MCP setup in this phase.
- Auto-discovery cron that mutates `companies.yaml` in production.
- Changing vault / Gemini fit-note semantics.
- Scraping company careers HTML or guessing board tokens from marketing sites without an API check.
- Pinging on job removal; auto-apply; multi-user product.
- Title-only matching when department naming is exotic (accepted misses).

## Config

`companies.yaml`:

```yaml
vault:
  careerPath: Career/

llm:
  model: gemini-2.5-flash

companies:
  - id: vercel
    name: Vercel
    ats: greenhouse
    boardToken: vercel
    enabled: true

  - id: cloudflare
    name: Cloudflare
    ats: greenhouse
    boardToken: cloudflare
    enabled: true

  - id: some-other
    name: Some Other
    ats: greenhouse
    boardToken: some-other
    enabled: false
```

### Schema rules

- Required per company: `id`, `name`, `ats`, `boardToken`, `enabled`.
- `ats` must be `greenhouse`. Any other value → **fail config load** (entire run).
- `id` is the seen-store key; stable; lowercase kebab or slug style; must be unique across the file. Duplicate `id` → fail config load.
- `boardToken` is the Greenhouse Job Board API token (path segment in `boards-api.greenhouse.io/v1/boards/{token}/jobs`). Duplicate `boardToken` → fail config load.
- `enabled` is a required boolean.
- Parser reads only known fields (`vault`, `llm`, company `id` / `name` / `ats` / `boardToken` / `enabled`). Unknown keys are ignored.
- **Removed:** `careerSiteCategory`. Matching no longer uses Career Site Categories metadata. The Greenhouse adapter may still map the field onto `Job` for fixtures, but the matcher must not use it.
- Disabled companies are never fetched and never matched. Their existing `seen-jobs.json` keys are left untouched (not deleted, not rewritten) on that run.

### Migration from v1

- Update the existing `vercel` entry: add `enabled: true`; remove `careerSiteCategory`.
- Existing `seen-jobs.json` `vercel` key (including `{}`) remains valid; do not reset it.
- Update config tests that expected `careerSiteCategory`.
- Accepted behavioral change vs parent: a job whose Career Site Category was `Engineering` but whose department fails the new department gate **does not match**. Example from the parent design: Engineering-category + `Security` department (Trust & Safety) → **no match** under this expansion. Document this as an intentional regression; do not reintroduce category matching to “fix” it.

### List build (one-time / maintenance)

- Probe candidate tokens against `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs` (no auth).
- Keep only HTTP 200 boards in the committed list.
- Prefer tech-ish companies for the enabled wave; fill toward ~500 verified tokens with the remainder `enabled: false`.
- Stale tokens (later 404) are handled at runtime as per-company failures; clean them up in a later commit when noticed.

## Matcher

A job matches only if **all** of the following are true. Matching is case-insensitive. Titles use the same normalize rules as v1 (trim; collapse whitespace/hyphens; word boundaries for single-token phrases so `intern` does not match `internal`).

Department names use the **same** normalize pass as titles before token checks (trim; collapse whitespace/hyphens; case-fold).

### 1. Department gate

If `departments` is missing or empty → not a match.

Evaluate **all** department names on the job:

1. **Deny-any:** if **any** department name matches a deny token, the job fails the department gate (even if another department would allow).
2. **Allow-some:** otherwise, at least one department name must match an allow token/phrase.

This blocks dual-tagged rows such as `["Sales", "Engineering"]` or `["Sales Engineering", "Engineering"]`.

**Allow** (token / phrase match after normalize — **not** raw substring `includes`):

| Token / phrase | Match rule |
| --- | --- |
| `engineering` | phrase may appear as a whole word/token sequence (e.g. `platform engineering`) |
| `software` | whole token |
| `swe` | whole token (word boundary) |
| `ai` | whole token (word boundary) |

**Deny** (whole-token match on a department name):

| Token / phrase | Match rule |
| --- | --- |
| `sales` | whole token |
| `solution` | whole token |
| `solutions` | whole token |
| `field` | whole token |

Whole-token matching for short tokens is mandatory so `ai` does **not** match `retail`, `training`, `maintenance`, `pairing`, and `solution` does **not** match `resolution`.

Examples that **pass** the department gate (subject to title rules): `Engineering`, `Software Engineering`, `Platform Engineering`, `Product Engineering`, `AI`, `AI Platform`, `Resolution Engineering` (allow `engineering`; `resolution` is not a deny token).

Examples that **fail** the department gate: `Sales Engineering`, `Solutions Engineering`, `Field Engineering`, `Marketing`, `Finance`, `Retail`, `Training`, `Maintenance`, `Dev Eng` (no allow token), dual-tag `Sales` + `Engineering`, missing/empty departments.

### 2. Early career (unchanged from v1)

Title contains one of: `intern`, `internship`, `co-op`, `co op`, `coop`, `new grad`, `new-grad`, `newgrad`, `university`, `graduate`, or the whole token `grad`.

- `undergraduate` does not match `graduate`.
- `internal` does not match `intern`.

### 3. Role (unchanged from v1)

Title contains `software engineer`, `software engineering`, or `ai engineer`, or the whole token `swe`.

The matcher never calls the LLM. It does **not** read Career Site Categories.

### Vercel compatibility

Vercel Engineering jobs typically have an Engineering department, so they continue to match without Career Site Categories. See **Migration from v1** for the accepted category≠department miss.

## Runtime

### Greenhouse adapter (still required)

Per enabled company, keep the parent adapter contract:

- `GET .../boards/{boardToken}/jobs?content=true` (required: departments and HTML `content` for fit notes).
- Timeout **20 seconds** per HTTP request.
- Follow `Link: rel="next"` until exhausted; after all pages, if `meta.total` is present and `jobs.length !== meta.total`, treat as fetch failure for that company.
- Per **job** mapping: missing/empty/non-`https://` `absolute_url` → **drop that job** from the returned list (log once per dropped id). Do **not** fail the whole company for one bad row. A matched job that somehow lacks a usable URL after mapping cannot be Discord-posted; it is not marked seen.
- Board-level failures (non-200 after allowed retries, timeout, pagination mismatch) still skip seen updates for that company only.

Do **not** drop `content=true` to save bandwidth. Optional later optimization (out of scope): two-phase fetch hydrating content only for new hits — not in this expansion.

### Pipeline changes vs v1

1. Load `companies.yaml`. Sandbox vault path as today. Unsafe path escape → exit non-zero; **no** seen writes.
2. Select `enabledCompanies = companies.filter(c => c.enabled)`.
3. If `enabledCompanies.length === 0`: log that nothing is enabled; exit **0**; do not write `seen-jobs.json`.
4. For each enabled company, fetch Greenhouse jobs with concurrency cap **10** in flight (constant in code; not unbounded). Pagination follow-up requests for a company count toward that company’s sequential work; the cap limits how many companies’ fetches run concurrently, not total pages worldwide.
5. Match with the department + title matcher (no category argument).
6. Diff against `seen-jobs.json` **per company id**, same first-run / empty-object rules as v1 — **independently per company in the same run**:
   - Company A with **absent** seen key → first-run snapshot only (write matching ids or `{}`); **no Discord** for A.
   - Company B with **present** seen key and new matching ids → Discord-bound for those new jobs.
   - Both can happen in one run and one seen commit.
7. If there are Discord-bound hits: require readable Career folder and `DISCORD_WEBHOOK_URL` before posting.
   - If vault is missing/unreadable **or** Discord webhook is missing: **do not ping**; still merge-write successful **first-run** snapshots (and any other allowed seen updates that do not require Discord); exit **non-zero**.
   - Path sandbox escape (step 1) remains a full abort with no seen writes.
8. When Discord-bound hits are allowed to proceed: read Career folder once, generate fit notes, post embeds (company field = `companies[].name`) using the **fair soft-cap order** below.
9. Persist seen store with the **merge write** rule below.

### Concurrency

- Default Greenhouse company concurrency: **10**.
- Discord posts are sequential (one webhook). Do not parallelize Discord POSTs.

### Rate limits

**Greenhouse HTTP:**

- Retry **only** status **429** (up to **2** retries) with exponential backoff (e.g. 1s then 2s), honoring `Retry-After` when present (cap wait at 30s per retry).
- Do **not** retry other non-200 responses (including 404) or timeouts as 429-style retries. Timeout / non-429 non-200 → immediate per-company fetch failure for that request.
- If 429 retries are exhausted → per-company fetch failure: log; skip seen updates for that company; continue others.

**Discord HTTP:**

- Retry **only** status **429** (up to **2** retries) with backoff / `Retry-After` (same caps).
- Other Discord failures (4xx other than 429, 5xx, timeout) → no retry; that job is **not** marked seen; continue to the next new job; exit non-zero if any Discord post ultimately failed.

**Discord volume (fair soft cap):**

- Post at most **25** new-job embeds per watch run. Jobs not posted stay unseen and retry on a later run.
- Ordering must not starve later `companyId`s when early ids keep producing hits:
  1. Group Discord-bound jobs by company.
  2. Round-robin across companies (companies sorted by `id` ascending): take the next job from each company in turn (jobs within a company sorted by numeric id ascending) until 25 posts are attempted or the queue is empty.
- Example: with cap 25, company `aaa` having 40 new jobs and `zzz` having 2 must still get `zzz`’s jobs into the same run’s attempt window rather than draining all 25 from `aaa` first.

### Partial failure

| Failure | Behavior |
| --- | --- |
| Greenhouse 429 exhausted, other non-200, timeout, or pagination mismatch for **one** company | Log; skip seen updates for **that** company; continue other companies. |
| One job with bad `absolute_url` | Drop that job; continue mapping/matching the rest of the board. |
| All enabled companies fail to fetch | Exit non-zero. |
| Zero enabled companies | Exit 0; no seen write. |
| Vault path unsafe (escapes `VAULT_DIR`) | Fail entire run; no seen writes (unchanged). |
| Vault missing/unreadable or Discord webhook missing when Discord-bound hits exist | No pings; merge-write first-run snapshots that completed; exit non-zero. |
| Discord failure for a job (after allowed retries) | Do not mark that job seen (unchanged). |
| LLM failure | Fallback fit text; still post (unchanged). |

Exit non-zero if any Discord post failed after retries, or if every enabled fetch failed. A mix of some company fetch failures + successful others is exit 0 when every attempted Discord post (subject to the 25-cap) succeeded.

### Seen store

Unchanged shape:

```json
{
  "vercel": {},
  "cloudflare": {
    "123": { "title": "Software Engineer Intern", "firstSeenAt": "..." }
  }
}
```

**Merge write (normative):**

1. Load the full existing `seen-jobs.json` (or `{}` if missing).
2. Update **only** companies that completed fetch+match successfully in this run:
   - First-run: set `seen[companyId]` to the snapshot map (`{}` or matched ids).
   - Later run: add ids that Discord-posted successfully (and only those).
3. Persist the **merged** object.
4. **Never** delete keys for disabled companies, unfetched companies, or companies that failed fetch in this run.
5. Do not rebuild the file from only this run’s successful company subset.

Other rules:

- First run for a company: key absent → write key + matching ids or `{}`; no Discord for that company.
- Enabling a previously never-run company (`enabled: false` → `true` with no seen key) is a first run for that company only.
- Disabling a company leaves its seen entries in place; re-enabling does not re-ping old ids.
- IDs that disappear from Greenhouse stay in the file (unchanged parent rule). Long-term file growth is accepted; commit conflicts still use the parent rebase-once policy.

### Discord

- One channel, one webhook.
- Embed Company field is the config `name`.
- Footer remains `pinger · {id}`.
- Primary URL remains Greenhouse `absolute_url`.
- Security posture unchanged: untrusted job HTML; never paste Career-folder / PII into Discord; truncate fit/title/location as in parent.

No Discord MCP, no per-company webhooks in this phase.

## Workflows

`watch.yml` and `test.yml` stay structurally the same. Watch still sparse-checkouts the vault, runs the CLI, commits only `seen-jobs.json`.

**Ops budget:** Target finishing a watch run in under **~8 minutes** at ≤120 enabled boards with concurrency 10 and 20s timeouts. Grow enabled count only after recent runs stay well under the Actions job timeout on quiet days. Cost and duration scale with **enabled** count, not the full ~500 committed list.

## Testing

All tests remain offline fakes.

- **Matcher department gate:** allow hits for Engineering / Software / SWE / AI (word-boundary safe); deny Sales Engineering, Solutions Engineering, Field Engineering; **fail** Retail / Training / Maintenance even with early-career SWE titles; **pass** Resolution Engineering (not denied by `solution` substring); empty departments fail; `Dev Eng` fails allowlist; dual-tag `Sales` + `Engineering` **fails** (deny-any).
- **Matcher titles:** early-career and role cases from v1 still pass/fail as before; `internal` / `undergraduate` traps unchanged.
- **Accepted regression:** fixture with Engineering **category** metadata + non-allow department (e.g. Security / Trust & Safety style) → **no match**.
- **Config:** `enabled` required; no `careerSiteCategory` in schema; unknown keys ignored; duplicate `id` or `boardToken` fails load; non-`greenhouse` `ats` fails load; disabled companies excluded from the run list; zero enabled → exit 0, no fetch, no seen write.
- **Adapter mapping:** board with one bad `absolute_url` and other valid jobs → only the bad job dropped; company fetch still succeeds; first-run / match proceeds for valid rows.
- **Pipeline:** only enabled companies call fetch; one company fetch failure does not clear or rewrite other companies’ seen keys (merge write); mixed run: company A missing key snapshots silently while company B with new id pings; Discord company field uses config name; all enabled fetches fail → non-zero; Discord failure mid-fleet still persists other companies’ successful updates / first-run snapshots via merge write; vault/Discord missing with Discord-bound hits → no pings, first-run snapshots still merge-written, exit non-zero; multi-company `DRY_RUN` → no Discord, no LLM, no seen write.
- **Rate limits (fakes):** Greenhouse 429 then success retries; Greenhouse 404 is not retried; Greenhouse 429 exhausted → that company skipped; Discord 429 exhausted → job not seen; soft cap 25 with round-robin: early `companyId` with many hits does not consume the entire cap before a later company with fewer hits.
- **Concurrency:** not required to assert timing; fakes may be sequential. Assert fetch was invoked once per enabled company.

## Success criteria

- After silent first snapshots for newly enabled companies, a new matching role on any enabled board produces exactly one Discord embed in the shared channel within a scheduled run (subject to the fair 25-post soft cap).
- Sales / Solutions / Field Engineering departments do not ping even with intern in the title; dual-tag Sales + Engineering does not ping.
- Departments like Retail / Training / Maintenance do not pass the `AI` allow token.
- Disabled companies produce zero network calls.
- Expanding coverage is editing `enabled: true` (and optionally adding verified tokens), not a redesign.
- Quiet days with N enabled boards stay within free Actions comfort at 3 runs/day.

## Extensibility (later, out of scope)

- Discord MCP to create per-company channels if volume becomes painful.
- Ashby/Lever adapters returning the same `Job` shape.
- Optional per-company department allow/deny overrides if a board’s naming is pathological.
- Two-phase Greenhouse fetch (list without content; hydrate content only for new hits).
