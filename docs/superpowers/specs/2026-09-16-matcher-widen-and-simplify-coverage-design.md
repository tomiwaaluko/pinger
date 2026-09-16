# Matcher widen and Simplify coverage checklist (pinger)

Widen title matching so US SWE/AI roles that look like new-grad or L1 ping the **new-grad** Discord channel, keep internship routing from PR #5, and add an **offline** checklist against Simplify’s public lists. Watch runs still poll first-party ATS boards only.

This spec builds on:

- [2026-09-09-us-season-filters-and-big-tech-portals-design.md](./2026-09-09-us-season-filters-and-big-tech-portals-design.md) (shipped in PR #4)
- Internship dual-webhook routing (PR #5: `feat: added internship pings`)

Unchanged unless this spec overrides: vault sandbox, fit-note semantics, dry-run, merge-write seen-store, workflow commit-only-`seen-jobs.json`, per-company fetch isolation, GitHub Actions hosting, US location gate, intern **2027 season** rule (once a job is classified intern), new-grad year extractor, portal trust boundary (public unauthenticated JSON only).

This document **replaces** the Sep 9 “closed Scale AI / Stripe matcher-polish corpus” with the explicit keep/drop title rules below. It **overrides** intern *classification* to **title-only** (body mentions of internships must not steal or drop a SWE title). Dual webhooks stay. Soft cap stays 25 but **fills intern + high-signal new-grad before yearless bare SWE**.

## Motivation

Simplify’s [New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions) SWE table is full of titles pinger drops: `Junior Software Engineer`, `Software Engineer 1`, `Early Career`, `SDE I`, and bare `Software Engineer`. Those are the roles the new-grad channel should see. Pinger already has intern/co-op on a second webhook (any Winter/Spring/Summer/Fall **2027** season). The gap is new-grad/L1 wording, not a second job feed.

Scraping that README as a ping source would duplicate ATS jobs, add Simplify tracking links, and skip department/JD data. A maintenance checklist can still use Simplify to see which companies and titles we miss, then suggest `companies.yaml` edits you apply in waves.

## Goals

- Ping the **new-grad** webhook for US SWE/AI titles that are junior / entry / early-career / associate / L1 (`engineer 1` / `sde i`) **or** bare `Software Engineer` / `AI Engineer` / `SWE` / `SDE` with no intern language, subject to the yearless-or-2027 rule.
- Keep intern/co-op on `DISCORD_WEBHOOK_URL_INTERN` with PR #5 **season** rules. Intern vs new-grad is decided from the **title**, not the JD body.
- Drop mid/senior titles (`senior`, `staff`, `II`, manager, …). Soft cap **prefers** intern and high-signal new-grad titles so yearless bare SWE cannot consume the whole 25-window.
- Add a **manual** coverage script against Simplify new-grad SWE + Summer 2027 internship listings. Write miss reasons to `data/simplify-coverage-report.md` and a **delta** yaml suggestion to `data/companies.suggested.yaml`. Never ping Discord from those lists.
- Stay on first-party ATS polling in `watch.yml`.

## Non-goals

- Scraping Simplify READMEs or `listings.json` as a Discord job feed.
- LinkedIn Jobs or Jobright.ai adapters (follow-on aggregator spec).
- Lever, iCIMS, Taleo, SuccessFactors standalone adapters.
- Enabling Google, Meta, Microsoft, or Apple from the checklist.
- Overwriting `companies.yaml` from the script or from watch.
- Wiring the checklist into `watch.yml` or a weekly Action.
- Changing intern **season** rules, US location rules, cap **size** (still 25), or first-run silence.
- Rewriting the new-grad year extractor (any `20xx` in title+body). Dry-run may show incidental years eating keeps; that is a follow-up, not this spec.
- Auto-apply, extra Discord fields, or always-on hosting.

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Scope | Matcher widen + offline Simplify checklist. Not a third ping source. |
| Relation to Sep 9 | Same US + year + intern-**season** gates. Intern **class** is title-only (this spec). New title keep/drop list replaces closed-corpus polish. Hydrate-before-season stays with updated list-phase gates. |
| Intern classification | **Title only.** `intern` / `internship` / `co op` / `coop` in the title → intern path + intern webhook. The same words in the **body alone** do not classify intern (avoids “internship experience preferred” stealing or dropping bare SWE). Intern **season/year** still scans title+body once classified intern (PR #5). |
| Intern vs new-grad in title | If the title has intern language, intern wins even when it also says new-grad. |
| Bare SWE | Keep. Non-intern role matches take the new-grad path even without the words “new grad”. |
| Soft cap | Still 25. Fill **intern + high-signal new-grad** first (fair across companies), then yearless bare SWE. High-signal title tokens: `junior`, `entry level`, `early career`, `early in career`, `associate`, `new grad`, `college grad`, `university grad`, `fresh grad`, `engineer 1`, `engineer i`, `sde 1`, `sde i`. |
| Dry-run gate | After matcher lands, one fleet dry-run records intern / high-signal new-grad / yearless-bare counts. **Ship is blocked** if, *without* cap preference, yearless-bare would be more than half of the 25-window (or of all new-grad would-pings when fewer than 25). Then cap preference must be on; re-run dry-run; ship only if the **posted 25** are not majority yearless-bare. |
| Associate SWE | Keep (new-grad path). `associate` is **not** a deny token. |
| Mid/senior deny | Title-only: `senior`, `sr`, `staff`, `principal`, `lead`, `manager`, `director`, roman `ii`/`iii`/`iv`, and role+level `2`/`3`/`4` (see Matcher). |
| Role phrases | Existing set plus `sde` so `SDE I` can pass. |
| Checklist sources | `listings.json` from New-Grad-Positions (SWE) and Summer2027-Internships (SWE-equivalent). Not README HTML. |
| Checklist apply | Sidecar delta yaml. Human copies into `companies.yaml` in waves. |
| Suggested enables | Every joined listing whose yaml row is `enabled: false` and `getAdapter(ats)` exists (including Amazon/NVIDIA/OpenAI). **Not** gated on synthetic `matchesJob`. Never enable `google` / `meta` / `microsoft` / `apple`. |
| Suggested adds | Unknown companies as `ats: custom`, `enabled: false`. |
| Aggregators | LinkedIn / Jobright named only as later work. |

## Architecture

Two paths. Watch is ATS. Simplify is maintenance.

```text
Watch
  companies.yaml (enabled)
    → existing adapters (greenhouse | ashby | workday | amazon | nvidia | openai)
    → list-phase: dept → role (incl. sde) → title deny → US
         intern class from TITLE only
    → Workday/NVIDIA-style hydrate only for list-phase survivors
         (not the whole board)
    → season/year on title+hydrated body
         intern title? intern 2027 season : new-grad year (yearless or 2027)
    → jobTrack from TITLE: intern webhook vs new-grad webhook
    → soft cap 25: intern + high-signal new-grad first, then yearless bare
    → fit note / Discord

Checklist (manual; not in watch.yml)
  GET listings.json via raw.githubusercontent.com (dev branch)
    SimplifyJobs/New-Grad-Positions (active, visible, SWE category)
    SimplifyJobs/Summer2027-Internships (active, visible, SWE category or role phrase)
    → join to companies.yaml (exactly one name match, else ambiguous)
    → synthetic Job → matchesJob + jobTrack (report only)
    → data/simplify-coverage-report.md
    → data/companies.suggested.yaml
         enable: disabled + getAdapter exists (join only, not synthetic match)
         add: missing stubs
```

Later (not this spec): `aggregator` adapters for LinkedIn Jobs and Jobright.ai, same public-JSON trust boundary as other portals.

## Matcher

`matchesJob` stays the single filter. `jobTrack` stays intern vs new-grad for Discord.

### Gate order

1. **Department** — unchanged. Allow whole tokens `engineering`, `software`, `swe`, `ai`. Deny `sales`, `solution`, `solutions`, `field`, `non`. Empty departments fail.
2. **Role** — title contains whole-token `software engineer`, `software engineering`, `ai engineer`, `swe`, or **`sde`** (do not match `sdet` via substring).
3. **Title deny** — **title only** (not body). Drop if any of:
   - `senior`, `sr`, `staff`, `principal`, `lead`, `manager`, `director` as whole tokens
   - roman `ii`, `iii`, `iv` as whole tokens
   - level `2`, `3`, or `4` attached to the role: `engineer 2` / `engineer 3` / `engineer 4`, `sde 2` / `swe 2`, and the same for `3` and `4`
   - Do **not** deny a bare digit `2`/`3`/`4` anywhere in the title (avoids `Python 3` / `iOS 18` false drops)
   - Do **not** deny `associate`, `junior`, `i`, `1`, or `engineer 0`
4. **US location** — unchanged (`isUsLocation`).
5. **Track and season/year**
   - If intern/co-op language is in the **title** (`intern`, `internship`, `co op`, `coop`): intern path from PR #5 (2027 season word required in title **or** body; non-2027 years drop; intern webhook).
   - Else: **new-grad path** even if the text never says “new grad”. Apply the existing new-grad year rule on title+body: no four-digit year → keep; only `2027` → keep; any other `20xx` → drop. New-grad webhook. Body-only intern wording does **not** switch tracks.

Intern language in the **title** still wins when the title also says new-grad.

### Workday / NVIDIA hydrate

Sep 9 hydrate-before-season stays, with list-phase updated for this matcher:

1. Run department, role, title deny, US, and **title-only** intern class on the list item (`content` may be empty).
2. Hydrate `jobDescription` only for jobs that passed those list gates.
3. Re-run intern season/year (intern titles) or new-grad year (everyone else) on title + hydrated body.
4. Only then enter soft-cap / Discord.

Do not hydrate the whole board. Do not apply yearless-keep as a final keep on empty Workday content when hydrate is still pending — season/year runs **after** hydrate for those adapters.

Greenhouse and Ashby keep single-pass matching when content is already on the list payload.

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
- AI Engineer / SWE (no intern in the title)
- Software Engineer, Python 3 (bare digit `3` is not a level deny)
- Software Engineer, iOS 18

**Keep (intern channel):** PR #5 cases (Summer/Fall/Winter/Spring 2027, dual tags, short year `'27`).

**Drop:**

- Senior / Sr / Staff / Principal / Lead Software Engineer
- Software Engineer II / III / 2 / 3
- SDE 2 / SWE 2 / Software Engineer 4
- Software Engineering Manager (and director)
- Junior Product Manager (no role phrase)
- `Engineer 1` with no SWE/SDE/AI role phrase (role requires `software engineer` / `sde` / …)
- Founding Engineer (no role phrase unless it also contains a role phrase)
- London-only (US gate)
- Title is intern/co-op but no 2027 season in title or body
- `Software Engineer` whose **body** says “internship experience preferred” and has no intern **title** — **keep, new-grad** (not intern, not drop)
- Generic/new-grad SWE whose title or body has a non-2027 `20xx`

`Junior` / `entry level` / `early career` / `college grad` do not need their own gate once the role phrase is present. They remain useful documentation; `sde` is the role addition that makes `SDE I` work.

### Routing

`jobTrack(job)`:

- intern language **in the title** → `"intern"`
- else if `matchesJob` would pass the non-intern path → `"new-grad"`
- pipeline already uses `jobTrack(job) ?? "new-grad"`; after this change, every `matchesJob` hit must classify as `intern` or `new-grad` (no `null` for a matching job)

### Seen-store / volume

Already-keyed companies can Discord-ping newly matching open jobs (bare SWE, associate, L1) under the 25-post cap. No fleet-wide historical backfill. First-run silence for companies without a seen key is unchanged (except the existing custom-portal backfill allowlist).

Cap fill order (still one shared 25 across both webhooks):

1. Intern titles and **high-signal** new-grad titles (tokens in Decisions), fair across companies.
2. Remaining slots: yearless bare SWE / other non-signal new-grad, fair across companies.

Dry-run gate: see Decisions. Record three buckets (intern, high-signal new-grad, yearless-bare). Do not ship matcher if the ungated 25-window would be majority yearless-bare until preference is on and the **selected** 25 are not majority yearless-bare.

## Coverage checklist

### Command

`node scripts/simplify-coverage.mjs`

Not an npm `start` path. Not `watch.yml`. Network only when you run it.

### Inputs

Unauthenticated GET of **raw.githubusercontent.com** `…/dev/.github/scripts/listings.json` (GitHub Contents API returns empty `content` for these ~13MB files — do not use it as the loader):

- [SimplifyJobs/New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions)
- [SimplifyJobs/Summer2027-Internships](https://github.com/SimplifyJobs/Summer2027-Internships)

Keep rows with `active: true` and `is_visible: true`.

SWE-equivalent (both lists): `category` is `Software Engineering` or `Software` (case-insensitive), **or** the title matches a pinger role phrase (including `sde`). No third PM/hardware/quant skip list — `matchesJob` is the title filter after that. Do not port Simplify’s Python alias table.

Then classify with synthetic `matchesJob` / `jobTrack` for the **report**. `enable:` does not require synthetic match.

### Join

Normalize `listing.company_name` and `companies.yaml` `name`: lowercase, strip leading `the`, strip `inc`/`llc`/`ltd`/`corp`/`corporation`, strip punctuation.

A listing maps to a yaml row only when **exactly one** yaml name normalizes equal to the listing company. If two yaml names normalize equal, the listing is `ambiguous` (not `enable` / `add`). Zero matches → `missing`.

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

1. `would-ping` — yaml row exists, `enabled: true`, `getAdapter(ats)` exists, `matchesJob` true
2. `matcher-drop` — yaml row exists, `enabled: true`, `getAdapter(ats)` exists, `matchesJob` false
3. `disabled` — yaml row exists, `enabled: false`, and `getAdapter(ats)` exists. Never treat ids `google`, `meta`, `microsoft`, `apple` as disabled-enableable (they stay `custom-no-adapter` until a later portal spec).
4. `custom-no-adapter` — yaml row exists but no adapter in the registry (including Google, Meta, Microsoft, Apple today)
5. `missing` — no yaml row
6. `ambiguous` — name collision

`enable:` is the set of distinct yaml ids in class `disabled` that appeared on at least one **input-kept** listing. It is **not** filtered by `matchesJob` (synthetic match is report-only).

Invalid rows (missing `company_name`, `title`, or `url`) are skipped and counted on stderr as `skipped-invalid`.

### Outputs (gitignore)

Overwrite each successful run:

- `data/simplify-coverage-report.md` — counts by class and source list; one row per listing (company, title, url, class, `jobTrack` or n/a)
- `data/companies.suggested.yaml` — delta only:
  - `enable:` yaml `id`s from class `disabled` (join + adapter; **not** synthetic `matchesJob`)
  - `add:` stubs `{ name, ats: custom, enabled: false }` for class `missing` (stable `id` slug from normalized name)
  - never `enable` `custom-no-adapter` or ids `google` / `meta` / `microsoft` / `apple`
  - never include `ambiguous`

The script does not merge into `companies.yaml`. You copy `enable` ids in waves so Actions time stays in budget.

Add to `.gitignore`: `data/simplify-coverage-report.md`, `data/companies.suggested.yaml`.

### Fetch auth

Load **only** via raw.githubusercontent.com for the two repo+path pairs above (allowlisted; no URL built from listing fields). Do not use the GitHub Contents API for these files.

Anonymous first. If the response is 429/403 and `GITHUB_TOKEN` is set in the environment, **retry those two GitHub GETs once** with the token, then fail closed if still unsuccessful. If `GITHUB_TOKEN` is unset, a 429/403 is fail-closed immediately.

`GITHUB_TOKEN` is attached only to those two listings.json requests. Never log it, never write it to report/yaml, never send it to `listing.url` or ATS hosts. Not a watch workflow secret. Do not add it to `watch.yml`.

## Error handling

Watch path: unchanged (per-company fetch isolation; missing webhook for a needed track exits 2 and posts nothing; Discord mid-batch records successes and exits 2).

Checklist:

- GitHub fetch fails (timeout, 404, **429/403 after the Fetch-auth retry policy**, non-JSON) → non-zero exit, **write no output files** (fail closed).
- Partial success (one list ok, one fail) → same fail closed.
- Invalid listing rows → skip + stderr count; other rows still process.
- Output write failure after a successful fetch → non-zero exit.
- Ambiguous names → report only; omit from suggested yaml.

## Testing

**Matcher** (`tests/matcher.test.ts`):

- Keep: `Software Engineer`; `Software Engineer, Backend`; `Associate Software Engineer`; `Junior Software Engineer`; `Entry Level Software Engineer`; `Early Career Software Engineer`; `Software Engineer 1` / `I`; `SDE I` / `SDE 1`; `New Grad Software Engineer`; `AI Engineer`; `Software Engineer, Python 3`; `Software Engineer, iOS 18` (US, yearless).
- Keep new-grad: `Software Engineer` with body “internship experience preferred” and no intern in the title (`jobTrack` `new-grad`).
- Drop: `Senior` / `Sr` / `Staff` / `Principal` / `Lead` Software Engineer; `Software Engineer II` / `III` / `2`; `SDE 2` / `SWE 2`; `Software Engineering Manager`; `Junior Product Manager`; London-only; intern **title** with no 2027 season; generic/new-grad SWE with explicit non-2027 year in title or body.
- Intern: PR #5 season cases still pass when intern is in the **title**; intern **title** wins `jobTrack` over new-grad wording in the title.
- `jobTrack`: intern titles → `intern`; associate / bare / junior / `Software Engineer 1` / `SDE I` / new-grad → `new-grad`. Never treat role-less `Engineer 1` as a keep.

**Pipeline:** intern webhook vs new-grad webhook for intern vs bare SWE; mixed batch still fails closed if one webhook is missing. Soft-cap unit tests: high-signal/intern fill before yearless-bare when both exist.

**Checklist:** fixture JSON snippets, no live GitHub in CI. Cases: would-ping, matcher-drop, disabled → `enable:` even when synthetic `matchesJob` is false, missing → `add:`, custom-no-adapter (no enable), ambiguous (two yaml names), skipped-invalid, fetch failure writes no files, 429 then token retry succeeds.

**Regression:** `npm test`, `npm run build`. After matcher + cap preference land, one local watch **dry-run**; record intern / high-signal new-grad / yearless-bare counts; apply the Decisions dry-run gate before shipping. Checklist never posts Discord.

## Success criteria

- New-grad channel can receive US `Software Engineer` / Associate / Junior / `Software Engineer 1` / `SDE I` that pass the year rule.
- Senior / II / manager titles do not. Role-less `Engineer 1` does not.
- Intern channel: PR #5 season rules; intern class from **title** only.
- Fleet dry-run passes the volume gate (selected 25 not majority yearless-bare).
- `node scripts/simplify-coverage.mjs` against fixtures (CI) and, when run locally, writes report + suggested delta without touching `companies.yaml` or Discord.
- `watch.yml` still has no Simplify / LinkedIn / Jobright fetch.

## Implementation sequencing

1. Spec approval (this document).
2. Implementation plan via writing-plans (matcher tests first, then checklist script).
3. Matcher + pipeline tests (incl. title-only intern class, digit deny, cap preference) → fleet dry-run with volume gate → ship matcher.
4. Checklist script + fixture tests → gitignore outputs → ship script (manual run).

## Deferred

- LinkedIn Jobs and Jobright.ai as `aggregator` adapters (separate spec; public unauthenticated JSON only; no session cookies in that spec unless secrets are explicitly added later).
- Auto-merge of `companies.suggested.yaml` into `companies.yaml`.
- Checklist as a scheduled Action.
- Rewriting the new-grad year extractor if dry-run shows incidental `20xx` in JDs eating keeps.
- Using live ATS departments/JDs in the checklist (would require fetching every Simplify URL).
