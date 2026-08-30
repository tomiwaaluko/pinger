import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetAdapterRegistryForTests,
  setAdapterRegistryForTests,
} from "../src/adapters/index.js";
import {
  EMPTY_VAULT_FIT_NOTE,
  FALLBACK_FIT_NOTE,
} from "../src/constants.js";
import { runWatcher } from "../src/pipeline.js";
import { readSeen, writeSeen } from "../src/seen-store.js";
import type {
  AppConfig,
  CompanyConfig,
  DiscordEmbed,
  Job,
  RunWatcherOptions,
  SeenStore,
} from "../src/types.js";
import { makeJob } from "./helpers.js";

const now = "2026-08-16T12:00:00.000Z";

const company = (
  id: string,
  name = id.toUpperCase(),
  enabled = true,
): CompanyConfig => ({
  id,
  name,
  ats: "greenhouse",
  boardToken: id,
  enabled,
});

const intern = (id: string, overrides: Partial<Job> = {}): Job =>
  makeJob({
    id,
    title: `Software Engineer Intern ${id}`,
    absoluteUrl: `https://job-boards.greenhouse.io/${overrides.absoluteUrl ?? "board"}/jobs/${id}`,
    ...overrides,
  });

const senior = makeJob({
  id: "senior",
  title: "Staff Software Engineer",
  absoluteUrl: "https://job-boards.greenhouse.io/vercel/jobs/senior",
});

const configWith = (companies: CompanyConfig[]): AppConfig => ({
  vault: { careerPath: "Career/" },
  llm: { model: "gemini-2.5-flash" },
  companies,
});

function vaultDirWithCareer(): string {
  const root = mkdtempSync(join(tmpdir(), "pinger-pipe-"));
  mkdirSync(join(root, "Career"));
  writeFileSync(join(root, "Career", "resume.md"), "Next.js internships");
  return root;
}

function stubListJobs(fn: (company: CompanyConfig) => Promise<Job[]>): void {
  const listJobs = async (company: CompanyConfig) => fn(company);
  setAdapterRegistryForTests({
    greenhouse: { ats: "greenhouse", listJobs },
    ashby: { ats: "ashby", listJobs },
    workday: { ats: "workday", listJobs },
  });
}

function baseOpts(
  overrides: Partial<RunWatcherOptions> &
    Pick<RunWatcherOptions, "vaultDir"> & {
      listJobs?: (company: CompanyConfig) => Promise<Job[]>;
    },
): RunWatcherOptions {
  const { listJobs, ...rest } = overrides;
  if (listJobs) {
    stubListJobs(listJobs);
  }
  return {
    config: configWith([company("vercel", "Vercel")]),
    seenPath: join(overrides.vaultDir, "seen-jobs.json"),
    dryRun: false,
    env: {
      DISCORD_WEBHOOK_URL: "https://discord.test/webhook",
      GEMINI_API_KEY: "gemini-key",
    },
    now: () => new Date(now),
    fetch,
    readVaultMarkdown: async () => ({
      empty: false,
      text: "## resume.md\nNext.js internships",
    }),
    generateFitNote: async () => "Fits intern Next.js work.",
    postDiscord: async () => undefined,
    readSeen,
    writeSeen,
    ...rest,
  };
}

afterEach(() => {
  resetAdapterRegistryForTests();
});

function field(embed: DiscordEmbed, name: string): string | undefined {
  return embed.fields.find((item) => item.name === name)?.value;
}

describe("runWatcher fleet pipeline", () => {
  it("fails unsafe vault path before fetching or writing seen", async () => {
    const dir = vaultDirWithCareer();
    const write = vi.fn(writeSeen);
    const listJobs = vi.fn(async (): Promise<Job[]> => [intern("1")]);

    await expect(
      runWatcher(
        baseOpts({
          vaultDir: dir,
          listJobs,
          config: {
            ...configWith([company("vercel", "Vercel")]),
            vault: { careerPath: "../" },
          },
          writeSeen: write,
        }),
      ),
    ).rejects.toThrow(/escapes VAULT_DIR/);

    expect(listJobs).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(await readSeen(join(dir, "seen-jobs.json"))).toEqual({});
  });

  it("exits zero without fetching or writing when no companies are enabled", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { disabledco: { old: { title: "Old", firstSeenAt: now } } });
    const listJobs = vi.fn(async (): Promise<Job[]> => [intern("1")]);
    const write = vi.fn(writeSeen);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        config: configWith([company("disabledco", "Disabled Co", false)]),
        listJobs,
        writeSeen: write,
      }),
    );

    expect(result).toEqual({ exitCode: 0, dryRunPings: [], dryRunDeferred: [] });
    expect(listJobs).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({
      disabledco: { old: { title: "Old", firstSeenAt: now } },
    });
    consoleError.mockRestore();
  });

  it("does not fetch disabled companies", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { enabledco: {} });
    const listJobs = vi.fn(async (c: CompanyConfig) =>
      c.id === "enabledco" ? [intern("1")] : [intern("2")],
    );

    await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        config: configWith([
          company("enabledco", "Enabled Co"),
          company("disabledco", "Disabled Co", false),
        ]),
        listJobs,
      }),
    );

    expect(listJobs).toHaveBeenCalledTimes(1);
    expect(listJobs).toHaveBeenCalledWith(company("enabledco", "Enabled Co"));
  });

  it("snapshots first-run companies and pings existing companies in one merged write", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { beta: {} });
    const writes: SeenStore[] = [];
    const posted: DiscordEmbed[] = [];

    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        config: configWith([company("alpha", "Alpha Inc"), company("beta", "Beta LLC")]),
        listJobs: async (c) => (c.id === "alpha" ? [intern("10")] : [intern("20")]),
        postDiscord: async (_url, embed) => {
          posted.push(embed);
        },
        writeSeen: async (path, store) => {
          writes.push(structuredClone(store));
          await writeSeen(path, store);
        },
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(writes).toHaveLength(1);
    expect(await readSeen(seenPath)).toEqual({
      alpha: { "10": { title: "Software Engineer Intern 10", firstSeenAt: now } },
      beta: { "20": { title: "Software Engineer Intern 20", firstSeenAt: now } },
    });
    expect(field(posted[0], "Company")).toBe("Beta LLC");
  });

  it("continues processing other companies when one fetch rejects", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { bad: {}, good: {} });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        config: configWith([company("bad", "Bad Co"), company("good", "Good Co")]),
        listJobs: async (c) => {
          if (c.id === "bad") throw new Error("Greenhouse down");
          return [intern("20")];
        },
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(await readSeen(seenPath)).toEqual({
      bad: {},
      good: { "20": { title: "Software Engineer Intern 20", firstSeenAt: now } },
    });
    consoleError.mockRestore();
  });

  it("exits 2 and writes nothing when all enabled fetches fail", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { a: {}, disabledco: { old: { title: "Old", firstSeenAt: now } } });
    const write = vi.fn(writeSeen);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        config: configWith([
          company("a", "A"),
          company("b", "B"),
          company("disabledco", "Disabled", false),
        ]),
        listJobs: async () => {
          throw new Error("Greenhouse down");
        },
        writeSeen: write,
      }),
    );

    expect(result.exitCode).toBe(2);
    expect(write).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({
      a: {},
      disabledco: { old: { title: "Old", firstSeenAt: now } },
    });
    consoleError.mockRestore();
  });

  it("persists first-run snapshots but not Discord-bound hits when vault is unreadable", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { beta: {} });
    const postDiscord = vi.fn(async () => undefined);
    const generateFitNote = vi.fn(async () => "nope");

    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        config: configWith([company("alpha", "Alpha"), company("beta", "Beta")]),
        listJobs: async (c) => (c.id === "alpha" ? [intern("10")] : [intern("20")]),
        readVaultMarkdown: async () => {
          throw new Error("ENOENT");
        },
        postDiscord,
        generateFitNote,
      }),
    );

    expect(result.exitCode).toBe(2);
    expect(postDiscord).not.toHaveBeenCalled();
    expect(generateFitNote).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({
      alpha: { "10": { title: "Software Engineer Intern 10", firstSeenAt: now } },
      beta: {},
    });
  });

  it("persists first-run snapshots but not Discord-bound hits when webhook is missing", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { beta: {} });
    const readVaultMarkdown = vi.fn(async () => ({ empty: false, text: "nope" }));
    const postDiscord = vi.fn(async () => undefined);
    const generateFitNote = vi.fn(async () => "nope");

    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        env: { GEMINI_API_KEY: "gemini-key" },
        config: configWith([company("alpha", "Alpha"), company("beta", "Beta")]),
        listJobs: async (c) => (c.id === "alpha" ? [intern("10")] : [intern("20")]),
        readVaultMarkdown,
        postDiscord,
        generateFitNote,
      }),
    );

    expect(result.exitCode).toBe(2);
    expect(readVaultMarkdown).not.toHaveBeenCalled();
    expect(postDiscord).not.toHaveBeenCalled();
    expect(generateFitNote).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({
      alpha: { "10": { title: "Software Engineer Intern 10", firstSeenAt: now } },
      beta: {},
    });
  });

  it("records successful Discord posts, skips failed posts, and persists first-run snapshots", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { beta: {} });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        config: configWith([company("alpha", "Alpha"), company("beta", "Beta")]),
        listJobs: async (c) =>
          c.id === "alpha" ? [intern("10")] : [intern("20"), intern("30")],
        postDiscord: async (_url, embed) => {
          if (embed.url.endsWith("/jobs/30")) throw new Error("Discord HTTP 400");
        },
      }),
    );

    expect(result.exitCode).toBe(2);
    expect(await readSeen(seenPath)).toEqual({
      alpha: { "10": { title: "Software Engineer Intern 10", firstSeenAt: now } },
      beta: { "20": { title: "Software Engineer Intern 20", firstSeenAt: now } },
    });
    consoleError.mockRestore();
  });

  it("applies the soft cap before LLM and leaves deferred jobs unrecorded", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { aaa: {}, zzz: {} });
    const aaaJobs = Array.from({ length: 40 }, (_, i) => intern(String(i + 1)));
    const zzzJobs = [intern("100"), intern("101")];
    const generateFitNote = vi.fn(async () => "fit");
    const posted: DiscordEmbed[] = [];

    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        config: configWith([company("aaa", "Aaa"), company("zzz", "Zzz")]),
        listJobs: async (c) => (c.id === "aaa" ? aaaJobs : zzzJobs),
        generateFitNote,
        postDiscord: async (_url, embed) => {
          posted.push(embed);
        },
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(generateFitNote.mock.calls.length).toBeLessThanOrEqual(25);
    expect(posted).toHaveLength(25);
    expect(posted.filter((embed) => field(embed, "Company") === "Zzz")).toHaveLength(2);
    const seen = await readSeen(seenPath);
    expect(Object.keys(seen.aaa)).toHaveLength(23);
    expect(Object.keys(seen.zzz)).toEqual(["100", "101"]);
  });

  it("dry run returns attempt and deferred windows without writes, Discord, or LLM", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { aaa: {}, zzz: {} });
    const write = vi.fn(writeSeen);
    const postDiscord = vi.fn(async () => undefined);
    const generateFitNote = vi.fn(async () => "fit");
    const readVaultMarkdown = vi.fn(async () => ({ empty: false, text: "nope" }));
    const aaaJobs = Array.from({ length: 40 }, (_, i) => intern(String(i + 1)));
    const zzzJobs = [intern("100"), intern("101")];

    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        dryRun: true,
        config: configWith([company("aaa", "Aaa"), company("zzz", "Zzz")]),
        listJobs: async (c) => (c.id === "aaa" ? aaaJobs : zzzJobs),
        writeSeen: write,
        postDiscord,
        generateFitNote,
        readVaultMarkdown,
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.dryRunPings).toHaveLength(25);
    expect(result.dryRunPings.filter((ping) => ping.companyId === "zzz")).toHaveLength(2);
    expect(result.dryRunDeferred).toHaveLength(17);
    expect(write).not.toHaveBeenCalled();
    expect(postDiscord).not.toHaveBeenCalled();
    expect(generateFitNote).not.toHaveBeenCalled();
    expect(readVaultMarkdown).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({ aaa: {}, zzz: {} });
  });

  it("merge write keeps unseen disabled company keys", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, {
      enabledco: {},
      disabledco: { old: { title: "Old", firstSeenAt: now } },
    });

    await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        config: configWith([
          company("enabledco", "Enabled"),
          company("disabledco", "Disabled", false),
        ]),
        listJobs: async () => [intern("20")],
      }),
    );

    expect(await readSeen(seenPath)).toEqual({
      enabledco: { "20": { title: "Software Engineer Intern 20", firstSeenAt: now } },
      disabledco: { old: { title: "Old", firstSeenAt: now } },
    });
  });

  it("retains v1 regressions for fallbacks, existing empty keys, quiet days, and finally flush", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { vercel: {} });
    const posted: DiscordEmbed[] = [];
    const generateFitNote = vi.fn(async () => {
      throw new Error("Gemini down");
    });

    await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        env: { DISCORD_WEBHOOK_URL: "https://discord.test/webhook" },
        listJobs: async () => [intern("20")],
        generateFitNote,
        postDiscord: async (_url, embed) => {
          posted.push(embed);
        },
      }),
    );
    expect(generateFitNote).not.toHaveBeenCalled();
    expect(field(posted[0], "Fit")).toBe(FALLBACK_FIT_NOTE);

    posted.length = 0;
    await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        listJobs: async () => [intern("30")],
        generateFitNote,
        postDiscord: async (_url, embed) => {
          posted.push(embed);
        },
      }),
    );
    expect(field(posted[0], "Fit")).toBe(FALLBACK_FIT_NOTE);

    posted.length = 0;
    await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        listJobs: async () => [intern("40")],
        readVaultMarkdown: async () => ({ empty: true, text: "" }),
        postDiscord: async (_url, embed) => {
          posted.push(embed);
        },
      }),
    );
    expect(field(posted[0], "Fit")).toBe(EMPTY_VAULT_FIT_NOTE);

    const write = vi.fn(writeSeen);
    const readVaultMarkdown = vi.fn(async () => ({ empty: false, text: "should not read" }));
    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        listJobs: async () => [senior],
        writeSeen: write,
        readVaultMarkdown,
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(write).not.toHaveBeenCalled();
    expect(readVaultMarkdown).not.toHaveBeenCalled();
  });

  it("hydrates Workday jobs in the attempt window only", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { boeing: {}, stripe: {} });

    const hydrateContent = vi.fn(async (_company, _fetch, jobs: Job[]) =>
      jobs.map((job) => ({ ...job, content: "hydrated description" })),
    );
    setAdapterRegistryForTests({
      greenhouse: {
        ats: "greenhouse",
        listJobs: async (c) =>
          c.id === "stripe"
            ? [
                intern("20", {
                  absoluteUrl:
                    "https://job-boards.greenhouse.io/stripe/jobs/20",
                }),
              ]
            : [],
      },
      workday: {
        ats: "workday",
        listJobs: async () => [
          intern("JR100", {
            title: "Software Engineer Intern JR100",
            absoluteUrl:
              "https://boeing.wd1.myworkdayjobs.com/external_subsidiary/job/Seattle/JR100",
            content: "",
          }),
        ],
        hydrateContent,
      },
    });

    const generateFitNote = vi.fn(async (input) => input.job.content);

    await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        config: configWith([
          {
            id: "boeing",
            name: "Boeing",
            ats: "workday",
            workday: {
              host: "boeing.wd1.myworkdayjobs.com",
              tenant: "boeing",
              site: "external_subsidiary",
            },
            enabled: true,
          },
          company("stripe", "Stripe"),
        ]),
        generateFitNote,
      }),
    );

    expect(hydrateContent).toHaveBeenCalledTimes(1);
    expect(hydrateContent.mock.calls[0]?.[2]).toHaveLength(1);
    expect(generateFitNote.mock.calls[0]?.[0].job.content).toBe(
      "hydrated description",
    );
  });
});
