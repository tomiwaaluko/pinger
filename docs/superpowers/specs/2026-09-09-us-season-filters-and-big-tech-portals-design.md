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
3. **Big-board skew.** RTX and Cisco dominate because they are large enabled Workday fleets whose titles literally contain “Software Engineer Intern” / “New Grad,” while many startups use titles the matcher rejects, and mega-tech (Google, Meta, Microsoft, Amazon, Apple, NVIDIA, OpenAI) sits as `ats: custom` / `enabled: false` and is never fetched.
4. **Missed Greenhouse hits.** Scale AI and Stripe are already enabled. Misses there are matcher / department / first-run snapshot issues, not missing company rows. Google-class misses are missing adapters.

Separately, Discord embeds are text-only; a company logo thumbnail makes posts easier to scan.

## Goals

- Ping only jobs with at least one **United States** location.
- Ping only **new-grad** (2027 or year-unspecified) or **Spring 2027** internship / co-op roles for Software Engineer / AI Engineer tracks.
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
| Season when missing from title and description | Drop. Keep only explicit new-grad or Spring 2027 signals in title **or** description. |
| US location | Keep if **any** listed place is US (including multi-country posts with a US site and `Remote - United States`). Drop empty, bare `Remote`, and purely non-US. |
| New-grad year | Keep if says 2027, or says new grad and never names another year. Drop explicit 2025 / 2026 new-grad. |
| Coverage expansion | Matcher fixes on existing boards, then custom adapters for the seven big-tech portals. No aggregator. |
| Sequencing | **Matcher-first**, then portals one company at a time. |
| First run for the seven portals | One backfill: first non-dry enable may ping currently open matches (soft-capped). Later runs only new posts. Already-enabled companies keep silent first-run. |
| Logo source | Optional `logoUrl` override, else public logo CDN via optional `domain`. Else post without thumbnail. |
| Logo placement | Discord embed `thumbnail`. |
| Logo domain | Explicit optional `domain` only; no slug→domain guess. |

## Architecture

```text
companies.yaml (enabled rows)
  → ATS adapters (greenhouse | ashby | workday | <custom portal>)
  → shared Job
  → matchesJob (dept → role → early-career → US → season/year)
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
3. **Early-career class** — title (and, for season/year only, description) must establish either **new grad** or **internship / co-op**.
4. **US location gate** — see below.
5. **Season / year gate** — see below; uses **title + description** (`job.content`, already capped for LLM).

Department and role gates stay title/department-based. Season and year intentionally read description because many Spring 2027 / new-grad posts only put the cycle in the body.

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
- **Keep** only when title or description clearly indicates **Spring 2027** (e.g. `Spring 2027`, `Spring '27`, `Spring 27` in an internship context).
- **Drop** when Summer, Fall, Winter, or any non-Spring season is indicated for the internship, regardless of year.
- **Drop** when year is present but not 2027.
- **Drop** when no Spring 2027 signal appears anywhere in title or description (including bare `Software Engineer Intern`).

### Matcher polish (existing boards)

Widen matching only where needed to catch real early-career SWE roles that Scale AI / Stripe-style boards post, without matching generic mid-level `Software Engineer` titles.

Rules:

- Do **not** match titles that are only `Software Engineer` / `AI Engineer` with no early-career signal.
- Prefer small phrase additions backed by failing tests from real missed postings (e.g. department naming quirks), not broad “junior / associate” opens that flood mid-level roles.
- Jobs already present in `seen-jobs.json` stay silent. Jobs that newly match and were never recorded can ping on a normal later run (no fleet-wide backfill).

### Logos (Phase 1)

Extend company config:

```yaml
- id: stripe
  name: Stripe
  ats: greenhouse
  boardToken: stripe
  enabled: true
  domain: stripe.com        # optional
  logoUrl: https://...      # optional override
```

`loadConfig` accepts optional `domain` and `logoUrl` (non-empty strings; `logoUrl` must be `https://`). Sync / compile scripts must preserve these fields when regenerating `companies.yaml`.

Discord embed builder adds:

```ts
thumbnail?: { url: string }
```

Resolution at embed build time only:

1. If `logoUrl` set → use it.
2. Else if `domain` set → public logo CDN URL derived from that domain (exact CDN chosen in the implementation plan; must be HTTPS and stable).
3. Else → omit `thumbnail`.

Failure policy: never fail the Discord post because a logo URL is missing or a CDN is down. No runtime HEAD check required; Discord simply omits or fails to render a bad image while the message still posts.

Seed `domain` (and `logoUrl` only when CDN is wrong) for **enabled** companies and other high-signal rows touched in Phase 1. No requirement to annotate the entire ~500+ list.

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

Each gets a dedicated adapter module that returns the shared `Job` shape (`id`, `title`, `location`, `departments`, `absoluteUrl`, `content`, …). Prefer official or stable JSON/search APIs over HTML scraping. If a portal only offers fragile HTML, document that risk in the implementation plan and still map into `Job` with best-effort departments (empty departments will fail the department gate — adapters should populate a reasonable engineering department when the portal’s own filters already scoped to engineering/SWE).

Config: replace `ats: custom` with a concrete ATS key per portal family (or a single `ats` value per company that `getAdapter` understands). `enabled: true` only after adapter tests + dry-run pass. Set `domain` / `logoUrl` as part of enablement.

### First-run backfill (these seven only)

Override silent first-run **only** for companies that:

- are using a newly introduced custom portal adapter, and
- have no `seen-jobs.json` key yet at the start of the run.

Behavior on that first non-dry run:

1. Fetch and match as usual (US + season filters apply).
2. Eligible matches may Discord-ping (fit notes included), subject to the existing fair **25** soft cap.
3. Record successfully posted jobs in `seen-jobs.json`.
4. Deferred soft-capped matches remain unseen until later runs (same as today).
5. After the company key exists, behavior matches the rest of the fleet: only newly appearing matches ping.

Dry-run: may list would-be backfill pings for a company with no seen key; must not write `seen-jobs.json`.

Already-enabled Greenhouse / Ashby / Workday companies **keep** silent first-run snapshots. No replay of historical seen IDs.

### Enablement order

Ship adapters one company at a time (or small batches if APIs share a family), dry-run, then enable with backfill. Do not enable all seven in one untested flip.

## Error handling and ops

| Case | Behavior |
| --- | --- |
| Custom portal fetch failure | Log, isolate to that company; other companies continue (unchanged). |
| Logo missing / bad URL | Post embed without relying on image success. |
| Soft cap hit during portal backfill | Round-robin fairness unchanged; remainder deferred. |
| Actions runtime | Stay within existing ~8 minute quiet-run budget guidance; custom portals count toward enabled fleet cost. |

## Testing

**Phase 1**

- Unit tests for US keep/drop cases (US city, US remote, multi-site with US, bare remote, empty, London-only).
- Unit tests for new-grad year (no year, 2027, 2026) and internship season (Spring 2027 in title, Spring 2027 only in description, Summer 2027, season missing).
- Regression: mid-level `Software Engineer` still false.
- Discord tests: thumbnail present when `logoUrl` or `domain` set; omitted otherwise.
- Config tests: optional fields parse; invalid `logoUrl` rejected at load.
- Dry-run against live fleet before relying on production Discord volume change.

**Phase 2**

- Adapter fixture tests per portal.
- Pipeline test: first run for a backfill-enabled custom company posts matches (soft-capped); second run does not repost.
- Pipeline test: first run for normal Greenhouse company remains silent.

## Success criteria

- Discord stops receiving clearly non-US early-career SWE pings from enabled boards.
- Summer / Fall / season-less internships no longer ping; Spring 2027 and qualifying new-grad roles still do.
- Scale AI / Stripe-class misses caused by overly narrow early-career wording are reduced without opening mid-level floodgates.
- Embeds for companies with `domain` or `logoUrl` show a logo thumbnail.
- After Phase 2, a matching open Google (and each of the other six) role can appear in Discord on first enable (backfill), and later only new posts ping.

## Implementation sequencing

1. Spec approval (this document).
2. Implementation plan via writing-plans (Phase 1 tasks, then Phase 2 tasks).
3. Implement Phase 1 → dry-run → ship.
4. Implement Phase 2 portal-by-portal → dry-run → enable with backfill.
