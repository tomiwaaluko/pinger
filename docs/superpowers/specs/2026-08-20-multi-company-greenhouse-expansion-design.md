# Multi-company Greenhouse expansion (pinger)

Expand the career watcher from a single Vercel board to a large Greenhouse fleet (up to ~500 companies), with department-based matching and one Discord channel for all pings.

This spec builds on [2026-08-16-career-watcher-design.md](./2026-08-16-career-watcher-design.md). Unchanged behavior (vault sandbox, fit notes, Discord embed shape, dry-run, seen-store nesting, workflow commit rules) stays as in that doc unless this spec overrides it.

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
- `ats` must be `greenhouse` in this expansion.
- `id` is the seen-store key; stable; lowercase kebab or slug style; unique.
- `boardToken` is the Greenhouse Job Board API token (path segment in `boards-api.greenhouse.io/v1/boards/{token}/jobs`).
- **Removed:** `careerSiteCategory`. Matching no longer uses Career Site Categories metadata.
- Disabled companies are never fetched, never matched, and never written into `seen-jobs.json` on that run.

### List build (one-time / maintenance)

- Probe candidate tokens against `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs` (no auth).
- Keep only HTTP 200 boards in the committed list.
- Prefer tech-ish companies for the enabled wave; fill toward ~500 verified tokens with the remainder `enabled: false`.
- Stale tokens (later 404) are handled at runtime as per-company failures; clean them up in a later commit when noticed.

## Matcher

A job matches only if **all** of the following are true. Matching is case-insensitive. Titles use the same normalize rules as v1 (trim; collapse whitespace/hyphens; word boundaries for single-token phrases so `intern` does not match `internal`).

### 1. Department gate

At least one `departments[].name` must:

- Contain one of: `Engineering`, `Software`, `SWE`, `AI`
- **and** that same department name must **not** contain: `Sales`, `Solution`, `Solutions`, `Field`

Examples that **pass** the department gate (subject to title rules): `Engineering`, `Software Engineering`, `Platform Engineering`, `Product Engineering`, `AI`, `AI Platform`.

Examples that **fail** the department gate: `Sales Engineering`, `Solutions Engineering`, `Field Engineering`, `Marketing`, `Finance`, `Dev Eng` (does not contain an allow token), missing/empty departments. Odd org names that omit Engineering/Software/SWE/AI are accepted misses; title-only matching stays out of scope.

If `departments` is missing or empty → not a match.

### 2. Early career (unchanged from v1)

Title contains one of: `intern`, `internship`, `co-op`, `co op`, `coop`, `new grad`, `new-grad`, `newgrad`, `university`, `graduate`, or the whole token `grad`.

- `undergraduate` does not match `graduate`.
- `internal` does not match `intern`.

### 3. Role (unchanged from v1)

Title contains `software engineer`, `software engineering`, or `ai engineer`, or the whole token `swe`.

The matcher never calls the LLM. It does **not** read Career Site Categories.

### Vercel compatibility

Vercel Engineering jobs typically have an Engineering department, so they continue to match without Career Site Categories. Jobs that were Engineering-category but non-Engineering department were already rare; if any slip out, that is an accepted trade for fleet-wide department matching.

## Runtime

### Pipeline changes vs v1

1. Load `companies.yaml`. Sandbox vault path as today.
2. Select `companies.filter(c => c.enabled)`.
3. For each enabled company, fetch Greenhouse jobs with a **concurrency cap** (implementation target: 8–12 in flight).
4. Match with the department + title matcher (no category argument).
5. Diff against `seen-jobs.json` **per company id**, same first-run / empty-object rules as v1.
6. For new hits across all companies: read Career folder once, generate fit notes, post Discord embeds (company field = `companies[].name`).
7. Write updated seen map for companies that progressed (first-run snapshots and successfully posted jobs).

### Concurrency

- Cap parallel Greenhouse fetches (e.g. 8–12).
- Do not open one connection per enabled company unbounded.
- Discord posting for new jobs may stay sequential by numeric job id within a company, or globally ordered by `(companyId, jobId)`; either is fine if every new job posts at most once. Prefer stable ordering: sort companies by `id`, then jobs by numeric id ascending (same spirit as v1).

### Partial failure

| Failure | Behavior |
| --- | --- |
| Greenhouse non-200, timeout, or pagination mismatch for **one** company | Log; skip seen updates for **that** company; continue other companies. Do not fail the entire fleet solely because one board failed. |
| All enabled companies fail to fetch | Exit non-zero. |
| Vault path unsafe | Fail entire run; no seen writes (unchanged). |
| Discord failure for a job | Do not mark that job seen (unchanged). |
| LLM failure | Fallback fit text; still post (unchanged). |

Record a non-zero exit if any Discord post failed, or if every enabled fetch failed. A mix of some company fetch failures + successful others is exit 0 if Discord succeeded for all attempted new jobs (fetch failures only skip those companies).

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

- First run for a company: key absent → write key + matching ids or `{}`; no Discord.
- Enabling a previously never-run company (`enabled: false` → `true` with no seen key) is a first run for that company only.
- Disabling a company leaves its seen entries in place; re-enabling does not re-ping old ids.

### Discord

- One channel, one webhook.
- Embed Company field is the config `name`.
- Footer remains `pinger · {id}`.
- Primary URL remains Greenhouse `absolute_url`.

No Discord MCP, no per-company webhooks in this phase.

## Workflows

`watch.yml` and `test.yml` stay structurally the same. Watch still sparse-checkouts the vault, runs the CLI, commits only `seen-jobs.json`.

Operational note: Actions duration grows with enabled count. Start at ~80–120 enabled; raise only after runs stay comfortably under the job timeout.

## Testing

All tests remain offline fakes.

- **Matcher:** departments containing Engineering / Software / SWE / AI pass the gate; Sales Engineering, Solutions Engineering, Field Engineering fail; empty departments fail; early-career and role title cases from v1 still pass/fail as before; `internal` / `undergraduate` traps unchanged.
- **Config:** `enabled` required boolean; parser reads only known fields (`id`, `name`, `ats`, `boardToken`, `enabled`) — no `careerSiteCategory`. Disabled companies excluded from the run list.
- **Pipeline:** only enabled companies call fetch; one company fetch failure does not clear or rewrite other companies’ seen keys; first-run silence still per company; Discord company field uses config name.
- **Concurrency:** not required to assert timing; fakes may be sequential. Optional: assert fetch was invoked once per enabled company.

## Success criteria

- After silent first snapshots for newly enabled companies, a new matching role on any enabled board produces exactly one Discord embed in the shared channel within a scheduled run.
- Sales / Solutions / Field Engineering departments do not ping even with intern in the title.
- Disabled companies produce zero network calls.
- Expanding coverage is editing `enabled: true` (and optionally adding verified tokens), not a redesign.
- Quiet days with N enabled boards stay within free Actions comfort at 3 runs/day.

## Extensibility (later, out of scope)

- Discord MCP to create per-company channels if volume becomes painful.
- Ashby/Lever adapters returning the same `Job` shape.
- Optional per-company department allow/deny overrides if a board’s naming is pathological.
