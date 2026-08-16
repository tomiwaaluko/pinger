# Career Watcher (pinger)

Personal GitHub Actions watcher that checks Vercel Engineering openings a few times a day and pings Discord when a new intern, co-op, or new-grad Software Engineer or AI Engineer role appears. Each ping includes a short fit note written from a Career folder in a private Obsidian vault repo.

This is a single-user tool. No accounts, no web UI, no always-on host.

## Motivation

Early-career SWE and AI Engineer roles appear and fill quickly. Manually refreshing [vercel.com/careers](https://vercel.com/careers?function=Engineering) is easy to miss. The careers page is a frontend over Vercel’s Greenhouse board; the watcher uses that same public JSON feed so it does not scrape HTML or drive a browser.

## Goals

- Ping Discord when a **new** matching Vercel role is published.
- Match only **Engineering** jobs whose titles are intern / co-op / new-grad **and** Software Engineer or AI Engineer.
- On each new hit, write a short “why this fits / doesn’t” note from the vault’s Career folder.
- Stay near **$0**: GitHub Actions for hosting; LLM only when there is a new match.
- First run is silent: snapshot current matches, do not dump existing listings into Discord.
- Adding another Greenhouse company later is a config entry, not a rewrite.

## Non-goals (v1)

- Web UI, resume upload, or in-app settings.
- Reading the whole Obsidian vault (Career folder only).
- Syncing Obsidian to git (the user keeps the private vault repo updated).
- Scraping `vercel.com/careers` or using a headless browser.
- Non-Greenhouse applicant tracking systems.
- Slack, email, or SMS.
- Pinging when a job is removed.
- Auto-applying or filling Greenhouse applications.
- Multi-user product, auth, or billing.

## Architecture

`pinger` is a Node.js CLI run by a scheduled GitHub Action. There is no server and no database.

Each run:

1. Load `companies.yaml` and secrets.
2. Fetch Vercel jobs from the public Greenhouse Job Board API.
3. Keep jobs that pass the matcher.
4. Diff against `seen-jobs.json`.
5. If first run for that company: write matching IDs, commit, exit (no Discord, no LLM).
6. If there are new IDs: sparse-checkout the vault Career folder, generate a fit note per job, post Discord, then commit the new IDs.

```text
cron (3x/day)
  → Greenhouse JSON (board: vercel)
  → matcher (Engineering + early-career + SWE/AI Engineer)
  → seen-jobs.json diff
  → [new hits only] Career folder + Gemini Flash → Discord webhook
  → commit seen-jobs.json
```

Discord is the interface. GitHub Actions logs are the operations console.

## Stack

- **Runtime:** Node.js 22, TypeScript, npm.
- **Tests:** Vitest, all fakes offline (no live Greenhouse, Discord, or LLM in CI).
- **Schedule:** GitHub Actions cron at `0 12,17,23 * * *` (UTC). That is about 8:00 / 13:00 / 19:00 US Eastern in daylight time, and one hour earlier in standard time. Drift of one hour is acceptable.
- **Manual run:** `workflow_dispatch` with a boolean `dry_run` input. That sets `DRY_RUN=true`: print what would ping; do not call Discord, the LLM, or leave `seen-jobs.json` dirty.
- **LLM:** Google Gemini Flash, model id from `companies.yaml` (`gemini-2.5-flash`). One call per new matching job. Unused on quiet days.

## Components

### Workflow

`.github/workflows/watch.yml`

- Triggers: cron above, plus `workflow_dispatch`.
- Permissions: `contents: write` (commit `seen-jobs.json`).
- Steps: checkout `pinger`; sparse-checkout the vault repo into `./vault` (only `vault.careerPath`, using `VAULT_TOKEN`); `npm ci`; `npm test`; run the watcher with `VAULT_DIR=./vault`; if `seen-jobs.json` changed, commit and push; if the watcher exited non-zero, fail the job after that commit so posted jobs stay recorded. First run ignores the vault files. A missing `VAULT_TOKEN` fails the workflow (set all secrets at setup).
- The CLI never runs `git commit`. The workflow is the only writer of git history.
- Concurrency group `watch` with `cancel-in-progress: false` so overlapping runs do not drop a ping.

### Config

`companies.yaml` in the repo (not secret):

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
    department: Engineering
    careersUrlTemplate: https://vercel.com/careers/{slug}-{id}
```

Title rules are code defaults (see Matcher), not per-company YAML in v1. A later company can reuse the same matcher until a company needs different rules.

### Greenhouse adapter

`GET https://boards-api.greenhouse.io/v1/boards/{boardToken}/jobs?content=true`

No auth. One request per company per run. Use `content=true` so new hits already include HTML descriptions.

Map each job to:

| Field | Source |
| --- | --- |
| `id` | Greenhouse numeric id (string in the seen store) |
| `title` | `title` |
| `location` | `location.name` |
| `departments` | department names |
| `absoluteUrl` | Greenhouse `absolute_url` |
| `careersUrl` | `careersUrlTemplate` with `{id}` = Greenhouse id and `{slug}` = title lowercased, each run of non-alphanumeric characters turned into one hyphen, leading/trailing hyphens stripped. Example: `Software Engineer, AI SDK` + `5474915004` → `https://vercel.com/careers/software-engineer-ai-sdk-5474915004`. |
| `content` | HTML description (for the LLM only) |

If Greenhouse returns non-200, the adapter throws. The run fails; `seen-jobs.json` is not updated.

### Matcher

A job matches only if **all** of the following are true. Matching is case-insensitive and uses word boundaries (so `intern` does not match `internal`).

1. **Department:** at least one department name equals `Engineering`.
2. **Early career:** the title contains one of these phrases: `intern`, `internship`, `co-op`, `co op`, `coop`, `new grad`, `new-grad`, `newgrad`, `university grad`, `university graduate`. Single-token phrases use word boundaries (`intern` does not match `internal`). Multi-word phrases match as substrings after collapsing whitespace and hyphens for comparison (`new-grad` and `new grad` are the same).
3. **Role:** the title contains `software engineer`, `software engineering`, or `ai engineer`, or the whole token `swe`.

Explicitly **out**: Engineering Manager, DevRel, Solutions, Security-only titles, “Senior Software Engineer” with no intern/co-op/new-grad token, Associate/Junior unless they also match the early-career list, sales and other departments.

The matcher never calls the LLM.

### Seen store

`seen-jobs.json` committed in this repo:

```json
{
  "vercel": {
    "5474915004": {
      "title": "Software Engineer Intern",
      "firstSeenAt": "2026-08-16T12:00:00.000Z"
    }
  }
}
```

- Key: `{companyId}.{greenhouseId}`.
- First run (missing file, or missing company key): write all **current matching** IDs, commit, send nothing.
- New IDs: ping, then append.
- IDs that disappear stay in the file. The same Greenhouse ID returning later does not ping again. A new posting gets a new ID and will ping.

### Vault reader

- Repo: `VAULT_REPO` (e.g. `username/obsidian-vault`).
- Auth: `VAULT_TOKEN` (PAT or fine-grained token with `contents: read` on that repo).
- Path: `vault.careerPath` in `companies.yaml` (default `Career/`). Not a secret.
- Local root: `VAULT_DIR` (workflow sets `./vault`).
- Read every `*.md` file under that folder recursively. Skip any path segment named `.obsidian`. Concatenate with a `## {relativePath}` heading per file.
- Cap total text at 32,000 characters. Prefer files whose names contain `resume`, `experience`, `skills`, or `projects`, then the rest by filename.
- Ignore `.obsidian` and non-markdown files.
- Empty folder: still ping; fit note is `Career folder is empty; no profile context.`

Keeping the vault repo in sync with Obsidian is the user’s process, not this app.

### Fit note

Called only for new matcher hits.

- Input: concatenated Career markdown + job title, location, `careersUrl`, and stripped description text (HTML tags removed, cap description at 8,000 characters).
- Output: 2–4 sentences. State whether it looks like a fit and why, citing concrete overlap or gaps (stack, intern vs new-grad, location). No preamble, no markdown headings.
- Model: Gemini Flash via API key `GEMINI_API_KEY`.
- On LLM failure: Discord still posts; fit field is `Fit note unavailable.` The job is still marked seen after a successful Discord post so the channel is not spammed. Re-run by hand if a note is needed later.

### Discord notifier

Incoming webhook URL in `DISCORD_WEBHOOK_URL`. One embed per new job:

- **Title:** job title (clickable).
- **URL:** `careersUrl` (`vercel.com/careers/…`), not the Greenhouse apply URL.
- **Fields:** Company (`companies[].name`), Location, Fit (the note).
- Footer: `pinger · vercel`.

If the webhook fails, the job is **not** marked seen.

## Data flow

1. Load `companies.yaml`. Greenhouse needs no secret.
2. Fetch Greenhouse jobs for each company (v1: Vercel only).
3. Run the matcher.
4. Load `seen-jobs.json`. If the company has no seen set, write all current matching IDs, exit 0 (workflow commits). No vault, Discord, or LLM.
5. `newJobs = matched − seen`. If empty, exit 0 with `seen-jobs.json` unchanged.
6. Require `DISCORD_WEBHOOK_URL`, `VAULT_DIR` with a readable Career folder. Missing Discord or vault on this path fails before any ping. `GEMINI_API_KEY` missing is treated as an LLM failure (fallback fit text), not a hard fail.
7. Load Career folder markdown.
8. For each new job, in numeric id ascending order:
   - Generate fit note (or fallback).
   - Post Discord embed.
   - Only after Discord succeeds, add the id to the in-memory seen set.
9. If the seen set changed, write `seen-jobs.json`. Exit 0 if every new job posted; exit 2 if at least one Discord post failed. The workflow then commits if the file changed, then fails the job on non-zero exit.

Commit message from the workflow: `chore: record seen jobs`.

A Discord failure on job 2 does not un-see job 1. Job 2 retries on the next run.

## Error handling

| Failure | Behavior |
| --- | --- |
| Greenhouse non-200 or timeout | Fail the workflow. Do not change `seen-jobs.json`. No Discord. |
| Vault checkout fails (workflow) | Fail the workflow. Do not run the watcher. |
| Vault read fails (CLI, Career path missing/unreadable) | If there are new matches, fail before Discord. If there are no new matches, succeed (first run and quiet days do not read the folder). |
| LLM error | Post Discord with fallback fit text. Mark seen after Discord succeeds. |
| Discord webhook error | Do not mark that job seen. Write seen IDs for jobs that did post. Exit 2. Workflow commits the file, then fails. |
| `seen-jobs.json` commit conflict | Pull rebase once and retry the commit. Still failing → fail the workflow. |
| Empty matcher results on a later run | Success. Do not clear seen IDs. |

One Greenhouse fetch per company per run. The three daily schedules are the retry policy.

## Secrets

GitHub Actions secrets (never committed):

| Name | Purpose |
| --- | --- |
| `DISCORD_WEBHOOK_URL` | Discord incoming webhook |
| `VAULT_REPO` | `owner/name` of the private vault repo |
| `VAULT_TOKEN` | Read access to that repo |
| `GEMINI_API_KEY` | Gemini API key |

Career folder path is only `vault.careerPath` in `companies.yaml`. `VAULT_DIR` is the local checkout root set by the workflow (`./vault`).

## Testing

CI runs `npm test` on every watch workflow and on pull requests. No test talks to the network.

- **Matcher:** fixtures for intern / co-op / new-grad SWE and AI Engineer (pass); Engineering Manager, DevRel Engineer, Senior Software Engineer with no early-career token, Account Executive (fail); department other than Engineering (fail); `internal` must not match `intern`.
- **Seen store:** first run reports zero new and persists IDs; second run with one extra ID reports that ID; a disappeared ID that returns with the same id is not new.
- **Pipeline with fakes:** stub Greenhouse JSON, vault files, LLM, Discord. First run → no Discord, no LLM. New match → one LLM call, one webhook. LLM error → webhook still sent with fallback. Discord error → ID not marked seen.
- **Config:** Vercel entry parses (`boardToken: vercel`, department Engineering, career path).
- **URL slug:** title `Software Engineer, AI SDK` + id `5474915004` → `https://vercel.com/careers/software-engineer-ai-sdk-5474915004`.
- **Manual:** `workflow_dispatch` with boolean `dry_run` (sets `DRY_RUN=true`).

## Extensibility

v1 ships one company: Vercel via Greenhouse. A second Greenhouse company is a new `companies.yaml` entry (new `id`, `boardToken`, `careersUrlTemplate`). A non-Greenhouse ATS needs a new adapter module that returns the same job shape; that is a later spec.

## Success criteria

- After the first silent snapshot, a newly published matching Vercel role produces exactly one Discord embed within one scheduled run.
- Non-matching Engineering jobs (managers, DevRel, mid/senior SWE with no intern/new-grad token) never ping.
- Quiet days cost $0 beyond GitHub Actions minutes (well under the free private-repo allowance at ~3 short runs/day).
- Fit notes mention Career-folder details when the folder has content; they never block the ping.
