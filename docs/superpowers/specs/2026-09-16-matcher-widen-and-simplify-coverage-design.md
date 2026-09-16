# Matcher widen and Simplify coverage checklist (pinger)

Widen title matching so US SWE/AI roles that look like new-grad or L1 ping the **new-grad** Discord channel, keep internship routing from PR #5, and add an **offline** checklist against Simplify’s public lists. Watch runs still poll first-party ATS boards only.

This spec builds on:

- [2026-09-09-us-season-filters-and-big-tech-portals-design.md](./2026-09-09-us-season-filters-and-big-tech-portals-design.md) (shipped in PR #4)
- Internship dual-webhook routing (PR #5: `feat: added internship pings`)

Unchanged unless this spec overrides: vault sandbox, fit-note semantics, dry-run, merge-write seen-store, workflow commit-only-`seen-jobs.json`, fair 25-post soft cap, per-company fetch isolation, GitHub Actions hosting, US location gate, intern 2027 season rule, new-grad year extractor, portal trust boundary (public unauthenticated JSON only).

This document **replaces** the Sep 9 “closed Scale AI / Stripe matcher-polish corpus” with the explicit keep/drop title rules below. US, year, intern-season, and dual-webhook behavior stay as shipped.

## Motivation

Simplify’s [New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions) SWE table is full of titles pinger drops: `Junior Software Engineer`, `Software Engineer 1`, `Early Career`, `SDE I`, and bare `Software Engineer`. Those are the roles the new-grad channel should see. Pinger already has intern/co-op on a second webhook (any Winter/Spring/Summer/Fall **2027** season). The gap is new-grad/L1 wording, not a second job feed.

Scraping that README as a ping source would duplicate ATS jobs, add Simplify tracking links, and skip department/JD data. A maintenance checklist can still use Simplify to see which companies and titles we miss, then suggest `companies.yaml` edits you apply in waves.

## Goals

- Ping the **new-grad** webhook for US SWE/AI titles that are junior / entry / early-career / associate / L1 (`engineer 1` / `sde i`) **or** bare `Software Engineer` / `AI Engineer` / `SWE` / `SDE` with no intern language, subject to the yearless-or-2027 rule.
- Keep intern/co-op on `DISCORD_WEBHOOK_URL_INTERN` with PR #5 season rules.
- Drop mid/senior titles (`senior`, `staff`, `II`, manager, …) so opening bare `Software Engineer` does not flood the new-grad channel.
- Add a **manual** coverage script against Simplify new-grad SWE + Summer 2027 internship listings. Print miss reasons and a **delta** yaml suggestion. Never ping Discord from those lists.
- Stay on first-party ATS polling in `watch.yml`.

## Non-goals

- Scraping Simplify READMEs or `listings.json` as a Discord job feed.
- LinkedIn Jobs or Jobright.ai adapters (follow-on aggregator spec).
- Lever, iCIMS, Taleo, SuccessFactors standalone adapters.
- Enabling Google, Meta, Microsoft, or Apple from the checklist.
- Overwriting `companies.yaml` from the script or from watch.
- Wiring the checklist into `watch.yml` or a weekly Action.
- Changing intern season rules, US location rules, soft cap, or first-run silence.
- Auto-apply, extra Discord fields, or always-on hosting.

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Scope | Matcher widen + offline Simplify checklist. Not a third ping source. |
| Relation to Sep 9 | Same US + year + intern-season gates. New title keep/drop list replaces closed-corpus polish. |
| Intern routing | Unchanged from PR #5. Intern language wins; intern webhook. |
| Bare SWE | Keep. Non-intern role matches take the new-grad path even without the words “new grad”. |
| Associate SWE | Keep (new-grad path). `associate` is **not** a deny token. |
| Mid/senior deny | Title-only: `senior`, `sr`, `staff`, `principal`, `lead`, `manager`, `director`, roman `ii`/`iii`/`iv`, and role+level `2`/`3`/`4` (see Matcher). |
| Role phrases | Existing set plus `sde` so `SDE I` can pass. |
| Checklist sources | `listings.json` from New-Grad-Positions (SWE) and Summer2027-Internships (SWE-equivalent). Not README HTML. |
| Checklist apply | Sidecar delta yaml. Human copies into `companies.yaml` in waves. |
| Suggested enables | Existing Greenhouse / Ashby / Workday rows; Amazon / NVIDIA / OpenAI if still disabled and they have adapters. |
| Suggested adds | Unknown companies as `ats: custom`, `enabled: false`. |
| Aggregators | LinkedIn / Jobright named only as later work. |

## Architecture

Two paths. Watch is ATS. Simplify is maintenance.

```text
Watch (matcher + jobTrack only)
  companies.yaml (enabled)
    → existing adapters (greenhouse | ashby | workday | amazon | nvidia | openai)
    → matchesJob
         dept → role (incl. sde) → title deny → US
         intern language? intern 2027 season : new-grad year (yearless or 2027)
    → jobTrack: intern → intern webhook; all other matches → new-grad webhook
    → seen-store / soft cap 25 / fit note / Discord

Checklist (manual; not in watch.yml)
  GET listings.json
    SimplifyJobs/New-Grad-Positions (active, visible, Software Engineering)
    SimplifyJobs/Summer2027-Internships (active, visible, SWE-equivalent)
    → join to companies.yaml by normalized company name
    → synthetic Job → matchesJob + jobTrack
    → data/simplify-coverage-report.md
    → data/companies.suggested.yaml  (delta; never overwrite companies.yaml)
```

Later (not this spec): `aggregator` adapters for LinkedIn Jobs and Jobright.ai, same public-JSON trust boundary as other portals.

## Matcher

`matchesJob` stays the single filter. `jobTrack` stays intern vs new-grad for Discord.

### Gate order

1. **Department** — unchanged. Allow whole tokens `engineering`, `software`, `swe`, `ai`. Deny `sales`, `solution`, `solutions`, `field`, `non`. Empty departments fail.
2. **Role** — title contains `software engineer`, `software engineering`, `ai engineer`, `swe`, or **`sde`**.
3. **Title deny** — **title only** (not body). Drop if any of:
   - `senior`, `sr`, `staff`, `principal`, `lead`, `manager`, `director` as whole tokens
   - roman `ii`, `iii`, `iv` as whole tokens
   - level `2`, `3`, or `4` attached to the role: `engineer 2` / `engineer 3` / `engineer 4`, `sde 2` / `swe 2`, and the same for `3` and `4`
   - Do **not** deny a bare digit `2`/`3`/`4` anywhere in the title (avoids `Python 3` / `iOS 18` false drops)
   - Do **not** deny `associate`, `junior`, `i`, `1`, or `engineer 0`
4. **US location** — unchanged (`isUsLocation`).
5. **Track and season/year**
   - If intern/co-op language in title **or** body (`intern`, `internship`, `co op`, `coop`): intern path from PR #5 (2027 season word required; non-2027 years drop; intern webhook).
   - Else: **new-grad path** even if the text never says “new grad”. Apply the existing new-grad year rule on title+body: no four-digit year → keep; only `2027` → keep; any other `20xx` → drop. New-grad webhook.

Intern language still wins when both intern and new-grad wording appear.

### Keep / drop examples

**Keep (new-grad channel, US, yearless or 2027):**

- Software Engineer
- Software Engineer, Backend / iOS / AI SDK
- Associate Software Engineer
- Junior / Entry Level / Early Career / Early in Career Software Engineer
- College Grad / University Grad / Fresh Grad Software Engineer
- Software Engineer 1 / Software Engineer I
- SDE I / SDE 1
- New Grad Software Engineer
- AI Engineer / SWE (no intern language)

**Keep (intern channel):** PR #5 cases (Summer/Fall/Winter/Spring 2027, dual tags, short year `'27`).

**Drop:**

- Senior / Sr / Staff / Principal / Lead Software Engineer
- Software Engineer II / III / 2 / 3
- Software Engineering Manager (and director)
- Junior Product Manager (no role phrase)
- Engineer 1 with no SWE/SDE/AI role phrase
- Founding Engineer (no role phrase unless it also contains a role phrase)
- London-only (US gate)
- Intern with no 2027 season
- Generic/new-grad SWE whose title or body has a non-2027 `20xx`

`Junior` / `entry level` / `early career` / `college grad` do not need their own gate once the role phrase is present. They remain useful documentation; `sde` is the role addition that makes `SDE I` work.

### Routing

`jobTrack(job)`:

- intern language → `"intern"`
- else if `matchesJob` would pass the non-intern path → `"new-grad"`
- pipeline already uses `jobTrack(job) ?? "new-grad"`; after this change, every `matchesJob` hit must classify as `intern` or `new-grad` (no `null` for a matching job)

### Seen-store / volume

Already-keyed companies can Discord-ping newly matching open jobs (bare SWE, associate, L1) under the soft cap. That is the same matcher-widen behavior as Sep 9. No fleet-wide historical backfill. First-run silence for companies without a seen key is unchanged (except the existing custom-portal backfill allowlist).

## Coverage checklist

### Command

`node scripts/simplify-coverage.mjs`

Not an npm `start` path. Not `watch.yml`. Network only when you run it.

### Inputs

Unauthenticated GET of raw `.github/scripts/listings.json` from branch `dev`:

- [SimplifyJobs/New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions)
- [SimplifyJobs/Summer2027-Internships](https://github.com/SimplifyJobs/Summer2027-Internships)

Keep rows with `active: true` and `is_visible: true`.

New-grad list: `category` is Software Engineering (after the same category aliases Simplify uses, if present).

Internships list: `category` Software Engineering when present; otherwise title matches pinger role phrases (including `sde` and intern titles that contain those phrases). Skip PM / hardware / quant / data-only rows.

### Join

Normalize `listing.company_name` and `companies.yaml` `name`: lowercase, strip leading `the`, strip `inc`/`llc`/`ltd`/`corp`/`corporation`, strip punctuation. First unique yaml row wins.

If two yaml names normalize equal, the listing is `ambiguous` (not `enable` / `add`).

### Synthetic Job

```ts
{
  id: listing.id or listing.url,
  title: listing.title,
  location: listing.locations.join("; "),
  departments: ["Engineering"],
  absoluteUrl: listing.url,
  content: Array.isArray(listing.terms) ? listing.terms.join(" ") : "",
}
```

`terms` on internships (e.g. `Summer 2027`) go into `content` so intern season matching can pass when the title is season-less. New-grad listings typically have no `terms`; `content` is empty. The report must state that departments are assumed Engineering and bodies are not fetched — checklist matcher-pass is not a promise the live board would ping.

### Classification (first match)

1. `would-ping` — yaml row exists, `enabled: true`, adapter can fetch, `matchesJob` true
2. `matcher-drop` — enabled + fetchable, `matchesJob` false
3. `disabled` — yaml row exists, `enabled: false`, and `getAdapter(ats)` exists. Never treat ids `google`, `meta`, `microsoft`, `apple` as disabled-enableable (they stay `custom-no-adapter` until a later portal spec).
4. `custom-no-adapter` — yaml row exists but no adapter in the registry (including Google, Meta, Microsoft, Apple today)
5. `missing` — no yaml row
6. `ambiguous` — name collision

Invalid rows (missing `company_name`, `title`, or `url`) are skipped and counted on stderr as `skipped-invalid`.

### Outputs (gitignore)

Overwrite each successful run:

- `data/simplify-coverage-report.md` — counts by class and source list; one row per listing (company, title, url, class, `jobTrack` or n/a)
- `data/companies.suggested.yaml` — delta only:
  - `enable:` yaml `id`s from class `disabled` (adapter exists; includes Amazon/NVIDIA/OpenAI if still off)
  - `add:` stubs `{ name, ats: custom, enabled: false }` for class `missing` (stable `id` slug from normalized name)
  - never `enable` `custom-no-adapter` or ids `google` / `meta` / `microsoft` / `apple`
  - never include `ambiguous`

The script does not merge into `companies.yaml`. You copy `enable` ids in waves so Actions time stays in budget.

Add to `.gitignore`: `data/simplify-coverage-report.md`, `data/companies.suggested.yaml`.

### Fetch auth

Anonymous raw.githubusercontent.com (or GitHub contents API) first. Optional `GITHUB_TOKEN` in the environment for the script only if anonymous rate limits fail. Not a watch workflow secret. Do not add it to `watch.yml`.

## Error handling

Watch path: unchanged (per-company fetch isolation; missing webhook for a needed track exits 2 and posts nothing; Discord mid-batch records successes and exits 2).

Checklist:

- Either GitHub fetch fails (timeout, 404, rate limit, non-JSON) → non-zero exit, **write no output files** (fail closed).
- Partial success (one list ok, one fail) → same fail closed.
- Invalid listing rows → skip + stderr count; other rows still process.
- Output write failure after a successful fetch → non-zero exit.
- Ambiguous names → report only; omit from suggested yaml.

## Testing

**Matcher** (`tests/matcher.test.ts`):

- Keep: `Software Engineer`; `Software Engineer, Backend`; `Associate Software Engineer`; `Junior Software Engineer`; `Entry Level Software Engineer`; `Early Career Software Engineer`; `Software Engineer 1` / `I`; `SDE I` / `SDE 1`; `New Grad Software Engineer`; `AI Engineer` (US, yearless).
- Drop: `Senior` / `Sr` / `Staff` / `Principal` / `Lead` Software Engineer; `Software Engineer II` / `III` / `2`; `Software Engineering Manager`; `Junior Product Manager`; London-only; intern with no 2027 season; generic/new-grad SWE with explicit non-2027 year in title or body.
- Intern: PR #5 cases still pass; intern language wins `jobTrack`.
- `jobTrack`: intern titles → `intern`; associate / bare / junior / `Engineer 1` / new-grad → `new-grad`.

**Pipeline:** intern webhook vs new-grad webhook for intern vs bare SWE; mixed batch still fails closed if one webhook is missing.

**Checklist:** fixture JSON snippets, no live GitHub in CI. Cases: would-ping, matcher-drop, disabled → `enable:`, missing → `add:`, custom-no-adapter (no enable), ambiguous, skipped-invalid, fetch failure writes no files.

**Regression:** `npm test`, `npm run build`. After matcher lands, one local watch **dry-run**; record intern vs new-grad would-ping counts (expect bare SWE in new-grad). Checklist never posts Discord.

## Success criteria

- New-grad channel can receive US `Software Engineer` / Associate / Junior / `Engineer 1` / `SDE I` that pass the year rule.
- Senior / II / manager titles do not.
- Intern channel behavior matches PR #5.
- `node scripts/simplify-coverage.mjs` against fixtures (CI) and, when run locally, writes report + suggested delta without touching `companies.yaml` or Discord.
- `watch.yml` still has no Simplify / LinkedIn / Jobright fetch.

## Implementation sequencing

1. Spec approval (this document).
2. Implementation plan via writing-plans (matcher tests first, then checklist script).
3. Matcher + pipeline tests → dry-run volume note → ship matcher.
4. Checklist script + fixture tests → gitignore outputs → ship script (manual run).

## Deferred

- LinkedIn Jobs and Jobright.ai as `aggregator` adapters (separate spec; public unauthenticated JSON only; no session cookies in that spec unless secrets are explicitly added later).
- Auto-merge of `companies.suggested.yaml` into `companies.yaml`.
- Checklist as a scheduled Action.
- Using live ATS departments/JDs in the checklist (would require fetching every Simplify URL).
