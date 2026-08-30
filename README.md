# pinger

Personal GitHub Actions watcher. It polls Greenhouse, Ashby, and Workday job boards a few times a day and pings **one** Discord channel when a new intern, co-op, or new-grad Software Engineer or AI Engineer role appears at any enabled company.

There is no web UI and no always-on host.

Design and rollout notes:

- [Multi-company Greenhouse expansion spec](docs/superpowers/specs/2026-08-20-multi-company-greenhouse-expansion-design.md)
- [Multi-ATS expansion spec](docs/superpowers/specs/2026-08-29-multi-ats-expansion-design.md)

## What it does

1. Loads `companies.yaml` and fetches only companies with `enabled: true` via ATS adapters (`greenhouse`, `ashby`, `workday`). Custom portal rows load with `enabled: false` only.
2. Keeps jobs whose **departments** pass allow/deny rules and whose title is early-career SWE / AI Engineer (see [Matching](#matching)).
3. Diffs job IDs against per-company keys in `seen-jobs.json`.
4. On a company's **first run**, writes that company's key (often `{}`) and sends nothing to Discord.
5. On later new hits, applies a fair round-robin soft cap (≤25 jobs per run before LLM/Discord). Workday descriptions are hydrated only for jobs in that attempt window. Reads `Career/` from a private Obsidian vault repo, asks Gemini for a short fit note, and posts a Discord embed whose URL is the job's `absoluteUrl`. Embed **Company** is the config `name`.

Partial failures are isolated: one bad board does not block other companies. A mid-fleet Discord failure still records successful posts and exits 2.

## Regenerating the company list

```bash
node scripts/compile-target-companies.mjs
node scripts/refine-target-companies.mjs
node scripts/probe-ashby-boards.mjs      # optional; network
node scripts/probe-workday-boards.mjs    # optional; network; reads data/workday-careers-urls.yaml
node scripts/sync-companies-yaml.mjs
```

Ashby `boardName` overrides live in `data/ashby-board-overrides.yaml`. Workday careers URL seeds live in `data/workday-careers-urls.yaml` (probe verifies each CXS endpoint before sync).

## Matching

Matching uses **departments**, not Greenhouse Career Site Categories.

- **Allow** (whole-token match in any department name): `engineering`, `software`, `swe`, `ai`
- **Deny** (any match rejects the job): `sales`, `solution`, `solutions`, `field`, `non`

Title rules (shared by all companies) require both an early-career phrase (intern, co-op, new grad, university, graduate, …) and a role phrase (software engineer, software engineering, ai engineer, swe). Rules live in `src/matcher.ts`.

## GitHub secrets (watch workflow only)

| Name | Purpose |
| --- | --- |
| `DISCORD_WEBHOOK_URL` | Discord incoming webhook |
| `VAULT_REPO` | `owner/name` of the private vault repo |
| `VAULT_TOKEN` | PAT or fine-grained token with `contents: read` on that repo |
| `GEMINI_API_KEY` | Gemini API key |

Set all four before the first watch run that should ping Discord. `test.yml` does not receive them and sets `permissions: contents: read`, so the test workflow cannot push even if the repo default token is write-capable.

The watch workflow needs to push `seen-jobs.json`. Repo **Settings → Actions → General → Workflow permissions** must be **Read and write**. `permissions: contents: write` in `watch.yml` is not enough if the org/repo default is read-only; the `chore: record seen jobs` push will fail.

## First run (per company)

First-run silence is **per company**: each company id gets one silent snapshot before any Discord pings for that company.

Use **Actions → watch → Run workflow**. Leave `dry_run` unchecked for the silent snapshot, or check it to print would-be pings without writing `seen-jobs.json`.

A dry run before a company's first snapshot always omits that company from output (first runs never ping). After a real (non-dry) watch has written e.g. `"acme": {}`, later dry runs list would-be pings for that company.

The first non-dry run for a company **snapshots currently-open matching jobs without pinging them**. That is intentional. If the live board already has a matching role, you will not get a Discord embed for it; only jobs that appear *after* that snapshot ping.

Dry-run JSON (stdout):

```json
{
  "attempt": [ /* up to 25 jobs that would post this run */ ],
  "deferredSoftCapped": [ /* remaining new jobs deferred by the soft cap */ ]
}
```

## Ops budget

Aim to finish a watch run in **under ~8 minutes** with **≤140 enabled** boards (concurrency 10, 20s timeouts). A full 139-board dry run currently takes about **7 minutes**. Cost scales with **enabled** count, not the full committed list in `companies.yaml`.

Grow `enabled` only after quiet runs stay well under the Actions job timeout.

### First enabled wave

The first non-dry run after enabling many boards only writes silent per-company snapshots (no Discord). That run can be slower than steady state because every new board fetches `content=true`. If it approaches the Actions timeout, enable in stages (e.g. 20 → 80 → 120).

## Local

```bash
npm ci
npm test
npm run build
```

Bash:

```bash
DRY_RUN=true VAULT_DIR=./vault npm start
```

Windows PowerShell:

```powershell
$env:DRY_RUN='true'; $env:VAULT_DIR='./vault'; npm start
```

Do not point local `npm start` at production Discord unless you intend to ping. `./vault` is gitignored; still never commit Career markdown.

## Config

Company list and Gemini model id live in `companies.yaml`. Each entry has:

```yaml
- id: acme
  name: Acme
  ats: greenhouse
  boardToken: acme
  enabled: true   # only enabled boards are fetched; flip to false to pause
```

`companies.yaml` ships ~500 verified Greenhouse boards (HTTP 200 probe on 2026-08-20) with ~100 enabled in the first wave. Enable more by setting `enabled: true`; disable to pause without removing coverage.

Title matching rules are code in `src/matcher.ts`. If Gemini rejects `gemini-2.5-flash`, change `llm.model`.

### Manual Greenhouse re-probe (maintenance only)

```bash
node scripts/probe-greenhouse-boards.mjs > probe-gh-boards.tsv
```

The probe is **manual maintenance only** — not wired into npm scripts or CI. Ignore gitignored artifacts `probe-gh-boards.tsv` and `companies.generated.yaml`.
