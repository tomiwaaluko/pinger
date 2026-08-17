import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_VAULT_FIT_NOTE,
  FALLBACK_FIT_NOTE,
} from "../src/constants.js";
import { runWatcher } from "../src/pipeline.js";
import { readSeen, writeSeen } from "../src/seen-store.js";
import type {
  AppConfig,
  DiscordEmbed,
  Job,
  RunWatcherOptions,
} from "../src/types.js";
import { makeJob } from "./helpers.js";

const config: AppConfig = {
  vault: { careerPath: "Career/" },
  llm: { model: "gemini-2.5-flash" },
  companies: [
    {
      id: "vercel",
      name: "Vercel",
      ats: "greenhouse",
      boardToken: "vercel",
      careerSiteCategory: "Engineering",
    },
  ],
};

const internEarly = makeJob({
  id: "10",
  title: "Software Engineer Intern",
  absoluteUrl: "https://job-boards.greenhouse.io/vercel/jobs/10",
});
const internA = makeJob({
  id: "20",
  title: "Software Engineer Intern",
  absoluteUrl: "https://job-boards.greenhouse.io/vercel/jobs/20",
});
const internB = makeJob({
  id: "100",
  title: "AI Engineer Intern",
  absoluteUrl: "https://job-boards.greenhouse.io/vercel/jobs/100",
});
const senior = makeJob({
  id: "5474915004",
  title: "Software Engineer, AI SDK",
});

function vaultDirWithCareer(): string {
  const root = mkdtempSync(join(tmpdir(), "pinger-pipe-"));
  mkdirSync(join(root, "Career"));
  writeFileSync(join(root, "Career", "resume.md"), "Next.js internships");
  return root;
}

function baseOpts(
  overrides: Partial<RunWatcherOptions> &
    Pick<RunWatcherOptions, "fetchJobs" | "vaultDir" | "seenPath">,
): RunWatcherOptions {
  return {
    config,
    dryRun: false,
    env: {
      DISCORD_WEBHOOK_URL: "https://discord.test/webhook",
      GEMINI_API_KEY: "gemini-key",
    },
    now: () => new Date("2026-08-16T12:00:00.000Z"),
    readVaultMarkdown: async () => ({
      empty: false,
      text: "## resume.md\nNext.js internships",
    }),
    generateFitNote: async () => "Fits intern Next.js work.",
    postDiscord: async () => undefined,
    readSeen,
    writeSeen,
    ...overrides,
  };
}

describe("runWatcher", () => {
  it("first run with zero matches writes vercel: {} and does not Discord, LLM, or read vault", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    const generateFitNote = vi.fn(async () => "nope");
    const postDiscord = vi.fn(async () => undefined);
    const readVaultMarkdown = vi.fn(async () => ({
      empty: false,
      text: "should not be read",
    }));
    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        fetchJobs: async () => [senior],
        generateFitNote,
        postDiscord,
        readVaultMarkdown,
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(generateFitNote).not.toHaveBeenCalled();
    expect(postDiscord).not.toHaveBeenCalled();
    expect(readVaultMarkdown).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({ vercel: {} });
  });

  it("first run with matching ids persists them and pings nothing", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    const postDiscord = vi.fn(async () => undefined);
    const generateFitNote = vi.fn(async () => "nope");
    const readVaultMarkdown = vi.fn(async () => ({
      empty: false,
      text: "should not be read",
    }));
    await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        fetchJobs: async () => [internA],
        postDiscord,
        generateFitNote,
        readVaultMarkdown,
      }),
    );
    expect(postDiscord).not.toHaveBeenCalled();
    expect(generateFitNote).not.toHaveBeenCalled();
    expect(readVaultMarkdown).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({
      vercel: {
        "20": {
          title: "Software Engineer Intern",
          firstSeenAt: "2026-08-16T12:00:00.000Z",
        },
      },
    });
  });

  it("first run with missing DISCORD_WEBHOOK_URL still writes vercel: {} and does not Discord", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    const postDiscord = vi.fn(async () => undefined);
    const generateFitNote = vi.fn(async () => "nope");
    const readVaultMarkdown = vi.fn(async () => ({
      empty: false,
      text: "should not be read",
    }));
    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        env: {},
        fetchJobs: async () => [senior],
        postDiscord,
        generateFitNote,
        readVaultMarkdown,
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(postDiscord).not.toHaveBeenCalled();
    expect(generateFitNote).not.toHaveBeenCalled();
    expect(readVaultMarkdown).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({ vercel: {} });
  });

  it("later run with empty vercel object plus one new match pings once", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { vercel: {} });
    const generateFitNote = vi.fn(async () => "Fits intern Next.js work.");
    const posted: DiscordEmbed[] = [];
    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        fetchJobs: async () => [internA, senior],
        generateFitNote,
        postDiscord: async (_url, embed) => {
          posted.push(embed);
        },
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(generateFitNote).toHaveBeenCalledTimes(1);
    expect(posted).toHaveLength(1);
    expect(posted[0].url).toBe(
      "https://job-boards.greenhouse.io/vercel/jobs/20",
    );
    expect(posted[0].url).not.toMatch(/vercel\.com\/careers/);
    expect(posted[0].fields.find((field) => field.name === "Fit")?.value).toBe(
      "Fits intern Next.js work.",
    );
    expect((await readSeen(seenPath)).vercel["20"]).toBeDefined();
  });

  it("missing GEMINI_API_KEY posts fallback and does not call generateFitNote", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { vercel: {} });
    const posted: DiscordEmbed[] = [];
    const generateFitNote = vi.fn(async () => "should not be called");
    await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        env: { DISCORD_WEBHOOK_URL: "https://discord.test/webhook" },
        fetchJobs: async () => [internA],
        generateFitNote,
        postDiscord: async (_url, embed) => {
          posted.push(embed);
        },
      }),
    );
    expect(generateFitNote).not.toHaveBeenCalled();
    expect(posted[0].fields.find((field) => field.name === "Fit")?.value).toBe(
      FALLBACK_FIT_NOTE,
    );
  });

  it("LLM error still posts fallback fit text", async () => {
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
        fetchJobs: async () => [internA],
        generateFitNote,
        postDiscord: async (_url, embed) => {
          posted.push(embed);
        },
      }),
    );
    expect(generateFitNote).toHaveBeenCalledTimes(1);
    expect(posted[0].fields.find((field) => field.name === "Fit")?.value).toBe(
      FALLBACK_FIT_NOTE,
    );
  });

  it("empty Career folder still pings with empty-folder fit text", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { vercel: {} });
    const posted: DiscordEmbed[] = [];
    const generateFitNote = vi.fn(async () => "nope");
    await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        fetchJobs: async () => [internA],
        readVaultMarkdown: async () => ({ empty: true, text: "" }),
        generateFitNote,
        postDiscord: async (_url, embed) => {
          posted.push(embed);
        },
      }),
    );
    expect(generateFitNote).not.toHaveBeenCalled();
    expect(posted[0].fields.find((field) => field.name === "Fit")?.value).toBe(
      EMPTY_VAULT_FIT_NOTE,
    );
  });

  it("Discord 200 then Discord 400 records only the first job and exits 2", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { vercel: {} });
    let calls = 0;
    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        fetchJobs: async () => [internB, internA],
        postDiscord: async () => {
          calls += 1;
          if (calls === 2) {
            throw new Error("Discord HTTP 400");
          }
        },
      }),
    );
    expect(result.exitCode).toBe(2);
    const seen = await readSeen(seenPath);
    expect(Object.keys(seen.vercel)).toEqual(["20"]);
    expect(seen.vercel["100"]).toBeUndefined();
  });

  it("Discord fail then succeed records only the later job and exits 2", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { vercel: {} });
    let calls = 0;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        fetchJobs: async () => [internA, internEarly],
        postDiscord: async () => {
          calls += 1;
          if (calls === 1) {
            throw new Error("Discord HTTP 400");
          }
        },
      }),
    );
    expect(result.exitCode).toBe(2);
    expect(consoleError).toHaveBeenCalledWith(
      "Discord post failed for job 10:",
      "Error: Discord HTTP 400",
    );
    consoleError.mockRestore();
    const seen = await readSeen(seenPath);
    expect(Object.keys(seen.vercel)).toEqual(["20"]);
    expect(seen.vercel["10"]).toBeUndefined();
  });

  it("DRY_RUN prints would-be pings and does not Discord, LLM, or write seen", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { vercel: {} });
    const generateFitNote = vi.fn(async () => "nope");
    const postDiscord = vi.fn(async () => undefined);
    const readVaultMarkdown = vi.fn(async () => ({
      empty: false,
      text: "should not be read",
    }));
    const write = vi.fn(writeSeen);
    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        dryRun: true,
        fetchJobs: async () => [internA],
        generateFitNote,
        postDiscord,
        writeSeen: write,
        readVaultMarkdown,
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.dryRunPings).toEqual([
      {
        companyId: "vercel",
        jobId: "20",
        title: "Software Engineer Intern",
        absoluteUrl: "https://job-boards.greenhouse.io/vercel/jobs/20",
        location: "Remote - United States",
      },
    ]);
    expect(generateFitNote).not.toHaveBeenCalled();
    expect(postDiscord).not.toHaveBeenCalled();
    expect(readVaultMarkdown).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({ vercel: {} });
  });

  it("fails immediately on careerPath escape without writing seen", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    const fetchJobs = vi.fn(async (): Promise<Job[]> => [internA]);
    await expect(
      runWatcher(
        baseOpts({
          vaultDir: dir,
          seenPath,
          config: {
            ...config,
            vault: { careerPath: "../" },
          },
          fetchJobs,
        }),
      ),
    ).rejects.toThrow(/escapes VAULT_DIR/);
    expect(fetchJobs).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({});
  });

  it("unreadable Career folder with new matches fails before Discord", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { vercel: {} });
    const postDiscord = vi.fn(async () => undefined);
    await expect(
      runWatcher(
        baseOpts({
          vaultDir: dir,
          seenPath,
          fetchJobs: async () => [internA],
          readVaultMarkdown: async () => {
            throw new Error("ENOENT");
          },
          postDiscord,
        }),
      ),
    ).rejects.toThrow(/ENOENT/);
    expect(postDiscord).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({ vercel: {} });
  });

  it("quiet later run leaves seen-jobs.json unchanged and does not read vault", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { vercel: {} });
    const write = vi.fn(writeSeen);
    const readVaultMarkdown = vi.fn(async () => ({
      empty: false,
      text: "should not be read",
    }));
    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        fetchJobs: async () => [senior],
        writeSeen: write,
        readVaultMarkdown,
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(write).not.toHaveBeenCalled();
    expect(readVaultMarkdown).not.toHaveBeenCalled();
  });

  it("quiet later run does not require webhook or vault", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { vercel: {} });
    const write = vi.fn(writeSeen);
    const readVaultMarkdown = vi.fn(async () => {
      throw new Error("Career folder unreadable");
    });
    const postDiscord = vi.fn(async () => undefined);
    const result = await runWatcher(
      baseOpts({
        vaultDir: dir,
        seenPath,
        env: {},
        fetchJobs: async () => [senior],
        writeSeen: write,
        readVaultMarkdown,
        postDiscord,
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(write).not.toHaveBeenCalled();
    expect(readVaultMarkdown).not.toHaveBeenCalled();
    expect(postDiscord).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({ vercel: {} });
  });

  it("does not write seen when Greenhouse fetch throws", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    const write = vi.fn(writeSeen);
    await expect(
      runWatcher(
        baseOpts({
          vaultDir: dir,
          seenPath,
          fetchJobs: async () => {
            throw new Error(
              "Greenhouse pagination incomplete: got 1 jobs, meta.total 83",
            );
          },
          writeSeen: write,
        }),
      ),
    ).rejects.toThrow(/pagination incomplete/);
    expect(write).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({});
  });

  it("fails before Discord when DISCORD_WEBHOOK_URL is missing and there are new matches", async () => {
    const dir = vaultDirWithCareer();
    const seenPath = join(dir, "seen-jobs.json");
    await writeSeen(seenPath, { vercel: {} });
    const postDiscord = vi.fn(async () => undefined);
    await expect(
      runWatcher(
        baseOpts({
          vaultDir: dir,
          seenPath,
          env: { GEMINI_API_KEY: "gemini-key" },
          fetchJobs: async () => [internA],
          postDiscord,
        }),
      ),
    ).rejects.toThrow(/DISCORD_WEBHOOK_URL/);
    expect(postDiscord).not.toHaveBeenCalled();
    expect(await readSeen(seenPath)).toEqual({ vercel: {} });
  });
});
