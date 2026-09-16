# Matcher Widen and Simplify Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen US SWE/AI title matching so junior/L1/bare SWE ping the new-grad webhook, classify intern vs new-grad from the title only, prefer intern and high-signal titles inside the 25-post cap, then add a manual offline Simplify coverage script that never pings Discord.

**Architecture:** Keep `matchesJob` as the single filter and `jobTrack` as Discord routing. Drop the early-career-phrase requirement; add a title-only mid/senior deny list and whole-token `sde`. Intern class reads the title only; intern season/year still scans title+body. Soft cap still round-robins fairly, but fills intern + high-signal new-grad before yearless-bare SWE. The coverage script fetches two Simplify `listings.json` files, joins to `companies.yaml`, and writes gitignored report + delta yaml. Watch stays on first-party ATS only.

**Tech Stack:** Node.js 22, TypeScript, Vitest, YAML (`companies.yaml`), GitHub Actions watcher (unchanged host). Coverage CLI is `node scripts/simplify-coverage.mjs` after `npm run build`.

**Spec:** [2026-09-16-matcher-widen-and-simplify-coverage-design.md](../specs/2026-09-16-matcher-widen-and-simplify-coverage-design.md)

## Global Constraints

- US location, intern **2027 season** (once classified intern), new-grad year extractor (yearless or only-2027), dual webhooks, cap **size** 25, first-run silence, and portal trust boundary stay as shipped.
- Intern **class** is title-only (`intern` / `internship` / `co op` / `coop`). Body-only intern wording does not steal or drop a SWE title.
- Title deny is title-only: `senior`, `sr`, `staff`, `principal`, `lead`, `manager`, `director`, roman `ii`/`iii`/`iv`, and role+level `2`/`3`/`4`. Do not deny `associate`, `junior`, `i`, `1`, or a bare digit (`Python 3`, `iOS 18`).
- Role phrases: existing set plus whole-token `sde` (must not match `sdet`).
- Soft cap fills intern + high-signal new-grad first (fair across companies), then yearless-bare / other non-signal new-grad.
- High-signal title tokens: `junior`, `entry level`, `early career`, `early in career`, `associate`, `new grad`, `college grad`, `university grad`, `fresh grad`, `engineer 1`, `engineer i`, `sde 1`, `sde i`.
- Workday/NVIDIA: list-phase is `passesBaseGates` (dept → role → title deny → US). Intern class is title-only but is **not** a list-phase keep/drop filter. Hydrate only those survivors. Season/year runs after hydrate. Do not hydrate the whole board. After hydrate, a still-empty body must not yearless-keep (title-only 2027 / intern season in the title may still keep).
- Coverage script is manual. Do not edit `.github/workflows/watch.yml`. Do not overwrite `companies.yaml`. Do not ping Discord from Simplify lists.
- Suggested `enable:` is join + `adapterCanFetch` only — not gated on synthetic `matchesJob`. Never enable ids `google` / `meta` / `microsoft` / `apple`.
- All unit tests offline. No live GitHub, ATS, or Discord in CI.
- Task 4 is the matcher **merge** gate (non-empty dry-run window, not majority yearless-bare). Task 5 depends on Task 1 matcher APIs and may proceed even if Task 4 fails.

## File structure

| File | Responsibility |
| --- | --- |
| `src/matcher.ts` | Role phrases, title deny, title-only intern class, new-grad year for all non-intern role matches, `jobTrack`, `capBucket`, `allowEmptyContentAfterHydrate` |
| `src/adapters/workday.ts` | Infer Engineering from matcher `hasRolePhrase` (includes `sde`) |
| `src/soft-cap.ts` | Two-tier fair window: preferred (intern + high-signal) then overflow |
| `src/pipeline.ts` | Unchanged hydrate order; drop yearless-keep on empty post-hydrate bodies; dry-run pings include `track` + `capBucket` |
| `tests/greenhouse.test.ts` | Vercel AI SDK fixture becomes a keep |
| `tests/workday.test.ts` | `SDE I` infers Engineering |
| `src/types.ts` | Optional `track` / `capBucket` on `DryRunPing` |
| `src/cli.ts` | Dry-run JSON includes bucket counts |
| `src/simplify-coverage.ts` | Join, SWE-equivalent filter, classify, render report + suggested yaml, fetch-with-retry |
| `src/simplify-coverage-cli.ts` | CLI entry compiled to `dist/` |
| `scripts/simplify-coverage.mjs` | Thin launcher: `node dist/simplify-coverage-cli.js` |
| `tests/matcher.test.ts` | Keep/drop corpus, title-only intern, `jobTrack` |
| `tests/soft-cap.test.ts` | Preference order + fairness |
| `tests/pipeline.test.ts` | Intern vs bare SWE webhooks; cap preference through `runWatcher` |
| `tests/simplify-coverage.test.ts` | Fixture-only coverage cases |
| `.gitignore` | Coverage output files |
| `docs/superpowers/notes/2026-09-16-matcher-dry-run.md` | Volume-gate record |

Matcher (Tasks 1–4) ships on its own. Checklist (Tasks 5–6) is a second shippable slice that imports matcher APIs.

---

### Task 1: Matcher widen + title-only intern class

**Files:**
- Modify: `src/matcher.ts`
- Modify: `src/adapters/workday.ts`
- Modify: `tests/matcher.test.ts`
- Modify: `tests/workday.test.ts`
- Modify: `tests/greenhouse.test.ts`

**Interfaces:**
- Produces:
  - `matchesJob(job: Job): boolean` (same name; new keep/drop rules)
  - `jobTrack(job: Job): JobTrack | null` — intern from **title only**; role + not title-denied → `"new-grad"`; else `null`
  - `hasRolePhrase(title: string): boolean`
  - `isInternTitle(job: Job): boolean`
  - `capBucket(job: Job): CapBucket` where `CapBucket = "intern" | "high-signal-new-grad" | "yearless-bare"`
  - `allowEmptyContentAfterHydrate(job: Job): boolean` — true only when the **title** itself has intern 2027 season or a 2027-only year; false for yearless empty bodies
  - `passesBaseGates(job: Job): boolean` — dept, role, **not** title-denied, US. No early-career phrase required.
  - `passesSeasonYear(job: Job): boolean` — intern **title** → intern 2027 season on title+body; else new-grad year rule on title+body (no “new grad” words required)

- [ ] **Step 1: Flip the existing table rows that this spec now keeps**

In `tests/matcher.test.ts`, change these six `false` rows to `true`:

```typescript
    ["Graduate Software Engineer", ["Engineering"], true],
    ["University Software Engineer", ["Engineering"], true],
    ["Associate Software Engineer", ["Engineering"], true],
    ["Junior Software Engineer", ["Engineering"], true],
    ["Software Engineer, AI SDK", ["Engineering"], true],
    ["Undergraduate Software Engineer", ["Engineering"], true],
```

Leave intern rows, department denies, `Senior Software Engineer`, and `Engineering Manager Intern` unchanged.

- [ ] **Step 2: Add the widen corpus + title-only intern tests**

Append to `tests/matcher.test.ts` (keep existing intern season cases):

```typescript
describe("matcher widen keep/drop", () => {
  const us = { location: "San Francisco, CA", content: "", departments: ["Engineering"] };

  it.each([
    ["Software Engineer"],
    ["Software Engineer, Backend"],
    ["Associate Software Engineer"],
    ["Junior Software Engineer"],
    ["Entry Level Software Engineer"],
    ["Early Career Software Engineer"],
    ["Early in Career Software Engineer"],
    ["College Grad Software Engineer"],
    ["University Grad Software Engineer"],
    ["Fresh Grad Software Engineer"],
    ["Software Engineer 1"],
    ["Software Engineer I"],
    ["SDE I"],
    ["SDE 1"],
    ["New Grad Software Engineer"],
    ["AI Engineer"],
    ["SWE"],
    ["Software Engineer, Python 3"],
    ["Software Engineer, iOS 18"],
  ])("keeps %s as new-grad", (title) => {
    const job = makeJob({ ...us, title });
    expect(matchesJob(job)).toBe(true);
    expect(jobTrack(job)).toBe("new-grad");
  });

  it("keeps body-only internship wording on the new-grad path", () => {
    const job = makeJob({
      ...us,
      title: "Software Engineer",
      content: "internship experience preferred",
    });
    expect(matchesJob(job)).toBe(true);
    expect(jobTrack(job)).toBe("new-grad");
  });

  it.each([
    ["Senior Software Engineer"],
    ["Sr Software Engineer"],
    ["Staff Software Engineer"],
    ["Principal Software Engineer"],
    ["Lead Software Engineer"],
    ["Software Engineer II"],
    ["Software Engineer III"],
    ["Software Engineer 2"],
    ["Software Engineer 3"],
    ["Software Engineer 4"],
    ["SDE 2"],
    ["SWE 2"],
    ["Software Engineering Manager"],
    ["Junior Product Manager"],
    ["Engineer 1"],
    ["Founding Engineer"],
    ["SDET"],
  ])("drops %s", (title) => {
    expect(matchesJob(makeJob({ ...us, title }))).toBe(false);
  });

  it("drops London-only bare SWE", () => {
    expect(
      matchesJob(
        makeJob({
          title: "Software Engineer",
          location: "London, UK",
          content: "",
        }),
      ),
    ).toBe(false);
  });

  it("drops intern title with no 2027 season", () => {
    expect(
      matchesJob(
        makeJob({
          ...us,
          title: "Software Engineer Intern",
          content: "Build APIs.",
        }),
      ),
    ).toBe(false);
  });

  it("drops new-grad SWE with a non-2027 year", () => {
    expect(
      matchesJob(
        makeJob({
          ...us,
          title: "Software Engineer",
          content: "Class of 2026",
        }),
      ),
    ).toBe(false);
  });

  it("intern title wins jobTrack over new-grad wording", () => {
    const job = makeJob({
      ...us,
      title: "New Grad Software Engineer Intern",
      content: "Summer 2027 internship",
    });
    expect(matchesJob(job)).toBe(true);
    expect(jobTrack(job)).toBe("intern");
  });
});

describe("capBucket", () => {
  it("buckets intern titles as intern", () => {
    expect(
      capBucket(
        makeJob({
          title: "Software Engineer Intern",
          content: "Summer 2027 internship",
        }),
      ),
    ).toBe("intern");
  });

  it("buckets associate / SDE I as high-signal new-grad", () => {
    expect(capBucket(makeJob({ title: "Associate Software Engineer", content: "" }))).toBe(
      "high-signal-new-grad",
    );
    expect(capBucket(makeJob({ title: "SDE I", content: "" }))).toBe(
      "high-signal-new-grad",
    );
  });

  it("buckets yearless bare SWE as yearless-bare", () => {
    expect(capBucket(makeJob({ title: "Software Engineer", content: "" }))).toBe(
      "yearless-bare",
    );
  });
});
```

Add `capBucket` to the existing import from `../src/matcher.js`.

In `tests/greenhouse.test.ts`, replace the empty-match assertion:

```typescript
  it("keeps the captured Vercel Software Engineer, AI SDK job after matcher widen", () => {
    const mapped = fixture.jobs.map((row) => mapGreenhouseJob(row));
    const matched = mapped.filter((job) => matchesJob(job));
    expect(matched.map((job) => job.title)).toEqual([
      "Software Engineer, AI SDK",
    ]);
  });
```

In `tests/workday.test.ts`, add:

```typescript
  it("infers Engineering for SDE I with no department field", () => {
    const job = mapWorkdayListItem(boeingCompany, {
      title: "SDE I",
      locationsText: "Austin, TX",
      externalPath: "/job/Austin/SDE-I_JR300",
      jobReqId: "JR300",
    });
    expect(job?.departments).toEqual(["Engineering"]);
  });
```

Also update the existing `jobTrack` example that expects `null` for Staff (keep it) and add:

```typescript
  it("classifies associate, bare SWE, Software Engineer 1, and SDE I as new-grad", () => {
    for (const title of [
      "Associate Software Engineer",
      "Software Engineer",
      "Junior Software Engineer",
      "Software Engineer 1",
      "SDE I",
    ]) {
      expect(jobTrack(makeJob({ title, content: "" }))).toBe("new-grad");
    }
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/matcher.test.ts`

Expected: FAIL — Associate/Junior/bare SWE still dropped; `capBucket` not exported; SDE I has no role phrase; greenhouse fixture still expects zero matches; Workday `SDE I` does not infer Engineering.

- [ ] **Step 4: Replace `src/matcher.ts` with the widened matcher**

```typescript
import { isUsLocation } from "./location.js";
import type { Job } from "./types.js";

const INTERN_PHRASES = ["intern", "internship", "co op", "coop"] as const;

const ROLE_PHRASES = [
  "software engineer",
  "software engineering",
  "ai engineer",
  "swe",
  "sde",
] as const;

const TITLE_DENY_TOKENS = [
  "senior",
  "sr",
  "staff",
  "principal",
  "lead",
  "manager",
  "director",
  "ii",
  "iii",
  "iv",
] as const;

const ROLE_LEVEL_DENY = /\b(?:engineer|sde|swe)\s+[234]\b/;

const HIGH_SIGNAL_PHRASES = [
  "junior",
  "entry level",
  "early career",
  "early in career",
  "associate",
  "new grad",
  "college grad",
  "university grad",
  "fresh grad",
  "engineer 1",
  "engineer i",
  "sde 1",
  "sde i",
] as const;

const DEPT_ALLOW = ["engineering", "software", "swe", "ai"] as const;
const DEPT_DENY = [
  "sales",
  "solution",
  "solutions",
  "field",
  "non",
] as const;

export type JobTrack = "intern" | "new-grad";
export type CapBucket = "intern" | "high-signal-new-grad" | "yearless-bare";

export function normalizeTitle(title: string): string {
  return normalizeText(title);
}

function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/[\u2010-\u2015-]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hasPhrase(normalized: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(normalized);
}

function departmentGate(departments: string[]): boolean {
  if (!Array.isArray(departments) || departments.length === 0) {
    return false;
  }
  const normalized = departments.map((d) => normalizeTitle(d));
  if (normalized.some((d) => DEPT_DENY.some((tok) => hasPhrase(d, tok)))) {
    return false;
  }
  return normalized.some((d) => DEPT_ALLOW.some((tok) => hasPhrase(d, tok)));
}

export function hasRolePhrase(title: string): boolean {
  const normalized = normalizeTitle(title);
  return ROLE_PHRASES.some((phrase) => hasPhrase(normalized, phrase));
}

function titleDenied(title: string): boolean {
  const normalized = normalizeTitle(title);
  if (TITLE_DENY_TOKENS.some((tok) => hasPhrase(normalized, tok))) {
    return true;
  }
  return ROLE_LEVEL_DENY.test(normalized);
}

export function isInternTitle(job: Job): boolean {
  const title = normalizeTitle(job.title);
  return INTERN_PHRASES.some((phrase) => hasPhrase(title, phrase));
}

export function capBucket(job: Job): CapBucket {
  if (isInternTitle(job)) {
    return "intern";
  }
  const title = normalizeTitle(job.title);
  if (HIGH_SIGNAL_PHRASES.some((phrase) => hasPhrase(title, phrase))) {
    return "high-signal-new-grad";
  }
  return "yearless-bare";
}

/** After Workday/NVIDIA hydrate, empty bodies must not yearless-keep. Title-only 2027 / intern season may still keep. */
export function allowEmptyContentAfterHydrate(job: Job): boolean {
  const title = normalizeTitle(job.title);
  if (isInternTitle(job)) {
    return has2027InternSeason(title);
  }
  const years = extractFourDigitYears(title);
  if (years.length === 0) {
    return false;
  }
  return years.every((year) => year === 2027);
}

function extractFourDigitYears(normalized: string): number[] {
  return [...normalized.matchAll(/\b(20\d{2})\b/g)].map((match) =>
    Number(match[1]),
  );
}

function extractInternSeasonYears(normalized: string): number[] {
  return [
    ...normalized.matchAll(
      /\b(?:spring|summer|fall|autumn|winter)\s*['’]?(\d{2}|\d{4})\b/g,
    ),
  ].map((match) => {
    const value = Number(match[1]);
    return match[1].length === 2 ? 2000 + value : value;
  });
}

function has2027InternSeason(normalized: string): boolean {
  return (
    extractInternSeasonYears(normalized).includes(2027) ||
    /\b(?:jan(?:uary)?|winter)\s+may\s+2027\b/.test(normalized) ||
    /\b(?:spring|summer|fall|autumn|winter)\s*\/\s*(?:spring|summer|fall|autumn|winter)\s*'?(?:2027|27)\b/.test(
      normalized,
    )
  );
}

function titleAndContent(job: Job): string {
  return `${normalizeText(job.title)} ${normalizeText(job.content)}`.trim();
}

/** Which Discord channel a job routes to. Only meaningful for jobs that already pass matchesJob. */
export function jobTrack(job: Job): JobTrack | null {
  if (isInternTitle(job)) {
    return "intern";
  }
  if (hasRolePhrase(job.title) && !titleDenied(job.title)) {
    return "new-grad";
  }
  return null;
}

export function passesBaseGates(job: Job): boolean {
  if (!departmentGate(job.departments)) {
    return false;
  }
  if (!hasRolePhrase(job.title)) {
    return false;
  }
  if (titleDenied(job.title)) {
    return false;
  }
  return isUsLocation(job.location);
}

export function passesSeasonYear(job: Job): boolean {
  const blob = titleAndContent(job);

  if (isInternTitle(job)) {
    if (extractInternSeasonYears(blob).some((year) => year !== 2027)) {
      return false;
    }
    if (extractFourDigitYears(blob).some((year) => year !== 2027)) {
      return false;
    }
    return has2027InternSeason(blob);
  }

  const years = extractFourDigitYears(blob);
  if (years.length === 0) {
    return true;
  }
  if (years.some((year) => year !== 2027)) {
    return false;
  }
  return years.includes(2027);
}

export function matchesJob(job: Job): boolean {
  return passesBaseGates(job) && passesSeasonYear(job);
}
```

Keep intern season regexes identical to the current file. Do not reintroduce `EARLY_CAREER_PHRASES`. Do not classify intern from `job.content`. `has2027InternSeason` and `extractFourDigitYears` stay file-private; `allowEmptyContentAfterHydrate` is the export Task 3 uses.

In `src/adapters/workday.ts`, delete the local `SWE_ROLE_PHRASES` / `hasPhrase` copies and route `titleHasSweRole` through matcher `hasRolePhrase`:

```typescript
import { hasRolePhrase } from "../matcher.js";

function titleHasSweRole(title: string): boolean {
  return hasRolePhrase(title);
}
```

Drop unused `normalizeTitle` from that import if nothing else in the file needs it. NVIDIA list jobs already go through `listWorkdayJobs`, so this covers NVIDIA too.

- [ ] **Step 5: Run matcher + Workday + Greenhouse tests**

Run: `npm test -- tests/matcher.test.ts tests/workday.test.ts tests/greenhouse.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/matcher.ts src/adapters/workday.ts tests/matcher.test.ts tests/workday.test.ts tests/greenhouse.test.ts
git commit -m "feat: widen SWE matcher and classify intern from title only"
```

---

### Task 2: Soft-cap intern / high-signal preference

**Files:**
- Modify: `src/soft-cap.ts`
- Modify: `tests/soft-cap.test.ts`

**Interfaces:**
- Consumes: `capBucket(job: Job): CapBucket` from Task 1
- Produces: `selectAttemptWindow(bound, cap?)` still returns `{ attempt, deferred }`, but preferred jobs fill first

- [ ] **Step 1: Write failing preference tests**

Append to `tests/soft-cap.test.ts`:

```typescript
describe("selectAttemptWindow cap preference", () => {
  it("fills intern and high-signal new-grad before yearless bare SWE", () => {
    const overflow = Array.from({ length: 40 }, (_, i) => ({
      companyId: "aaa",
      job: makeJob({
        id: String(i + 1),
        title: "Software Engineer",
        content: "",
      }),
    }));
    const preferred = [
      {
        companyId: "zzz",
        job: makeJob({
          id: "100",
          title: "Software Engineer Intern",
          content: "Summer 2027 internship",
        }),
      },
      {
        companyId: "zzz",
        job: makeJob({
          id: "101",
          title: "Associate Software Engineer",
          content: "",
        }),
      },
    ];
    const { attempt, deferred } = selectAttemptWindow(
      [...overflow, ...preferred],
      25,
    );
    expect(attempt).toHaveLength(25);
    expect(attempt.filter((item) => item.companyId === "zzz")).toHaveLength(2);
    expect(
      attempt.some((item) => item.job.title === "Software Engineer Intern"),
    ).toBe(true);
    expect(
      attempt.some((item) => item.job.title === "Associate Software Engineer"),
    ).toBe(true);
    expect(deferred).toHaveLength(17);
    expect(deferred.every((item) => item.job.title === "Software Engineer")).toBe(
      true,
    );
  });

  it("does not let yearless-bare steal slots from another company's intern", () => {
    const overflow = Array.from({ length: 40 }, (_, i) => ({
      companyId: "aaa",
      job: makeJob({
        id: String(i + 1),
        title: "Software Engineer",
        content: "",
      }),
    }));
    const internOnly = [
      {
        companyId: "zzz",
        job: makeJob({
          id: "100",
          title: "Software Engineer Intern",
          content: "Fall 2027 internship",
        }),
      },
    ];
    const { attempt } = selectAttemptWindow([...overflow, ...internOnly], 25);
    expect(attempt.filter((item) => item.companyId === "zzz")).toHaveLength(1);
    expect(attempt[0]?.companyId).toBe("zzz");
  });

  it("round-robins preferred jobs across companies before overflow", () => {
    const internsAaa = Array.from({ length: 40 }, (_, i) => ({
      companyId: "aaa",
      job: makeJob({
        id: String(i + 1),
        title: "Software Engineer Intern",
        content: "Spring 2027 internship",
      }),
    }));
    const juniorZzz = [
      {
        companyId: "zzz",
        job: makeJob({
          id: "100",
          title: "Junior Software Engineer",
          content: "",
        }),
      },
      {
        companyId: "zzz",
        job: makeJob({
          id: "101",
          title: "Junior Software Engineer",
          content: "",
        }),
      },
    ];
    const { attempt } = selectAttemptWindow([...internsAaa, ...juniorZzz], 25);
    expect(attempt.filter((item) => item.companyId === "zzz")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/soft-cap.test.ts`

Expected: FAIL — current round-robin starts with sorted company id `aaa`, so yearless-bare from `aaa` occupies slot 0 and can starve `zzz` on a 25-window when `aaa` has 40 overflow jobs and `zzz` is preferred (second test expects `attempt[0]` to be `zzz`).

- [ ] **Step 3: Implement two-tier `selectAttemptWindow`**

Replace `src/soft-cap.ts` with:

```typescript
import { DISCORD_SOFT_CAP } from "./constants.js";
import { capBucket } from "./matcher.js";
import type { Job } from "./types.js";

export type BoundJob = { companyId: string; job: Job };

export function compareJobIds(a: string, b: string): number {
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return aNum - bNum;
  }
  return a.localeCompare(b);
}

function isPreferred(job: Job): boolean {
  const bucket = capBucket(job);
  return bucket === "intern" || bucket === "high-signal-new-grad";
}

function roundRobinFair(
  bound: BoundJob[],
  cap: number,
): { attempt: BoundJob[]; deferred: BoundJob[] } {
  const groups = new Map<string, BoundJob[]>();
  for (const item of bound) {
    const list = groups.get(item.companyId) ?? [];
    list.push(item);
    groups.set(item.companyId, list);
  }

  const companyIds = [...groups.keys()].sort();
  const queues = companyIds.map((id) => {
    const jobs = groups.get(id)!;
    jobs.sort((a, b) => compareJobIds(a.job.id, b.job.id));
    return jobs;
  });

  const attempt: BoundJob[] = [];

  while (attempt.length < cap && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      if (attempt.length >= cap) break;
      if (queue.length === 0) continue;
      attempt.push(queue.shift()!);
    }
  }

  return { attempt, deferred: queues.flat() };
}

export function selectAttemptWindow(
  bound: BoundJob[],
  cap: number = DISCORD_SOFT_CAP,
): { attempt: BoundJob[]; deferred: BoundJob[] } {
  const preferred = bound.filter((item) => isPreferred(item.job));
  const overflow = bound.filter((item) => !isPreferred(item.job));
  const first = roundRobinFair(preferred, cap);
  const second = roundRobinFair(overflow, cap - first.attempt.length);
  return {
    attempt: [...first.attempt, ...second.attempt],
    deferred: [...first.deferred, ...second.deferred],
  };
}
```

Keep the existing four `selectAttemptWindow` tests. They all use `makeJob()` default title `Software Engineer Intern`, which is preferred, so behavior stays one-tier among intern titles.

- [ ] **Step 4: Run soft-cap tests**

Run: `npm test -- tests/soft-cap.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/soft-cap.ts tests/soft-cap.test.ts
git commit -m "feat: prefer intern and high-signal titles inside the Discord cap"
```

---

### Task 3: Pipeline routing + dry-run bucket fields

**Files:**
- Modify: `src/types.ts` (`DryRunPing`)
- Modify: `src/pipeline.ts` (`toPing`)
- Modify: `src/cli.ts` (print `bucketCounts`)
- Modify: `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: `jobTrack`, `capBucket`, `selectAttemptWindow` from Tasks 1–2
- Produces: `DryRunPing` with `track?: "intern" | "new-grad"` and `capBucket?: "intern" | "high-signal-new-grad" | "yearless-bare"`

- [ ] **Step 1: Add pipeline tests for bare SWE routing and cap preference**

In `tests/pipeline.test.ts`, add a helper next to `newGrad`:

```typescript
const bareSwe = (id: string, overrides: Partial<Job> = {}): Job =>
  makeJob({
    id,
    title: "Software Engineer",
    absoluteUrl: `https://job-boards.greenhouse.io/${overrides.absoluteUrl ?? "board"}/jobs/${id}`,
    content: "",
    ...overrides,
  });
```

Append inside the existing `describe("runWatcher fleet pipeline")`:

```typescript
  it("routes intern hits to the intern webhook and bare SWE to the new-grad webhook", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { vercel: {} });
    const posted: { url: string; embed: DiscordEmbed }[] = [];

    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        listJobs: async () => [intern("10"), bareSwe("20")],
        postDiscord: async (url, embed) => {
          posted.push({ url, embed });
        },
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(posted).toHaveLength(2);
    expect(posted.find((p) => p.embed.url.endsWith("/jobs/10"))?.url).toBe(
      "https://discord.test/webhook-intern",
    );
    expect(posted.find((p) => p.embed.url.endsWith("/jobs/20"))?.url).toBe(
      "https://discord.test/webhook",
    );
  });

  it("exits 2 and posts nothing when a mixed intern + bare SWE batch is missing one webhook", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { vercel: {} });
    const postDiscord = vi.fn(async () => undefined);

    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        env: {
          DISCORD_WEBHOOK_URL: "https://discord.test/webhook",
          GEMINI_API_KEY: "gemini-key",
        },
        listJobs: async () => [intern("10"), bareSwe("20")],
        postDiscord,
      }),
    );

    expect(result.exitCode).toBe(2);
    expect(postDiscord).not.toHaveBeenCalled();
  });

  it("prefers intern over yearless-bare inside the dry-run 25-window", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { aaa: {}, zzz: {} });
    const overflow = Array.from({ length: 40 }, (_, i) => bareSwe(String(i + 1)));
    const preferred = [
      intern("100"),
      makeJob({
        id: "101",
        title: "Junior Software Engineer",
        content: "",
        absoluteUrl: "https://job-boards.greenhouse.io/board/jobs/101",
      }),
    ];

    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        dryRun: true,
        config: configWith([company("aaa", "Aaa"), company("zzz", "Zzz")]),
        listJobs: async (c) => (c.id === "aaa" ? overflow : preferred),
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.dryRunPings).toHaveLength(25);
    expect(result.dryRunPings.filter((ping) => ping.companyId === "zzz")).toHaveLength(
      2,
    );
    expect(result.dryRunPings.map((ping) => ping.capBucket)).toEqual(
      expect.arrayContaining(["intern", "high-signal-new-grad"]),
    );
  });
```

Keep the existing intern-vs-newGrad webhook tests. They must still pass.

- [ ] **Step 2: Run pipeline tests to verify new cases fail**

Run: `npm test -- tests/pipeline.test.ts`

Expected: FAIL — `capBucket` / `track` are not on `DryRunPing` yet. Cap preference through `selectAttemptWindow` already landed in Task 2; do not re-open soft-cap or hydrate order to make the `zzz` assertion pass.

- [ ] **Step 3: Extend `DryRunPing` and `toPing`**

In `src/types.ts`:

```typescript
export type DryRunPing = {
  companyId: string;
  jobId: string;
  title: string;
  absoluteUrl: string;
  location: string;
  track?: "intern" | "new-grad";
  capBucket?: "intern" | "high-signal-new-grad" | "yearless-bare";
};
```

In `src/pipeline.ts`, import `allowEmptyContentAfterHydrate` and `capBucket` next to `jobTrack` and change `toPing`:

```typescript
import {
  allowEmptyContentAfterHydrate,
  capBucket,
  jobTrack,
  matchesJob,
  passesBaseGates,
} from "./matcher.js";
```

```typescript
    const toPing = (bound: BoundJob): DryRunPing => ({
      companyId: bound.companyId,
      jobId: bound.job.id,
      title: bound.job.title,
      absoluteUrl: bound.job.absoluteUrl,
      location: bound.job.location,
      track: jobTrack(bound.job) ?? "new-grad",
      capBucket: capBucket(bound.job),
    });
```

Inside `processCompany`, replace `matched = hydrated.filter((job) => matchesJob(job))` with:

```typescript
          matched = hydrated.filter((job) => {
            if (!matchesJob(job)) return false;
            if (job.content.trim().length > 0) return true;
            return allowEmptyContentAfterHydrate(job);
          });
```

Keep the non-hydrate branch as `matched = jobs.filter((job) => matchesJob(job))` (Greenhouse/Ashby already have list content). Do not change Workday/NVIDIA hydrate order. `passesBaseGates` from Task 1 is already the list-phase filter.

Append this pipeline test next to the existing hydrate-reject case (that case uses an intern title and must still pass):

```typescript
  it("does not Discord-ping yearless bare SWE when Workday hydrate leaves content empty", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { boeing: {} });
    const hydrateContent = vi.fn(async () => {
      throw new Error("detail 500");
    });
    setAdapterRegistryForTests({
      workday: {
        ats: "workday",
        listJobs: async () => [
          makeJob({
            id: "JR1",
            title: "Software Engineer",
            location: "Seattle, WA",
            content: "",
          }),
        ],
        hydrateContent,
      },
    });
    const postDiscord = vi.fn(async () => undefined);
    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        config: {
          vault: { careerPath: "Career/" },
          llm: { model: "gemini-2.5-flash" },
          companies: [
            {
              id: "boeing",
              name: "Boeing",
              ats: "workday",
              workday: {
                host: "boeing.wd1.myworkdayjobs.com",
                tenant: "boeing",
                site: "external",
              },
              enabled: true,
            },
          ],
        },
        postDiscord,
      }),
    );
    expect(hydrateContent).toHaveBeenCalled();
    expect(postDiscord).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
  });
```

- [ ] **Step 4: Print bucket counts from the CLI dry-run JSON**

In `src/cli.ts`, replace the dry-run `console.log` with:

```typescript
  if (dryRun) {
    const bucketCounts = {
      intern: 0,
      highSignalNewGrad: 0,
      yearlessBare: 0,
    };
    for (const ping of result.dryRunPings) {
      if (ping.capBucket === "intern") bucketCounts.intern += 1;
      else if (ping.capBucket === "high-signal-new-grad") {
        bucketCounts.highSignalNewGrad += 1;
      } else {
        bucketCounts.yearlessBare += 1;
      }
    }
    console.log(
      JSON.stringify(
        {
          attempt: result.dryRunPings,
          deferredSoftCapped: result.dryRunDeferred,
          bucketCounts,
        },
        null,
        2,
      ),
    );
  }
```

- [ ] **Step 5: Run pipeline + full unit tests**

Run: `npm test -- tests/pipeline.test.ts`

Expected: PASS

Run: `npm test`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/pipeline.ts src/cli.ts tests/pipeline.test.ts
git commit -m "feat: tag dry-run pings with track and cap buckets"
```

---

### Task 4: Fleet dry-run volume gate (matcher ship gate)

**Files:**
- Create: `docs/superpowers/notes/2026-09-16-matcher-dry-run.md`
- Do not edit `.github/workflows/watch.yml`

**Interfaces:**
- Consumes: dry-run JSON `bucketCounts` from Task 3

- [ ] **Step 1: Build**

Run: `npm run build`

Expected: PASS (no type errors)

- [ ] **Step 2: Run local fleet dry-run**

PowerShell:

```powershell
$env:DRY_RUN='true'; $env:VAULT_DIR='./vault'; npm start
```

bash:

```bash
DRY_RUN=true VAULT_DIR=./vault npm start
```

This must not post Discord or write `seen-jobs.json`. Copy `bucketCounts` and the attempt titles.

- [ ] **Step 3: Apply the spec gate**

Let `n` = number of attempt pings (≤ 25). Let `bare` = `bucketCounts.yearlessBare`.

- If `n === 0` or dry-run `exitCode !== 0`, **do not ship**. Silence is not a pass (first-run companies and fetch/hydrate storms can empty the window). Stop and report why the sample is empty.
- If `n > 0` and `bare > n / 2`, **do not ship**. Stop and report the counts. Cap preference is already on; if the **selected** window is still majority yearless-bare, matcher widen is too loud for this fleet and needs a product decision (not a silent tweak).
- If `n > 0` and `bare <= n / 2`, gate passes.

Also record intern / high-signal / yearless-bare counts for the attempt window.

- [ ] **Step 4: Write the note only if the gate passes**

```markdown
# Matcher-widen dry-run volume gate (YYYY-MM-DD)

Fleet dry-run with `DRY_RUN=true` after Tasks 1–3.

## Attempt window (capped)

| Bucket | Count |
| --- | ---: |
| intern | N |
| high-signal new-grad | N |
| yearless-bare | N |
| total attempt | N |
| deferred | N |

## Gate decision

**Pass.** Selected attempt window is not majority yearless-bare.

## Notes

- Runtime
- Any fetch errors worth knowing
```

Fill real numbers. Do not invent them.

- [ ] **Step 5: Confirm watch.yml still has no Simplify fetch**

Run: `git grep -n "Simplify\|linkedin\|jobright" -- .github/workflows/watch.yml`

Expected: no matches

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/notes/2026-09-16-matcher-dry-run.md
git commit -m "docs: record matcher-widen dry-run volume gate"
```

If the gate fails, do **not** commit a pass note. Matcher must not merge. Tasks 5–6 may still proceed (they only need Task 1 matcher APIs).

**Task 4 result (2026-09-16):** FAIL. Fleet dry-run `n=25`, intern=0, high-signal=1, yearless-bare=24 (`24 > 12.5`). No silent matcher tweak. Matcher slice stays merge-blocked pending a product decision on Discord volume. Coverage slice (Tasks 5–6) remains on this branch because it only needs Task 1 APIs.

---

### Task 5: Coverage classify / join / render (offline)

**Files:**
- Create: `src/simplify-coverage.ts`
- Create: `tests/simplify-coverage.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `matchesJob`, `jobTrack`, `hasRolePhrase`, `getAdapter`
- Produces:
  - `normalizeCompanyName(name: string): string`
  - `slugFromNormalizedName(normalized: string): string`
  - `adapterCanFetch(ats: string): boolean`
  - `runSimplifyCoverage(opts: SimplifyCoverageOptions): Promise<SimplifyCoverageResult>`
  - `DEFAULT_LISTING_URLS` (allowlisted raw.githubusercontent.com URLs only)

```typescript
export type SimplifyCoverageOptions = {
  fetch: typeof fetch;
  githubToken?: string;
  companiesYamlPath: string;
  reportPath: string;
  suggestedPath: string;
};

export type SimplifyCoverageResult = {
  exitCode: number;
  skippedInvalid: number;
};
```

- [ ] **Step 1: Write fixture tests (no live GitHub)**

Create `tests/simplify-coverage.test.ts`:

```typescript
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import {
  adapterCanFetch,
  DEFAULT_LISTING_URLS,
  normalizeCompanyName,
  runSimplifyCoverage,
  slugFromNormalizedName,
} from "../src/simplify-coverage.js";

const companiesYaml = `vault:
  careerPath: Career/
llm:
  model: gemini-2.5-flash
companies:
  - id: vercel
    name: Vercel
    ats: greenhouse
    boardToken: vercel
    enabled: true
  - id: stripe
    name: Stripe
    ats: greenhouse
    boardToken: stripe
    enabled: false
  - id: amazon
    name: Amazon
    ats: amazon
    enabled: false
  - id: google
    name: Google
    ats: custom
    enabled: false
  - id: acme
    name: Acme
    ats: greenhouse
    boardToken: acme
    enabled: true
  - id: acme-holdings
    name: The Acme Inc.
    ats: greenhouse
    boardToken: acme-holdings
    enabled: false
`;

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    company_name: "Vercel",
    title: "Software Engineer",
    url: "https://boards.greenhouse.io/vercel/jobs/1",
    locations: ["San Francisco, CA"],
    category: "Software Engineering",
    active: true,
    is_visible: true,
    terms: [],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeCompanyName", () => {
  it("strips the / inc / punctuation", () => {
    expect(normalizeCompanyName("The Stripe, Inc.")).toBe("stripe");
    expect(normalizeCompanyName("Acme LLC")).toBe("acme");
  });
});

describe("adapterCanFetch", () => {
  it("is true for greenhouse/amazon and false for custom/google stubs", () => {
    expect(adapterCanFetch("greenhouse")).toBe(true);
    expect(adapterCanFetch("amazon")).toBe(true);
    expect(adapterCanFetch("custom")).toBe(false);
    expect(adapterCanFetch("google")).toBe(false);
  });
});

describe("runSimplifyCoverage", () => {
  function setup() {
    const dir = mkdtempSync(join(tmpdir(), "pinger-cov-"));
    const companiesYamlPath = join(dir, "companies.yaml");
    writeFileSync(companiesYamlPath, companiesYaml);
    return {
      dir,
      companiesYamlPath,
      reportPath: join(dir, "simplify-coverage-report.md"),
      suggestedPath: join(dir, "companies.suggested.yaml"),
    };
  }

  it("classifies would-ping, matcher-drop, disabled enable, missing add, custom-no-adapter, ambiguous, skipped-invalid", async () => {
    const paths = setup();
    const newGrad = [
      listing({
        id: "keep",
        company_name: "Vercel",
        title: "Software Engineer",
      }),
      listing({
        id: "drop",
        company_name: "Vercel",
        title: "Senior Software Engineer",
      }),
      listing({
        id: "disabled-senior",
        company_name: "Stripe",
        title: "Staff Software Engineer",
      }),
      listing({
        id: "amazon",
        company_name: "Amazon",
        title: "SDE I",
      }),
      listing({
        id: "google",
        company_name: "Google",
        title: "Software Engineer",
      }),
      listing({
        id: "missing",
        company_name: "Unknown Co",
        title: "Software Engineer",
      }),
      listing({
        id: "amb",
        company_name: "Acme",
        title: "Software Engineer",
      }),
      listing({
        id: "bad",
        company_name: "",
        title: "Software Engineer",
        url: "https://example.com",
      }),
    ];
    const intern = [
      listing({
        id: "intern-1",
        company_name: "Vercel",
        title: "Software Engineer Intern",
        category: "Software",
        terms: ["Summer 2027"],
        url: "https://boards.greenhouse.io/vercel/jobs/intern-1",
      }),
    ];

    const result = await runSimplifyCoverage({
      fetch: async (url) => {
        const href = String(url);
        if (href === DEFAULT_LISTING_URLS.newGrad) return jsonResponse(newGrad);
        if (href === DEFAULT_LISTING_URLS.intern) return jsonResponse(intern);
        throw new Error(`unexpected url ${href}`);
      },
      companiesYamlPath: paths.companiesYamlPath,
      reportPath: paths.reportPath,
      suggestedPath: paths.suggestedPath,
    });

    expect(result.exitCode).toBe(0);
    expect(result.skippedInvalid).toBe(1);
    const report = readFileSync(paths.reportPath, "utf8");
    expect(report).toContain("would-ping");
    expect(report).toContain("matcher-drop");
    expect(report).toContain("Departments are assumed Engineering");
    expect(report).toMatch(/Senior Software Engineer[\s\S]*matcher-drop/);
    expect(report).toMatch(/Unknown Co[\s\S]*missing/);
    expect(report).toMatch(/Google[\s\S]*custom-no-adapter/);
    expect(report).toMatch(/Acme[\s\S]*ambiguous/);

    const suggested = parse(readFileSync(paths.suggestedPath, "utf8")) as {
      enable: string[];
      add: Array<{ id: string; name: string; ats: string; enabled: boolean }>;
    };
    expect(suggested.enable).toEqual(expect.arrayContaining(["stripe", "amazon"]));
    expect(suggested.enable).not.toContain("google");
    expect(suggested.enable).not.toContain("acme");
    expect(suggested.add).toEqual([
      {
        id: slugFromNormalizedName(normalizeCompanyName("Unknown Co")),
        name: "Unknown Co",
        ats: "custom",
        enabled: false,
      },
    ]);
  });

  it("writes no output files when a fetch fails", async () => {
    const paths = setup();
    const result = await runSimplifyCoverage({
      fetch: async (url) => {
        const href = String(url);
        if (href === DEFAULT_LISTING_URLS.newGrad) {
          return jsonResponse([listing()]);
        }
        return new Response("nope", { status: 500 });
      },
      companiesYamlPath: paths.companiesYamlPath,
      reportPath: paths.reportPath,
      suggestedPath: paths.suggestedPath,
    });
    expect(result.exitCode).toBe(2);
    expect(existsSync(paths.reportPath)).toBe(false);
    expect(existsSync(paths.suggestedPath)).toBe(false);
  });

  it("retries 429 once with GITHUB_TOKEN and then succeeds", async () => {
    const paths = setup();
    const seenAuth: string[] = [];
    const result = await runSimplifyCoverage({
      fetch: async (url, init) => {
        const href = String(url);
        const auth = new Headers(init?.headers).get("authorization");
        seenAuth.push(`${href} ${auth ?? "none"}`);
        if (!auth) {
          return new Response("rate", { status: 429 });
        }
        if (href === DEFAULT_LISTING_URLS.newGrad) {
          return jsonResponse([listing()]);
        }
        return jsonResponse([]);
      },
      githubToken: "ghs_test_token",
      companiesYamlPath: paths.companiesYamlPath,
      reportPath: paths.reportPath,
      suggestedPath: paths.suggestedPath,
    });
    expect(result.exitCode).toBe(0);
    expect(seenAuth.some((row) => row.endsWith("none"))).toBe(true);
    expect(
      seenAuth.some((row) => row.includes("Bearer ghs_test_token")),
    ).toBe(true);
    expect(existsSync(paths.reportPath)).toBe(true);
  });

  it("fail-closes immediately on 403 when GITHUB_TOKEN is unset", async () => {
    const paths = setup();
    const result = await runSimplifyCoverage({
      fetch: async () => new Response("nope", { status: 403 }),
      companiesYamlPath: paths.companiesYamlPath,
      reportPath: paths.reportPath,
      suggestedPath: paths.suggestedPath,
    });
    expect(result.exitCode).toBe(2);
    expect(existsSync(paths.reportPath)).toBe(false);
  });
});
```

`Acme` and `The Acme Inc.` both normalize to `acme`, so the listing `company_name: "Acme"` is `ambiguous`. Do not strip extra words like `holdings`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/simplify-coverage.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/simplify-coverage.ts`**

```typescript
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { stringify } from "yaml";
import { getAdapter } from "./adapters/index.js";
import type { AtsKind } from "./adapters/types.js";
import { loadConfig } from "./config.js";
import { REQUEST_TIMEOUT_MS } from "./constants.js";
import { hasRolePhrase, jobTrack, matchesJob } from "./matcher.js";
import {
  isStubPortalAtsKind,
  type CompanyConfig,
  type Job,
} from "./types.js";

export const DEFAULT_LISTING_URLS = {
  newGrad:
    "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
  intern:
    "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
} as const;

const NEVER_ENABLE_IDS = new Set(["google", "meta", "microsoft", "apple"]);
const FETCHABLE_ATS = new Set([
  "greenhouse",
  "ashby",
  "workday",
  "amazon",
  "nvidia",
  "openai",
]);

export type CoverageClass =
  | "would-ping"
  | "matcher-drop"
  | "disabled"
  | "custom-no-adapter"
  | "missing"
  | "ambiguous";

export type SimplifyCoverageOptions = {
  fetch: typeof fetch;
  githubToken?: string;
  companiesYamlPath: string;
  reportPath: string;
  suggestedPath: string;
};

export type SimplifyCoverageResult = {
  exitCode: number;
  skippedInvalid: number;
};

type Listing = {
  id?: unknown;
  company_name?: unknown;
  title?: unknown;
  url?: unknown;
  locations?: unknown;
  category?: unknown;
  active?: unknown;
  is_visible?: unknown;
  terms?: unknown;
};

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\b(?:inc|llc|ltd|corp|corporation)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugFromNormalizedName(normalized: string): string {
  const slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "company";
}

export function adapterCanFetch(ats: string): boolean {
  if (!FETCHABLE_ATS.has(ats) || isStubPortalAtsKind(ats)) {
    return false;
  }
  return getAdapter(ats as AtsKind) != null;
}

function isSweEquivalent(listing: Listing): boolean {
  const category = String(listing.category ?? "").toLowerCase();
  if (category === "software engineering" || category === "software") {
    return true;
  }
  return hasRolePhrase(String(listing.title ?? ""));
}

function syntheticJob(listing: Listing): Job {
  const terms = Array.isArray(listing.terms)
    ? listing.terms.map(String).join(" ")
    : "";
  const locations = Array.isArray(listing.locations)
    ? listing.locations.map(String).join("; ")
    : "";
  return {
    id: String(listing.id ?? listing.url ?? ""),
    title: String(listing.title ?? ""),
    location: locations,
    careerSiteCategory: null,
    departments: ["Engineering"],
    absoluteUrl: String(listing.url ?? ""),
    content: terms,
  };
}

type JoinHit =
  | { kind: "missing" }
  | { kind: "ambiguous" }
  | { kind: "hit"; row: CompanyConfig };

function buildJoinIndex(
  companies: CompanyConfig[],
): Map<string, CompanyConfig[]> {
  const index = new Map<string, CompanyConfig[]>();
  for (const row of companies) {
    const key = normalizeCompanyName(row.name);
    const list = index.get(key) ?? [];
    list.push(row);
    index.set(key, list);
  }
  return index;
}

function joinListing(
  listing: Listing,
  index: Map<string, CompanyConfig[]>,
): JoinHit {
  const key = normalizeCompanyName(String(listing.company_name ?? ""));
  const rows = index.get(key) ?? [];
  if (rows.length === 0) return { kind: "missing" };
  if (rows.length !== 1) return { kind: "ambiguous" };
  return { kind: "hit", row: rows[0] };
}

function classify(join: JoinHit, job: Job): CoverageClass {
  if (join.kind === "ambiguous") return "ambiguous";
  if (join.kind === "missing") return "missing";
  const row = join.row;
  if (NEVER_ENABLE_IDS.has(row.id) || !adapterCanFetch(row.ats)) {
    return "custom-no-adapter";
  }
  if (!row.enabled) return "disabled";
  return matchesJob(job) ? "would-ping" : "matcher-drop";
}

async function fetchListingsJson(
  url: string,
  fetchImpl: typeof fetch,
  githubToken: string | undefined,
): Promise<unknown> {
  if (
    url !== DEFAULT_LISTING_URLS.newGrad &&
    url !== DEFAULT_LISTING_URLS.intern
  ) {
    throw new Error("listings url is not allowlisted");
  }
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const first = await fetchImpl(url, { signal });
  let res = first;
  if (
    (first.status === 429 || first.status === 403) &&
    githubToken
  ) {
    res = await fetchImpl(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${githubToken}` },
    });
  }
  if (!res.ok) {
    throw new Error(`listings fetch ${res.status}`);
  }
  return res.json();
}

function renderReport(rows: Array<{
  source: string;
  company: string;
  title: string;
  url: string;
  className: CoverageClass;
  track: string;
}>): string {
  const counts = new Map<string, { newGrad: number; intern: number }>();
  for (const row of rows) {
    const current = counts.get(row.className) ?? { newGrad: 0, intern: 0 };
    if (row.source === "new-grad") current.newGrad += 1;
    else current.intern += 1;
    counts.set(row.className, current);
  }
  const lines = [
    "# Simplify coverage",
    "",
    "Departments are assumed Engineering and bodies are not fetched — checklist matcher-pass is not a promise the live board would ping.",
    "",
    "| class | new-grad | intern | total |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const className of [
    "would-ping",
    "matcher-drop",
    "disabled",
    "custom-no-adapter",
    "missing",
    "ambiguous",
  ] as const) {
    const c = counts.get(className) ?? { newGrad: 0, intern: 0 };
    lines.push(
      `| ${className} | ${c.newGrad} | ${c.intern} | ${c.newGrad + c.intern} |`,
    );
  }
  lines.push(
    "",
    "| source | company | title | url | class | jobTrack |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const row of rows) {
    lines.push(
      `| ${row.source} | ${row.company} | ${row.title.replace(/\|/g, "/")} | ${row.url} | ${row.className} | ${row.track} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export async function runSimplifyCoverage(
  opts: SimplifyCoverageOptions,
): Promise<SimplifyCoverageResult> {
  const urls = DEFAULT_LISTING_URLS;
  try {
    const [newGradRaw, internRaw] = await Promise.all([
      fetchListingsJson(urls.newGrad, opts.fetch, opts.githubToken),
      fetchListingsJson(urls.intern, opts.fetch, opts.githubToken),
    ]);
    if (!Array.isArray(newGradRaw) || !Array.isArray(internRaw)) {
      return { exitCode: 2, skippedInvalid: 0 };
    }

    const config = loadConfig(opts.companiesYamlPath);
    const index = buildJoinIndex(config.companies);
    let skippedInvalid = 0;
    const reportRows: Array<{
      source: string;
      company: string;
      title: string;
      url: string;
      className: CoverageClass;
      track: string;
    }> = [];
    const enableIds = new Set<string>();
    const addById = new Map<
      string,
      { id: string; name: string; ats: "custom"; enabled: false }
    >();

    const ingest = (source: "new-grad" | "intern", listings: unknown[]) => {
      for (const raw of listings) {
        const listing = (raw ?? {}) as Listing;
        if (
          typeof listing.company_name !== "string" ||
          listing.company_name.trim() === "" ||
          typeof listing.title !== "string" ||
          listing.title.trim() === "" ||
          typeof listing.url !== "string" ||
          listing.url.trim() === ""
        ) {
          skippedInvalid += 1;
          continue;
        }
        if (listing.active !== true || listing.is_visible !== true) continue;
        if (!isSweEquivalent(listing)) continue;
        const job = syntheticJob(listing);
        const joined = joinListing(listing, index);
        const className = classify(joined, job);
        const track =
          className === "would-ping" || className === "matcher-drop"
            ? (jobTrack(job) ?? "n/a")
            : "n/a";
        reportRows.push({
          source,
          company: listing.company_name,
          title: listing.title,
          url: listing.url,
          className,
          track,
        });
        if (className === "disabled" && joined.kind === "hit") {
          enableIds.add(joined.row.id);
        }
        if (className === "missing") {
          const id = slugFromNormalizedName(
            normalizeCompanyName(listing.company_name),
          );
          if (!addById.has(id)) {
            addById.set(id, {
              id,
              name: listing.company_name,
              ats: "custom",
              enabled: false,
            });
          }
        }
      }
    };

    ingest("new-grad", newGradRaw);
    ingest("intern", internRaw);

    mkdirSync(dirname(opts.reportPath), { recursive: true });
    writeFileSync(opts.reportPath, renderReport(reportRows));
    writeFileSync(
      opts.suggestedPath,
      stringify({
        enable: [...enableIds].sort(),
        add: [...addById.values()].sort((a, b) => a.id.localeCompare(b.id)),
      }),
    );
    return { exitCode: 0, skippedInvalid };
  } catch {
    return { exitCode: 2, skippedInvalid: 0 };
  }
}
```

Rules this must keep:

- Only fetch the two allowlisted URLs. Never fetch `listing.url`.
- Attach `GITHUB_TOKEN` only on the 429/403 retry of those two GETs. Never log it. Never write it to report/yaml.
- On any fetch/parse failure, return exit 2 and **do not** write output files.
- `enable:` includes Stripe even when the listing is `Staff Software Engineer` (not gated on `matchesJob`).
- `jobTrack` in the report may be `n/a` for missing/ambiguous/custom-no-adapter.

- [ ] **Step 4: Run coverage tests**

Run: `npm test -- tests/simplify-coverage.test.ts`

Expected: PASS

If `Acme` / `The Acme Inc.` do not collide, stop and fix `normalizeCompanyName` — both must become `acme`. Do not strip extra tokens like `holdings`.

- [ ] **Step 5: Commit**

```bash
git add src/simplify-coverage.ts tests/simplify-coverage.test.ts
git commit -m "feat: classify Simplify listings against companies.yaml offline"
```

---

### Task 6: Coverage CLI, gitignore, README

**Files:**
- Create: `src/simplify-coverage-cli.ts`
- Create: `scripts/simplify-coverage.mjs`
- Modify: `.gitignore`
- Modify: `README.md` (short command only)

**Interfaces:**
- Consumes: `runSimplifyCoverage` from Task 5
- Produces: `node scripts/simplify-coverage.mjs` writes `data/simplify-coverage-report.md` and `data/companies.suggested.yaml` after a successful fetch

- [ ] **Step 1: Add CLI entry**

`src/simplify-coverage-cli.ts`:

```typescript
import { join } from "node:path";
import { runSimplifyCoverage } from "./simplify-coverage.js";

const root = process.cwd();
const result = await runSimplifyCoverage({
  fetch,
  githubToken: process.env.GITHUB_TOKEN,
  companiesYamlPath: join(root, "companies.yaml"),
  reportPath: join(root, "data", "simplify-coverage-report.md"),
  suggestedPath: join(root, "data", "companies.suggested.yaml"),
});
if (result.skippedInvalid > 0) {
  console.error(`skipped-invalid: ${result.skippedInvalid}`);
}
process.exit(result.exitCode);
```

`scripts/simplify-coverage.mjs`:

```javascript
#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const compiled = join(root, "dist", "simplify-coverage-cli.js");
if (!existsSync(compiled)) {
  const built = spawnSync("npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if ((built.status ?? 1) !== 0) {
    process.exit(built.status ?? 1);
  }
}
const result = spawnSync(process.execPath, [compiled, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
```

- [ ] **Step 2: Gitignore outputs**

Append to `.gitignore`:

```
data/simplify-coverage-report.md
data/companies.suggested.yaml
```

- [ ] **Step 3: README command**

Append this subsection to `README.md` (not a new architecture section):

## Simplify coverage checklist

Manual. Not part of `watch.yml`. Does not ping Discord or edit `companies.yaml`.

    node scripts/simplify-coverage.mjs

Writes gitignored `data/simplify-coverage-report.md` and `data/companies.suggested.yaml`. Copy `enable:` ids into `companies.yaml` in waves.

- [ ] **Step 4: Regression**

Run: `npm test`

Expected: PASS

Run: `npm run build`

Expected: PASS

Run: `git grep -n "Simplify\|listings.json" -- .github/workflows/watch.yml`

Expected: no matches

- [ ] **Step 5: Commit**

```bash
git add src/simplify-coverage-cli.ts scripts/simplify-coverage.mjs .gitignore README.md
git commit -m "feat: add manual Simplify coverage CLI"
```

Do not run the live script in CI. A local `node scripts/simplify-coverage.mjs` is optional after tests pass; if GitHub 429s without a token, that is fail-closed and not a product bug.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Bare SWE / associate / junior / `Software Engineer 1` / `SDE I` keep (new-grad) | Task 1 |
| Title deny senior/sr/staff/II/`SDE 2`/`Python 3` keep | Task 1 |
| Intern class from title only; body “internship experience preferred” stays new-grad | Task 1 |
| Intern title wins `jobTrack`; intern 2027 season unchanged | Task 1 |
| Role-less `Engineer 1` drop; whole-token `sde` not `sdet` | Task 1 |
| List-phase `passesBaseGates` without early-career phrase (Workday/NVIDIA hydrate survivors) | Task 1 (pipeline hydrate already uses `passesBaseGates`) |
| Soft cap prefers intern + high-signal, then yearless-bare | Task 2–3 |
| Dual webhooks; mixed batch fail-closed | Task 3 |
| Dry-run bucket counts + volume gate | Task 3–4 |
| Checklist join exactly-one name; ambiguous vs missing | Task 5 |
| `enable:` not gated on `matchesJob`; never google/meta/microsoft/apple | Task 5 |
| raw.githubusercontent.com allowlist; 429/403 retry with token once | Task 5 |
| Fail closed writes no files; gitignore outputs; no watch.yml Simplify | Task 5–6 |
| LinkedIn / Jobright / auto-merge / scheduled Action / year-extractor rewrite | Deferred — do not implement |

No TBD placeholders. Matcher merge waits on Task 4. Tasks 5–6 may ship as a follow-up even if Task 4 fails.
