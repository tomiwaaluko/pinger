# US / Season Filters, Logos, and Big-Tech Portals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship US-only + new-grad/Spring-2027 matching, Discord logo thumbnails, Workday hydrate-before-season, then custom adapters for seven mega-tech portals with first-run backfill.

**Architecture:** Keep one shared `matchesJob` (split into base gates + season/year). Greenhouse/Ashby stay single-pass. Workday list-filters with base gates, hydrates only those candidates, then re-runs full match before soft-cap. Logos resolve at embed build via `logoUrl` or Google favicon CDN from `domain`. Phase 2 adds per-portal adapters behind `getAdapter` with public-only fetch and first-run Discord backfill.

**Tech Stack:** Node.js 22, TypeScript, Vitest, YAML (`companies.yaml`), GitHub Actions watcher (unchanged host).

**Spec:** [2026-09-09-us-season-filters-and-big-tech-portals-design.md](../specs/2026-09-09-us-season-filters-and-big-tech-portals-design.md)

## Global Constraints

- US keep if **any** listed place is US; drop empty, bare Remote, purely non-US.
- Internship/co-op requires Spring 2027 (or Jan–May / Winter/Spring 2027 windows); dual Spring/Summer drops; season-missing intern drops.
- New-grad: keep 2027 or no four-digit year; drop non-2027 graduating-class years; intern path wins when intern/co-op language present.
- Early-career class from title **or** description (Workday: title-only until hydrate).
- Workday: hydrate only candidates that pass department + role + title early-career + US; then full match; do not hydrate whole board.
- Logo CDN base: `https://www.google.com/s2/favicons?sz=128&domain=` + URL-encoded hostname (override with `logoUrl`).
- `domain` = DNS hostname only; `logoUrl` = https, no userinfo; never GET/HEAD logos in the watcher.
- Soft cap remains 25; Discord never fails on logo issues; Company field stays authoritative.
- Phase 2: public unauthenticated fetch only; https `absoluteUrl`; Actions dry-run before enable; first-run backfill materializes company key even if zero posts.
- All unit/pipeline tests offline — no live network in CI.
- Do not start Phase 2 tasks until Phase 1 dry-run volume gate is recorded.

## File structure

| File | Responsibility |
| --- | --- |
| `src/matcher.ts` | Base gates + season/year + `matchesJob` |
| `src/location.ts` | US location classification |
| `src/logo.ts` | Resolve Discord thumbnail URL |
| `src/types.ts` | Optional `domain`/`logoUrl` on companies; Discord `thumbnail` |
| `src/config.ts` | Parse/validate optional logo fields |
| `src/discord.ts` | Embed thumbnail |
| `src/pipeline.ts` | Workday pre-match hydrate; custom backfill first-run |
| `src/adapters/*` | Existing ATS + Phase 2 portal modules |
| `scripts/sync-companies-yaml.mjs` | Preserve `domain`/`logoUrl` on sync |
| `data/company-domains.yaml` | Seed domains for enabled companies |
| `tests/matcher.test.ts` | Season/US/early-career cases |
| `tests/location.test.ts` | US keep/drop |
| `tests/logo.test.ts` | Thumbnail resolution |
| `tests/discord.test.ts` | Thumbnail on embed |
| `tests/pipeline.test.ts` | Workday hydrate order; backfill |

---

### Task 1: US location helper

**Files:**
- Create: `src/location.ts`
- Create: `tests/location.test.ts`

**Interfaces:**
- Produces: `isUsLocation(location: string): boolean`

- [ ] **Step 1: Write failing location tests**

```typescript
// tests/location.test.ts
import { describe, expect, it } from "vitest";
import { isUsLocation } from "../src/location.js";

describe("isUsLocation", () => {
  it.each([
    ["San Francisco, CA", true],
    ["Remote - United States", true],
    ["US Remote", true],
    ["New York, NY; London, UK", true],
    ["Seattle, Washington", true],
    ["Austin, TX", true],
    ["", false],
    ["   ", false],
    ["Remote", false],
    ["Remote work", false],
    ["Anywhere", false],
    ["London, UK", false],
    ["Bangalore, India", false],
    ["Toronto, Canada", false],
  ])("%j → %s", (location, expected) => {
    expect(isUsLocation(location)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/location.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `isUsLocation`**

```typescript
// src/location.ts
const US_COUNTRY = /\b(?:united states|usa|u\.s\.a\.|u\.s\.)\b/i;
const STANDALONE_US = /(?:^|[^a-z])us(?:[^a-z]|$)/i;

const STATE_NAMES = [
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
  "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
  "minnesota","mississippi","missouri","montana","nebraska","nevada",
  "new hampshire","new jersey","new mexico","new york","north carolina",
  "north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island",
  "south carolina","south dakota","tennessee","texas","utah","vermont",
  "virginia","washington","west virginia","wisconsin","wyoming","district of columbia",
] as const;

const STATE_ABBR = [
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia",
  "ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
  "nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt",
  "va","wa","wv","wi","wy","dc",
] as const;

const US_METROS = [
  "san francisco","sf","bay area","new york","nyc","new york city","seattle",
  "austin","boston","chicago","los angeles","la","denver","atlanta","miami",
  "dallas","houston","phoenix","san diego","san jose","portland","philadelphia",
  "minneapolis","detroit","salt lake city","raleigh","durham","pittsburgh",
  "washington dc","washington d.c.","arlington","brooklyn","manhattan",
  "redmond","cupertino","mountain view","palo alto","menlo park","sunnyvale",
] as const;

function hasWholePhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

export function isUsLocation(location: string): boolean {
  const raw = location.trim();
  if (!raw) return false;
  const normalized = raw.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  if (/^(remote|remote work|anywhere)$/i.test(normalized)) return false;
  if (US_COUNTRY.test(normalized) || STANDALONE_US.test(normalized)) return true;
  if (STATE_NAMES.some((s) => hasWholePhrase(normalized, s))) return true;
  if (STATE_ABBR.some((s) => hasWholePhrase(normalized, s))) return true;
  if (US_METROS.some((s) => hasWholePhrase(normalized, s))) return true;
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/location.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/location.ts tests/location.test.ts
git commit -m "feat: add US location classifier for job filtering"
```

---

### Task 2: Season/year + early-career matcher rewrite

**Files:**
- Modify: `src/matcher.ts`
- Modify: `tests/matcher.test.ts`
- Modify: `tests/helpers.ts` (only if needed)

**Interfaces:**
- Produces: `passesBaseGates(job: Job): boolean` — department + role + early-career (title|content) + US
- Produces: `passesSeasonYear(job: Job): boolean`
- Produces: `matchesJob(job: Job): boolean` — base && season/year
- Consumes: `isUsLocation` from `src/location.ts`

- [ ] **Step 1: Extend matcher tests for new gates**

Add cases (keep existing department/role regressions). Critical new cases:

```typescript
// tests/matcher.test.ts — additional cases inside describe("matchesJob")
it("keeps US Spring 2027 intern with season in description only", () => {
  expect(
    matchesJob(
      makeJob({
        title: "Software Engineer Intern",
        location: "San Francisco, CA",
        content: "Spring 2027 internship on the platform team.",
      }),
    ),
  ).toBe(true);
});

it("drops season-less intern", () => {
  expect(
    matchesJob(
      makeJob({
        title: "Software Engineer Intern",
        location: "San Francisco, CA",
        content: "Build APIs.",
      }),
    ),
  ).toBe(false);
});

it("drops Summer 2027 intern", () => {
  expect(
    matchesJob(
      makeJob({
        title: "Software Engineer Intern (Summer 2027)",
        location: "Seattle, WA",
      }),
    ),
  ).toBe(false);
});

it("drops Spring/Summer 2027 dual tag", () => {
  expect(
    matchesJob(
      makeJob({
        title: "Software Engineer Intern",
        location: "Austin, TX",
        content: "Spring/Summer 2027 internship",
      }),
    ),
  ).toBe(false);
});

it("keeps Jan–May 2027 spring window", () => {
  expect(
    matchesJob(
      makeJob({
        title: "Software Engineer Intern",
        location: "Boston, MA",
        content: "Internship dates: January–May 2027",
      }),
    ),
  ).toBe(true);
});

it("keeps yearless new grad in US", () => {
  expect(
    matchesJob(
      makeJob({
        title: "New Grad Software Engineer",
        location: "New York, NY",
        content: "",
      }),
    ),
  ).toBe(true);
});

it("drops 2026 new grad", () => {
  expect(
    matchesJob(
      makeJob({
        title: "New Grad Software Engineer 2026",
        location: "San Francisco, CA",
      }),
    ),
  ).toBe(false);
});

it("intern path wins over university wording for Summer", () => {
  expect(
    matchesJob(
      makeJob({
        title: "University Software Engineer Intern",
        location: "Remote - United States",
        content: "Summer 2027 university recruiting",
      }),
    ),
  ).toBe(false);
});

it("drops London-only location", () => {
  expect(
    matchesJob(
      makeJob({
        title: "New Grad Software Engineer",
        location: "London, UK",
      }),
    ),
  ).toBe(false);
});

it("exports passesBaseGates true for Workday list intern before season", () => {
  const job = makeJob({
    title: "Software Engineer Intern",
    location: "San Jose, CA",
    content: "",
  });
  expect(passesBaseGates(job)).toBe(true);
  expect(passesSeasonYear(job)).toBe(false);
  expect(matchesJob(job)).toBe(false);
});
```

Update **existing** cases that used Summer titles expecting `true` — they must now expect `false` (e.g. `"Software Engineer Intern"` without Spring signal). Replace default helper title season by setting content/title appropriately in old cases that should still pass.

- [ ] **Step 2: Run matcher tests — expect failures**

Run: `npm test -- tests/matcher.test.ts`
Expected: FAIL on new assertions / previously-true season-less interns

- [ ] **Step 3: Rewrite `src/matcher.ts`**

Implement roughly:

```typescript
import { isUsLocation } from "./location.js";
import type { Job } from "./types.js";

// Keep EARLY_CAREER / ROLE / DEPT lists; add helpers:
// normalizeText, hasPhrase, departmentGate (unchanged)
// isInternship, isNewGradTrack
// extractYears(text): number[]
// hasSpring2027(text): boolean — Spring 2027, Spring '27, Jan–May 2027, Winter/Spring 2027
// hasNonSpringSeason(text): boolean — summer|fall|autumn|winter (alone)
// classify: if internship language → internship path else new-grad path

export function passesBaseGates(job: Job): boolean {
  if (!departmentGate(job.departments)) return false;
  const title = normalizeTitle(job.title);
  if (!ROLE_PHRASES.some((p) => hasPhrase(title, p))) return false;
  const blob = `${normalizeTitle(job.title)} ${normalizeTitle(job.content)}`;
  const early =
    isInternship(blob) || isNewGradTrack(title) || isNewGradTrack(blob);
  if (!early) return false;
  if (!isUsLocation(job.location)) return false;
  return true;
}

export function passesSeasonYear(job: Job): boolean {
  const title = normalizeTitle(job.title);
  const blob = `${title} ${normalizeTitle(job.content)}`;
  if (isInternship(blob)) {
    if (hasNonSpringSeason(blob) && !hasSpringOnlyWithoutSummerFall(blob)) {
      // Drop if summer/fall/winter indicated; Spring/Summer dual → drop
    }
    if (hasNonSpringCompeting(blob)) return false;
    return hasSpring2027(blob);
  }
  // new-grad path
  const years = extractFourDigitYears(blob);
  if (years.length === 0) return isNewGradTrack(blob) || isNewGradTrack(title);
  if (years.includes(2027) && !years.some((y) => y !== 2027 && isClassYear(y))) {
    return isNewGradTrack(blob) || isNewGradTrack(title);
  }
  // Drop if any non-2027 year present alongside new-grad (prefer: drop if any year !== 2027)
  if (years.some((y) => y !== 2027)) return false;
  return years.includes(2027) && (isNewGradTrack(blob) || isNewGradTrack(title));
}

export function matchesJob(job: Job): boolean {
  return passesBaseGates(job) && passesSeasonYear(job);
}
```

Concrete season helpers (required behavior):

- `hasSpring2027`: match `\bspring\s*'?27\b`, `\bspring\s*2027\b`, `\b(?:jan(?:uary)?|winter)\s*[–\-—/]\s*may\s*2027\b`, `\bwinter\s*/\s*spring\s*2027\b`
- Competing non-Spring: `\b(summer|fall|autumn)\b` → drop; `\bwinter\b` alone without `winter/spring` → drop
- `Spring/Summer 2027` → drop

- [ ] **Step 4: Fix existing matcher tests for new defaults**

Any prior case with bare `Software Engineer Intern` and no Spring content must expect `false`. Cases that should stay true need `content` or title with Spring 2027 / new-grad, and US location (helper already defaults to `Remote - United States`).

- [ ] **Step 5: Run full matcher suite**

Run: `npm test -- tests/matcher.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/matcher.ts tests/matcher.test.ts
git commit -m "feat: filter jobs to US new-grad and Spring 2027 internships"
```

---

### Task 3: Workday hydrate-before-season in pipeline

**Files:**
- Modify: `src/pipeline.ts`
- Modify: `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: `passesBaseGates`, `matchesJob` from matcher
- Consumes: existing `hydrateContent` on Workday adapter

- [ ] **Step 1: Write failing pipeline test for Workday body-only Spring**

```typescript
// tests/pipeline.test.ts — new test
it("hydrates Workday candidates before season match so body Spring 2027 pings", async () => {
  // company workday already in seen store (not first run)
  // listJobs returns intern with empty content, US location, engineering dept
  // hydrateContent fills content with "Spring 2027"
  // expect one Discord post (or dryRunPing)
});
```

Also assert: jobs that fail `passesBaseGates` are never passed to `hydrateContent`.

- [ ] **Step 2: Run test — expect fail**

Run: `npm test -- tests/pipeline.test.ts -t "hydrates Workday"`
Expected: FAIL (season drop before hydrate)

- [ ] **Step 3: Change `processCompany` Workday path**

```typescript
const adapter = getAdapter(company.ats);
const jobs = await adapter.listJobs(company, opts.fetch);

let matched: Job[];
if (company.ats === "workday" && adapter.hydrateContent) {
  const candidates = jobs.filter((job) => passesBaseGates(job));
  let hydrated = candidates;
  try {
    hydrated = await adapter.hydrateContent(company, opts.fetch, candidates);
  } catch (err) {
    console.error(`Workday hydrate failed for ${company.id}:`, String(err));
    hydrated = candidates; // season may fail closed without content
  }
  matched = hydrated.filter((job) => matchesJob(job));
} else {
  matched = jobs.filter((job) => matchesJob(job));
}
```

Remove or narrow `hydrateWorkdayAttemptWindow` so it does not double-hydrate for fit notes if content already present; if fit-note still needs content and hydrate already ran, skip second hydrate for those ids. Minimal change: keep attempt-window hydrate as no-op when `job.content` already non-empty.

- [ ] **Step 4: Run pipeline tests**

Run: `npm test -- tests/pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.ts tests/pipeline.test.ts
git commit -m "feat: hydrate Workday early-career candidates before season match"
```

---

### Task 4: Optional `domain` / `logoUrl` config

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Modify: `tests/config.test.ts`
- Modify: `scripts/sync-companies-yaml.mjs`

**Interfaces:**
- Produces: optional `domain?: string` and `logoUrl?: string` on all company variants

- [ ] **Step 1: Failing config tests**

```typescript
it("accepts domain and https logoUrl", () => {
  const path = writeTempYaml(`
vault:
  careerPath: Career/
llm:
  model: gemini-2.5-flash
companies:
  - id: stripe
    name: Stripe
    ats: greenhouse
    boardToken: stripe
    enabled: true
    domain: stripe.com
    logoUrl: https://cdn.example/stripe.png
`);
  const company = loadConfig(path).companies[0];
  expect(company).toMatchObject({
    domain: "stripe.com",
    logoUrl: "https://cdn.example/stripe.png",
  });
});

it("rejects domain with path", () => {
  expect(() =>
    loadConfig(
      writeTempYaml(`... domain: stripe.com/foo ...`),
    ),
  ).toThrow(/domain/i);
});

it("rejects http logoUrl and userinfo", () => {
  expect(() => loadConfig(writeTempYaml(`... logoUrl: http://x ...`))).toThrow();
  expect(() =>
    loadConfig(writeTempYaml(`... logoUrl: https://user:pass@x/y ...`)),
  ).toThrow();
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- tests/config.test.ts -t "domain"`
Expected: FAIL

- [ ] **Step 3: Parse helpers in `config.ts`**

```typescript
function optionalDomain(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = requireString(value, label);
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(s)) {
    throw new Error(`${label} must be a DNS hostname`);
  }
  return s.toLowerCase();
}

function optionalLogoUrl(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = requireString(value, label);
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must be https`);
  if (url.username || url.password) throw new Error(`${label} must not include userinfo`);
  return s;
}
```

Attach onto each parsed company when present.

- [ ] **Step 4: Preserve fields in sync script**

In `scripts/sync-companies-yaml.mjs`, after building each `row`:

```javascript
if (typeof existing?.domain === "string" && existing.domain.trim()) {
  row.domain = existing.domain;
}
if (typeof existing?.logoUrl === "string" && existing.logoUrl.trim()) {
  row.logoUrl = existing.logoUrl;
}
```

- [ ] **Step 5: Tests pass + commit**

```bash
npm test -- tests/config.test.ts
git add src/types.ts src/config.ts tests/config.test.ts scripts/sync-companies-yaml.mjs
git commit -m "feat: accept optional company domain and logoUrl in config"
```

---

### Task 5: Logo resolver + Discord thumbnail

**Files:**
- Create: `src/logo.ts`
- Create: `tests/logo.test.ts`
- Modify: `src/types.ts` (`DiscordEmbed.thumbnail?`)
- Modify: `src/discord.ts`
- Modify: `tests/discord.test.ts`
- Modify: `src/pipeline.ts` (pass domain/logoUrl into `buildDiscordEmbed`)

**Interfaces:**
- Produces: `resolveLogoThumbnailUrl(input: { domain?: string; logoUrl?: string }): string | undefined`
- CDN: `https://www.google.com/s2/favicons?sz=128&domain=` + `encodeURIComponent(domain)`

- [ ] **Step 1: Failing logo + discord tests**

```typescript
// tests/logo.test.ts
expect(resolveLogoThumbnailUrl({ logoUrl: "https://cdn.example/a.png" })).toBe(
  "https://cdn.example/a.png",
);
expect(resolveLogoThumbnailUrl({ domain: "stripe.com" })).toBe(
  "https://www.google.com/s2/favicons?sz=128&domain=stripe.com",
);
expect(resolveLogoThumbnailUrl({})).toBeUndefined();

// tests/discord.test.ts
const embed = buildDiscordEmbed({
  job: makeJob(),
  companyName: "Stripe",
  companyId: "stripe",
  fit: "ok",
  domain: "stripe.com",
});
expect(embed.thumbnail).toEqual({
  url: "https://www.google.com/s2/favicons?sz=128&domain=stripe.com",
});
```

- [ ] **Step 2: Implement logo + discord wiring**

```typescript
// src/logo.ts
export function resolveLogoThumbnailUrl(input: {
  domain?: string;
  logoUrl?: string;
}): string | undefined {
  if (input.logoUrl) return input.logoUrl;
  if (input.domain) {
    return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(input.domain)}`;
  }
  return undefined;
}
```

```typescript
// buildDiscordEmbed — add optional domain/logoUrl; set thumbnail when resolved
const thumb = resolveLogoThumbnailUrl({
  domain: input.domain,
  logoUrl: input.logoUrl,
});
return {
  ...,
  ...(thumb ? { thumbnail: { url: thumb } } : {}),
};
```

Pipeline: look up company config for `domain`/`logoUrl` when calling `buildDiscordEmbed`.

- [ ] **Step 3: Tests + commit**

```bash
npm test -- tests/logo.test.ts tests/discord.test.ts tests/pipeline.test.ts
git add src/logo.ts src/discord.ts src/types.ts src/pipeline.ts tests/logo.test.ts tests/discord.test.ts
git commit -m "feat: add company logo thumbnails to Discord embeds"
```

---

### Task 6: Seed domains for enabled companies + matcher polish fixtures

**Files:**
- Create: `data/company-domains.yaml` (id → domain map for enabled ids)
- Create: `scripts/apply-company-domains.mjs` (merge into `companies.yaml`)
- Modify: `companies.yaml` (via script)
- Modify: `tests/matcher.test.ts` (closed Scale/Stripe-style fixtures)

**Interfaces:**
- Produces: every `enabled: true` row has `domain` or `logoUrl` after seed

- [ ] **Step 1: Add closed matcher polish fixtures (failing first if phrases missing)**

Use these as the Phase 1 closed corpus (replace with real dry-run titles if different):

```typescript
it("matches Scale-style university graduate SWE wording when present", () => {
  expect(
    matchesJob(
      makeJob({
        title: "Software Engineer, New Grad",
        departments: ["Engineering"],
        location: "San Francisco, CA",
        content: "New graduate program 2027",
      }),
    ),
  ).toBe(true);
});

it("matches Stripe-style internship with Spring in body", () => {
  expect(
    matchesJob(
      makeJob({
        title: "Software Engineering Intern",
        departments: ["Engineering"],
        location: "Seattle, WA",
        content: "Our Spring 2027 internship cohort",
      }),
    ),
  ).toBe(true);
});
```

If department naming was the real miss, add the minimal DEPT_ALLOW token change only for that fixture — freeze after these pass.

- [ ] **Step 2: Write `data/company-domains.yaml` and apply script**

```yaml
# data/company-domains.yaml
domains:
  stripe: stripe.com
  vercel: vercel.com
  scaleai: scale.com
  # ... one entry per enabled company id (complete the list from companies.yaml enabled: true)
```

```javascript
// scripts/apply-company-domains.mjs — read yaml, set company.domain for matching ids, write companies.yaml
```

Run: `node scripts/apply-company-domains.mjs`

Verify: every enabled company has `domain` or `logoUrl`.

- [ ] **Step 3: Config test — enabled fleet logos**

```typescript
it("every enabled company has domain or logoUrl", () => {
  const enabled = loadConfig(join(repoRoot, "companies.yaml")).companies.filter(
    (c) => c.enabled,
  );
  for (const company of enabled) {
    expect(
      ("domain" in company && company.domain) ||
        ("logoUrl" in company && company.logoUrl),
    ).toBeTruthy();
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add data/company-domains.yaml scripts/apply-company-domains.mjs companies.yaml tests/matcher.test.ts tests/config.test.ts src/matcher.ts
git commit -m "chore: seed enabled company domains and freeze matcher polish fixtures"
```

---

### Task 7: Phase 1 dry-run volume gate (manual)

**Files:** none required (ops); optionally add `docs/superpowers/notes/2026-09-09-phase1-dry-run.md`

- [ ] **Step 1: Run dry-run locally or via Actions**

```powershell
$env:DRY_RUN='true'; $env:VAULT_DIR='./vault'; npm start
```

- [ ] **Step 2: Record counts**

Count would-ping Spring 2027 intern vs qualifying new-grad. Write a short note with totals.

- [ ] **Step 3: Gate**

If both are zero, stop and revisit Open Questions (season-less intern softening) before Phase 2. If non-zero (or explicit accept-zero recorded), continue.

- [ ] **Step 4: Commit note if created**

```bash
git add docs/superpowers/notes/2026-09-09-phase1-dry-run.md
git commit -m "docs: record Phase 1 dry-run volume gate"
```

---

## Phase 2 (start only after Task 7 gate)

### Task 8: Custom portal adapter skeleton + backfill first-run

**Files:**
- Modify: `src/adapters/types.ts` — extend `AtsKind` as portals are added (prefer per-company ats string like `google` | `meta` | … or keep `custom` enabled via new kinds)
- Modify: `src/types.ts`, `src/config.ts` — allow enabled non-legacy-custom kinds
- Modify: `src/pipeline.ts` — backfill first-run for portal kinds
- Modify: `tests/pipeline.test.ts`

**Spec rule:** companies with new portal ATS and no seen key: first non-dry run may ping (soft-capped) and **always** writes company key (`{}` if nothing posted).

- [ ] **Step 1: Failing pipeline backfill test**

```typescript
it("first run for portal company pings matches and writes seen key", async () => {
  // ats: "google" (or whatever kind), no seen key, one matching job
  // expect Discord post + seen store has google key with job id
});

it("first run for portal company with zero matches still writes empty key", async () => {
  // expect seen.google === {} and no Discord
});

it("greenhouse first run remains silent", async () => {
  // existing behavior unchanged
});
```

- [ ] **Step 2: Implement `shouldBackfillFirstRun(company)`**

```typescript
const BACKFILL_ATS = new Set(["google","meta","microsoft","amazon","apple","nvidia","openai"]);

function shouldBackfillFirstRun(company: EnabledCompany): boolean {
  return BACKFILL_ATS.has(company.ats);
}
```

In `processCompany`, when `isFirstRun` and `shouldBackfillFirstRun`: push matches to `discordBound` instead of silent snapshot; after Discord loop (or in processCompany end), ensure key materialization. Cleaner: collect backfill companies, let them flow through soft-cap like normal new jobs, and in the post loop / finally always `nextStore[id] ??= {}` for attempted backfill companies.

Minimal approach matching tests:

```typescript
if (isFirstRun(store, company.id)) {
  if (shouldBackfillFirstRun(company)) {
    if (!opts.dryRun) {
      nextStore[company.id] = {}; // materialize immediately
      firstRunCompanyIds.add(company.id);
    }
    for (const job of matched) {
      discordBound.push({ companyId: company.id, job });
    }
    return;
  }
  // existing silent snapshot...
}
```

Record posted ids in the Discord success path as today.

- [ ] **Step 3: Tests pass + commit**

```bash
git commit -m "feat: first-run Discord backfill for custom portal companies"
```

---

### Task 9–15: One portal per task (Google → Meta → Microsoft → Amazon → Apple → NVIDIA → OpenAI)

For **each** portal, repeat this template (replace `google`):

**Files:**
- Create: `src/adapters/google.ts` (name per portal)
- Create: `tests/fixtures/google-*.json`
- Create: `tests/google.test.ts`
- Modify: `src/adapters/index.ts`, `types.ts`, `config.ts`
- Modify: `companies.yaml` — set `ats`, `domain`, `enabled: false` until Actions dry-run

- [ ] **Step 1: Probe public JSON/search from a normal network; document endpoint in adapter file header comment**

If no public API works from GitHub Actions IPs, mark portal out of scope in a short note and skip enablement (do not ship fragile auth).

- [ ] **Step 2: Fixture mapper tests — map sample JSON → `Job` with https `absoluteUrl`, engineering department, location, content**

- [ ] **Step 3: Implement `listGoogleJobs(company, fetch)`**

Drop non-https URLs. Public unauthenticated only.

- [ ] **Step 4: Register adapter; config accepts `ats: google`**

- [ ] **Step 5: Local dry-run with only that company enabled**

- [ ] **Step 6: Actions dry-run workflow dispatch; on success set `enabled: true`**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add Google careers adapter"
```

Repeat commits for meta, microsoft, amazon, apple, nvidia, openai.

---

### Task 16: README + final regression

**Files:**
- Modify: `README.md` — matching section (US, Spring 2027, logos), Phase 2 note

- [ ] **Step 1: Update Matching docs to match spec**

- [ ] **Step 2: `npm test` + `npm run build`**

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: document US/season filters and logo thumbnails"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| US location gate | Task 1–2 |
| Season/year + intern path wins | Task 2 |
| Early-career title or description | Task 2 |
| Workday hydrate-before-season | Task 3 |
| Logos domain/logoUrl + CDN + thumbnail | Tasks 4–5 |
| Seed enabled domains | Task 6 |
| Matcher polish closed fixtures | Task 6 |
| Phase 1 dry-run volume gate | Task 7 |
| Portal backfill + key materialization | Task 8 |
| Seven portals public/https/Actions gate | Tasks 9–15 |
| README | Task 16 |
| Open Questions (season softening, etc.) | Deferred — do not implement unless user decides |

No TBD placeholders in Phase 1 tasks. Phase 2 endpoints are discover-then-implement by design (probe step required).
