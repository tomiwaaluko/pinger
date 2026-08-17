# pinger

Personal GitHub Actions watcher. It checks Vercel Engineering openings a few times a day and pings Discord when a new intern, co-op, or new-grad Software Engineer or AI Engineer role appears.

There is no web UI and no always-on host.

## What it does

1. Fetches `https://boards-api.greenhouse.io/v1/boards/vercel/jobs?content=true`
2. Keeps jobs whose Career Site Category is Engineering and whose title is early-career SWE / AI Engineer
3. Diffs IDs against `seen-jobs.json`
4. On the first run, writes the `vercel` key (often `{}`) and sends nothing
5. On later new hits, reads `Career/` from a private Obsidian vault repo, asks Gemini for a short fit note, and posts a Discord embed whose URL is the Greenhouse `absolute_url`

## GitHub secrets (watch workflow only)

| Name | Purpose |
| --- | --- |
| `DISCORD_WEBHOOK_URL` | Discord incoming webhook |
| `VAULT_REPO` | `owner/name` of the private vault repo |
| `VAULT_TOKEN` | PAT or fine-grained token with `contents: read` on that repo |
| `GEMINI_API_KEY` | Gemini API key |

Set all four before the first watch run. `test.yml` does not receive them.

The watch workflow needs to push `seen-jobs.json`. Repo **Settings → Actions → General → Workflow permissions** must be **Read and write**. `permissions: contents: write` in `watch.yml` is not enough if the org/repo default is read-only; the `chore: record seen jobs` push will fail.

## First run

Use **Actions → watch → Run workflow**. Leave `dry_run` unchecked for the silent snapshot, or check it to print would-be pings without writing `seen-jobs.json`.

The first non-dry run **snapshots currently-open matching jobs without pinging them**. That is intentional. If the live board already has an intern role, you will not get a Discord embed for it; only jobs that appear *after* that snapshot ping. If the board has no matching roles (typical today), the commit is `"vercel": {}`.

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

Company list and Gemini model id live in `companies.yaml`. Title matching rules are code in `src/matcher.ts`. If Gemini rejects `gemini-2.5-flash`, change `llm.model`.
