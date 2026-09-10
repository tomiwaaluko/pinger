# US / season filters, logos, and big-tech portals (pinger)

Tighten what pinger pings (United States only; new-grad or Spring 2027 internships), add company logos to Discord embeds, then expand coverage to seven custom big-tech career portals.

This spec builds on:

- [2026-08-16-career-watcher-design.md](./2026-08-16-career-watcher-design.md)
- [2026-08-20-multi-company-greenhouse-expansion-design.md](./2026-08-20-multi-company-greenhouse-expansion-design.md)
- [2026-08-29-multi-ats-expansion-design.md](./2026-08-29-multi-ats-expansion-design.md)

Unchanged unless this spec overrides: vault sandbox, fit-note semantics, dry-run no-write for Discord-bound hits, merge-write seen-store rules, workflow commit-only-`seen-jobs.json`, fair 25-post soft cap, partial per-company fetch failure isolation, GitHub Actions hosting.

## Motivation

Four product problems showed up in production use:

1. **Non-US noise.** Location is displayed but never filtered, so London, Bangalore, and other international early-career SWE roles still ping Discord.
2. **Season mismatch.** The user graduates May 2027 and only wants **new-grad** roles or **Spring 2027** internships. Summer and Fall 2027 (and other seasons) are not useful. Today any intern / co-op / new-grad title matches.
3. **Big-board skew.** RTX and Cisco dominate because they are large enabled Workday fleets whose titles literally contain “Software Engineer Intern” / “New Grad,” while many startups use titles the matcher rejects, and mega-tech (Google, Meta, Microsoft, Amazon, Apple, NVIDIA, OpenAI) sits as `ats: custom` / `enabled: false` and is never fetched. **Skew reduction is expected primarily from Phase 1 US/season filters under the existing soft cap.** Phase 2 portals are a **coverage** goal (a matching Google-class role can appear), not the primary skew remedy.
4. **Missed Greenhouse hits.** Scale AI and Stripe are already enabled. Misses there can be matcher / department / first-run snapshot issues, not missing company rows. Google-class misses are missing adapters. First-run snapshot misses for companies already in `seen-jobs.json` remain out of scope (aligned with the fleet-wide backfill non-goal). Matcher polish targets wording/department misses only.

Separately, Discord embeds are text-only; a company logo thumbnail makes posts easier to scan.

## Goals

- Ping only jobs with at least one **United States** location.
- Ping only **new-grad** (2027 or year-unspecified) or **Spring 2027** internship / co-op roles for Software Engineer / AI Engineer tracks. When internship/co-op language is present, classify as internship and require Spring 2027 (intern path wins); standalone new-grad without internship/co-op language follows the new-grad year rules.
- Keep one shared matcher for all ATS adapters.
- Show a company **logo thumbnail** on Discord embeds when resolvable.
- After filters ship, add custom adapters for **Google, Meta, Microsoft, Amazon, Apple, NVIDIA, OpenAI**, with a one-time first-run backfill for those newly enabled companies.
- Preserve Actions time budget and soft-cap fairness.

## Non-goals

- Public aggregator / scraped “new grad” list feeds.
- Lever, iCIMS, Taleo, SuccessFactors standalone adapters.
- Quant / other custom portals beyond the seven named above (Jane Street, Citadel, etc. stay `custom` + disabled).
- Guessing logo domains from board tokens.
- Fleet-wide backfill of already-snapshotted companies.
- Changing Discord field layout beyond adding `thumbnail`.
- Auto-apply, multi-channel Discord, or always-on hosting.

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Missing new-grad or Spring 2027 signal in title and description | Drop. Keep only explicit new-grad or Spring 2027 signals in title **or** description. When internship/co-op language is present, classify as internship and require Spring 2027 (intern path wins); standalone new-grad without internship/co-op language follows the new-grad year rules. |
| US location | Keep if **any** listed place is US (including multi-country posts with a US site and `Remote - United States`). Drop empty, bare `Remote`, and purely non-US. |
| New-grad year | Keep if text says 2027, or says new grad and names no four-digit year. Drop when an explicit non-2027 year tied to the graduating class appears (including 2025, 2026, 2028, …). |
| Coverage expansion | Matcher fixes on existing boards, then custom adapters for the seven big-tech portals. No aggregator. |
| Sequencing | **Matcher-first**, then portals one company at a time. |
| First run for the seven portals | One backfill: first non-dry enable may ping currently open matches (soft-capped). Later runs only new posts. Already-enabled companies keep silent first-run. |
| Logo source | Optional `logoUrl` override, else public logo CDN via optional `domain`. Else post without thumbnail. |
| Logo placement | Discord embed `thumbnail`. |
| Logo domain | Explicit optional `domain` only; no slug→domain guess. |
| Workday description timing | Greenhouse and Ashby match with content already on the payload. For Workday: run department, role, title early-career, and US on the list item; hydrate `jobDescription` only for those candidates; then re-run early-career (title or description) + season/year before soft-cap. Do not hydrate the whole Workday board. |

## Architecture

```text
companies.yaml (enabled rows)
  → ATS adapters (greenhouse | ashby | workday | <custom portal>)
  → shared Job
  → matchesJob (dept → role → early-career → US → season/year)
       Workday: list gates first; hydrate early-career+US candidates; then season/year
  → seen-store / soft-cap
  → fit note
  → buildDiscordEmbed (+ thumbnail from logoUrl | CDN(domain))
  → Discord webhook
```

Phased delivery:

1. **Phase 1 — filters, matcher polish, logos** on the existing Greenhouse / Ashby / Workday fleet.
2. **Phase 2 — custom portals** for the seven companies, each behind the existing adapter interface, enabled only after dry-run verification, with first-run backfill.

## Phase 1: Matching and filters

### Shared gate order

`matchesJob(job)` remains the single filter. Order:

1. **Department gate** — existing allow (`engineering`, `software`, `swe`, `ai`) / deny (`sales`, `solution`, `solutions`, `field`, `non`) whole-token rules. Empty departments still fail.
2. **Role phrase** — title must contain a role phrase: `software engineer`, `software engineering`, `ai engineer`, `swe`. Keep the existing set unless tests prove a named miss needs a tightly scoped addition.
3. **Early-career class** — title **or** description must establish either **new grad** or **internship / co-op** (same phrase sets as today / below). Aligns with Decisions: new-grad and Spring 2027 signals may live in either field.
4. **US location gate** — see below.
5. **Season / year gate** — see below; uses **title + description** (`job.content`, already capped for LLM).

Department and role gates stay title/department-based. Early-career class and season/year may use description because many Spring 2027 / new-grad posts only put the cycle in the body.

**Workday content contract:** Workday list items ship with empty `content`. Pipeline must:

1. Run gates 1–4 on the list job (early-career from **title** only at this stage for Workday, because content is empty).
2. Hydrate `jobDescription` only for jobs that passed gates 1–4.
3. Re-run early-career (now title or description) + season/year on the hydrated job.
4. Only then enter soft-cap / Discord.

Greenhouse and Ashby keep single-pass matching when content is already on the list/detail payload used today.

### US location rules

Input: `job.location` string (adapters may already join secondary sites; treat the whole string as the searchable location text).

**Keep** when at least one of:

- Explicit country tokens: `united states`, `usa`, or standalone `us` (word boundary; do not match inside other words).
- A US state name or common postal abbreviation as a whole token.
- A curated list of high-frequency US city / metro tokens used on tech boards (e.g. San Francisco, NYC, Seattle, Austin, Boston, Chicago, Los Angeles, Denver, Atlanta, …) sufficient for common Greenhouse/Ashby/Workday location strings.

Also keep:

- `Remote - United States`, `Remote, United States`, `US Remote`, and similar.
- Multi-site strings that include a US place and a non-US place (e.g. `San Francisco; London`).

**Drop** when:

- Location is empty / whitespace.
- Location is bare `Remote` / `Remote work` / `Anywhere` with no US signal.
- Every identifiable place is outside the US.

Ambiguous city names that exist in multiple countries should not alone keep a job unless paired with a US state, US country token, or an unambiguously US metro already on the curated list. Prefer false negatives over international false positives when ambiguous.

### Season and year rules

Normalize title and description (lowercase; treat hyphens as spaces) before scanning.

`job.content` is **untrusted**. Season/year and early-career description scans use fixed allowlisted phrase checks only. Raw description never enters Discord embeds. Discord continues to receive only title, location, fit, optional thumbnail, and existing `stripRolePings` on title and fit (fit-note injection defenses unchanged).

**New grad**

- Detect via phrases such as `new grad`, `newgrad`, `new graduate`, and existing early-career tokens that mean new-grad track (`graduate` / `university` only when they clearly denote a new-grad program, not a generic “university recruiting” intern post that also names Summer/Fall — intern path below wins when internship/co-op is present).
- If the posting also has internship / co-op language, classify as **internship** and apply the internship rules (do not keep a Summer intern solely because it also says “university”).
- **Keep** new-grad when:
  - Text mentions `2027`, or
  - Text mentions no four-digit year at all.
- **Drop** new-grad when an explicit `2025` or `2026` (or other non-2027 year tied to the graduating class) appears in title or description.
- Plain `New Grad Software Engineer` with no year → keep.

**Internship / co-op**

- Detect via `intern`, `internship`, `co op`, `coop`, `co-op`.
- **Keep** only when title or description clearly indicates **Spring 2027**, including:
  - `Spring 2027`, `Spring '27`, `Spring 27`
  - Spring date windows such as `Jan–May 2027`, `January–May 2027`, `Winter/Spring 2027`
- **Drop** when Summer, Fall, Winter (alone), or any non-Spring season is indicated for the internship, regardless of year.
- **Drop** dual tags that include a non-Spring season (e.g. `Spring/Summer 2027`) because Summer is indicated.
- **Drop** when year is present but not 2027.
- **Drop** when no Spring 2027 signal appears anywhere in title or description (including bare `Software Engineer Intern`).

### Matcher polish (existing boards)

Widen matching only where needed to catch real early-career SWE roles that Scale AI / Stripe-style boards post, without matching generic mid-level `Software Engineer` titles.

Rules:

- Do **not** match titles that are only `Software Engineer` / `AI Engineer` with no early-career signal.
- **Closed corpus:** before Phase 1 coding starts, collect at least two real missed postings (prefer Scale AI / Stripe) with title/department text, the gate that rejected each (department vs role vs early-career), and the minimal phrase or department-token change that should make each match. Only those fixture-backed tweaks are in Phase 1 scope.
- **Freeze:** after those fixtures pass, further widening is a follow-up, not a Phase 1 exit criterion.
- Jobs already present in `seen-jobs.json` stay silent. Jobs that newly match and were never recorded can ping on a normal later run (no fleet-wide backfill). That intentional matcher-widen path can Discord-ping currently open inventory on already-keyed companies (including empty `{}` snapshots) under the soft cap — not a fleet-wide backfill of historical IDs.

### Logos (Phase 1)

Extend company config:

```yaml
- id: stripe
  name: Stripe
  ats: greenhouse
  boardToken: stripe
  enabled: true
  domain: stripe.com        # optional hostname only
  logoUrl: https://...      # optional override
```

`loadConfig` accepts optional `domain` and `logoUrl`:

- `domain` is a DNS hostname only (no scheme, path, query, fragment, or userinfo).
- `logoUrl` is `https://` only, no userinfo, normal host.
- CDN thumbnails are built only as a fixed HTTPS CDN base (chosen in the implementation plan) + URL-encoded hostname.
- The watcher never GETs/HEADs thumbnail URLs; Discord alone may fetch them.

Sync / compile scripts must preserve these fields when regenerating `companies.yaml`.

Discord embed builder adds:

```ts
thumbnail?: { url: string }
```

Resolution at embed build time only:

1. If `logoUrl` set → use it.
2. Else if `domain` set → public logo CDN URL derived from that domain.
3. Else → omit `thumbnail`.

Failure policy:

- If neither `logoUrl` nor `domain` is set → omit `thumbnail`.
- If a URL is set or derived → include `thumbnail.url` with no runtime HEAD check; accept Discord client non-render of a bad image.
- Never block or retry the Discord post for image failure.
- Thumbnail is a decorative scan aid only. The embed **Company** field (`companies[].name`) remains the authoritative human-readable company identity for present, omitted, and failed thumbnails. Do not remove or demote that field when adding thumbnail.

**Seeding:** Phase 1 must set `domain` or `logoUrl` on **every currently enabled** company. No requirement to annotate the entire disabled ~500+ list. Use `logoUrl` when the CDN mark is wrong.

## Phase 2: Custom big-tech portals

### Target companies

| id | name | Notes |
| --- | --- | --- |
| `google` | Google | Today `ats: custom`, disabled |
| `meta` | Meta | same |
| `microsoft` | Microsoft | same |
| `amazon` | Amazon | same |
| `apple` | Apple | same |
| `nvidia` | NVIDIA | same |
| `openai` | OpenAI | same |

Each gets a dedicated adapter module that returns the shared `Job` shape (`id`, `title`, `location`, `departments`, `absoluteUrl`, `content`, …). Prefer official or stable JSON/search APIs over HTML scraping.

**Trust boundary:** custom adapters use only **public unauthenticated** career/search APIs or documented public board endpoints. No session cookies, CSRF tokens, or portal passwords in repo or logs. Any future authenticated fetch must extend the Secrets table first. HTML scrape only when the portal’s public career listings permit automated access, with per-portal risk noted in the implementation plan.

**URL rule:** every custom-portal `Job.absoluteUrl` must be an `https://` URL before Discord posting; non-https values are dropped from the ping set.

**Enablement precondition:** each portal must pass a live dry-run fetch from the same GitHub Actions environment before enablement. Portals that cannot return stable Job lists from Actions are out of scope for Phase 2 or require a documented alternate fetch path — not “best-effort HTML” alone.

Adapters should populate a reasonable engineering department when the portal’s own filters already scoped to engineering/SWE (empty departments fail the department gate).

Config: replace `ats: custom` with a concrete ATS key per portal family (or a single `ats` value per company that `getAdapter` understands). `enabled: true` only after adapter tests + Actions dry-run pass. Set `domain` / `logoUrl` as part of enablement.

### First-run backfill (these seven only)

Override silent first-run **only** for companies that:

- are using a newly introduced custom portal adapter, and
- have no `seen-jobs.json` key yet at the start of the run.

Behavior on that first non-dry run:

1. Fetch and match as usual (US + season filters apply).
2. Eligible matches may Discord-ping (fit notes included), subject to the existing fair **25** soft cap.
3. Always materialize the company key in `seen-jobs.json` on this first non-dry run (including `{}` when zero jobs post), then record successfully posted job IDs. Deferred soft-capped matches remain unseen until later runs (same as today).
4. After the company key exists, behavior matches the rest of the fleet: only newly appearing matches ping.

Dry-run: may list would-be backfill pings for a company with no seen key; must not write `seen-jobs.json`.

Already-enabled Greenhouse / Ashby / Workday companies **keep** silent first-run snapshots. No replay of historical seen IDs.

**Re-key procedure:** if any of the seven custom company ids is written under silent first-run before backfill code lands, delete that company key (or run a one-time allowlist re-key) before the first backfill-enabled watch so the “no seen key” gate can open.

### Enablement order

Ship adapters one company at a time (or small batches if APIs share a family), dry-run from Actions, then enable with backfill. Do not enable all seven in one untested flip.

## Error handling and ops

| Case | Behavior |
| --- | --- |
| Custom portal fetch failure | Log, isolate to that company; other companies continue (unchanged). |
| Logo missing / bad URL | Omit thumbnail or accept client non-render; post still succeeds. |
| Soft cap hit during portal backfill | Round-robin fairness unchanged; remainder deferred. |
| Actions runtime | Stay within existing ~8 minute quiet-run budget guidance where possible. Workday early-career hydrate adds detail fetches only for candidates that passed list gates 1–4 (not the whole board). If quiet runs approach timeout, stage Workday enabled count or raise the documented budget in the implementation plan. Custom portals count toward enabled fleet cost. |

## Testing

**Phase 1**

- Unit tests for US keep/drop cases (US city, US remote, multi-site with US, bare remote, empty, London-only).
- Unit tests for new-grad year (no year, 2027, 2026) and internship season (Spring 2027 in title, Spring 2027 only in description, Jan–May 2027, Spring/Summer drop, Summer 2027, season missing).
- Workday pipeline tests: list-pass then hydrate then season/year; no hydrate for jobs that fail list gates 1–4.
- Regression: mid-level `Software Engineer` still false.
- Matcher polish fixtures from the closed Scale AI / Stripe corpus pass; bare mid-level still fails.
- Discord tests: thumbnail present when `logoUrl` or `domain` set; omitted otherwise; Company field still present.
- Config tests: optional fields parse; invalid `logoUrl` / `domain` rejected at load.
- Dry-run against live fleet: record would-ping counts for Spring 2027 intern vs qualifying new-grad. Require a non-zero Spring-or-new-grad floor (or an explicit accept-zero decision recorded in the plan) before starting Phase 2.

**Phase 2**

- Adapter fixture tests per portal.
- Actions-environment dry-run fetch must succeed before enable.
- Pipeline test: first run for a backfill-enabled custom company posts matches (soft-capped) and always writes the company key; second run does not repost.
- Pipeline test: first run for normal Greenhouse company remains silent.

## Success criteria

- Discord stops receiving clearly non-US early-career SWE pings from enabled boards.
- Summer / Fall / season-less internships no longer ping; Spring 2027 and qualifying new-grad roles still do.
- Scale AI / Stripe-class **matcher/department wording** misses from the closed Phase 1 fixture corpus are fixed without opening mid-level floodgates. First-run snapshot misses for already-keyed companies remain out of scope.
- For every **enabled** company, the Discord embed includes `thumbnail.url` when `domain` or `logoUrl` is set (visible CDN render is best-effort; `logoUrl` override path required when CDN fails in Discord).
- After Phase 2, a matching open Google (and each of the other six that pass Actions fetch) role can appear in Discord on first enable (backfill), and later only new posts ping.

## Implementation sequencing

1. Spec approval (this document).
2. Implementation plan via writing-plans (Phase 1 tasks, then Phase 2 tasks).
3. Implement Phase 1 → dry-run with volume report → ship.
4. Implement Phase 2 portal-by-portal → Actions dry-run → enable with backfill.

## Deferred / Open Questions

### From 2026-09-09 review

- **Season-less intern drop empties funnel** — Decisions (locked) / Season and year rules (P0, adversarial + product-lens, confidence 100)

  Shipping the locked intern rule will make "no season-less pings" true while internship Discord volume may collapse: bare Intern titles and year-only 2027 Intern titles—the dominant early-career shape on many boards—are explicit drops, and only Spring-labeled posts survive. Phase 2 portals inherit the same gate. Confirm after Phase 1 dry-run whether to keep the hard drop or soften to "2027 + no competing season."

- **Yearless new-grad residual noise** — Season and year rules / New grad (P1, product-lens + adversarial, confidence 75)

  Keeping undated "New Grad" posts is locked and may partially undo season-tightening once Summer/Fall interns are gone. Confirm year-unspecified new-grad keeps remain an intentional residual-noise tradeoff after the Phase 1 dry-run volume report.

- **Phase 2 portals overcommit this requirements spec** — Goals / Phase 2 (P1, scope-guardian, confidence 75)

  Whether the seven custom adapters should live in a separate follow-on requirements spec after Phase 1 filter success is validated, versus staying in this document with matcher-first sequencing.

- **Seven portals locked without yield ranking** — Phase 2: Target companies (P2, product-lens, confidence 75)

  Whether to rank the seven by expected post-filter open-role yield and allow dropping a portal from Phase 2 if dry-run shows no qualifying matches.

- **Incidental years vs graduating-class years** — Season and year rules (P2, coherence, confidence 75)

  Which four-digit years in title/description count as graduating-class years versus incidental dates (deadlines, funding, history) for new-grad drop logic.
