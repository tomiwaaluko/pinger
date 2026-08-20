import {
  EMPTY_VAULT_FIT_NOTE,
  FALLBACK_FIT_NOTE,
  FIT_NOTE_CAP,
  GREENHOUSE_CONCURRENCY,
} from "./constants.js";
import { buildDiscordEmbed } from "./discord.js";
import { matchesJob } from "./matcher.js";
import {
  isFirstRun,
  newMatchingJobs,
  recordJob,
} from "./seen-store.js";
import { selectAttemptWindow } from "./soft-cap.js";
import { truncate } from "./text.js";
import type { BoundJob } from "./soft-cap.js";
import type {
  CompanyConfig,
  DryRunPing,
  FitNoteInput,
  Job,
  RunWatcherOptions,
  RunWatcherResult,
  SeenStore,
  VaultContents,
} from "./types.js";
import { resolveCareerDir } from "./vault.js";

async function fitForJob(
  opts: RunWatcherOptions,
  vault: VaultContents,
  job: Job,
): Promise<string> {
  if (vault.empty) {
    return EMPTY_VAULT_FIT_NOTE;
  }
  if (!opts.env.GEMINI_API_KEY) {
    return FALLBACK_FIT_NOTE;
  }
  const input: FitNoteInput = {
    careerText: vault.text,
    job,
    model: opts.config.llm.model,
    apiKey: opts.env.GEMINI_API_KEY,
  };
  try {
    return await opts.generateFitNote(input);
  } catch {
    return FALLBACK_FIT_NOTE;
  }
}

export async function runWatcher(
  opts: RunWatcherOptions,
): Promise<RunWatcherResult> {
  const careerDir = resolveCareerDir(
    opts.vaultDir,
    opts.config.vault.careerPath,
  );

  const emptyResult = (): RunWatcherResult => ({
    exitCode: 0,
    dryRunPings: [],
    dryRunDeferred: [],
  });

  const enabled = opts.config.companies.filter((company) => company.enabled);
  if (enabled.length === 0) {
    console.error("No enabled companies in companies.yaml");
    return emptyResult();
  }

  const nameById = new Map(
    opts.config.companies.map((company) => [company.id, company.name] as const),
  );

  const store = await opts.readSeen(opts.seenPath);
  const nextStore: SeenStore = structuredClone(store);
  let anyDiscordFailure = false;
  const firstRunCompanyIds = new Set<string>();
  let postDirty = false;
  const fetchFailures: string[] = [];
  const discordBound: BoundJob[] = [];

  const writeMerged = async () => {
    if (firstRunCompanyIds.size > 0 || postDirty) {
      await opts.writeSeen(opts.seenPath, nextStore);
    }
  };

  try {
    async function processCompany(company: CompanyConfig): Promise<void> {
      try {
        const jobs = await opts.fetchJobs(company);
        const matched = jobs.filter((job) => matchesJob(job));

        if (isFirstRun(store, company.id)) {
          if (!opts.dryRun) {
            nextStore[company.id] = {};
            for (const job of matched) {
              recordJob(nextStore, company.id, job, opts.now().toISOString());
            }
            firstRunCompanyIds.add(company.id);
          }
          return;
        }

        const newJobs = newMatchingJobs(matched, store[company.id] ?? {}).sort(
          (a, b) => Number(a.id) - Number(b.id),
        );
        for (const job of newJobs) {
          discordBound.push({ companyId: company.id, job });
        }
      } catch (err) {
        console.error(
          `Greenhouse fetch failed for ${company.id}:`,
          String(err),
        );
        fetchFailures.push(company.id);
      }
    }

    for (let i = 0; i < enabled.length; i += GREENHOUSE_CONCURRENCY) {
      const chunk = enabled.slice(i, i + GREENHOUSE_CONCURRENCY);
      await Promise.all(chunk.map((company) => processCompany(company)));
    }

    if (fetchFailures.length === enabled.length && enabled.length > 0) {
      return { exitCode: 2, dryRunPings: [], dryRunDeferred: [] };
    }

    const { attempt, deferred } = selectAttemptWindow(discordBound);
    const toPing = (bound: BoundJob): DryRunPing => ({
      companyId: bound.companyId,
      jobId: bound.job.id,
      title: bound.job.title,
      absoluteUrl: bound.job.absoluteUrl,
      location: bound.job.location,
    });

    if (opts.dryRun) {
      return {
        exitCode: 0,
        dryRunPings: attempt.map(toPing),
        dryRunDeferred: deferred.map(toPing),
      };
    }

    if (attempt.length > 0) {
      const webhookUrl = opts.env.DISCORD_WEBHOOK_URL;
      if (!webhookUrl) {
        return { exitCode: 2, dryRunPings: [], dryRunDeferred: [] };
      }

      let vault: VaultContents;
      try {
        vault = await opts.readVaultMarkdown(careerDir);
      } catch {
        return { exitCode: 2, dryRunPings: [], dryRunDeferred: [] };
      }

      for (const { companyId, job } of attempt) {
        const companyName = nameById.get(companyId) ?? companyId;
        const fit = truncate(await fitForJob(opts, vault, job), FIT_NOTE_CAP);
        try {
          await opts.postDiscord(
            webhookUrl,
            buildDiscordEmbed({
              job,
              companyName,
              companyId,
              fit,
            }),
          );
          recordJob(nextStore, companyId, job, opts.now().toISOString());
          postDirty = true;
        } catch (err) {
          console.error(`Discord post failed for job ${job.id}:`, String(err));
          anyDiscordFailure = true;
        }
      }
    }

    return {
      exitCode: anyDiscordFailure ? 2 : 0,
      dryRunPings: [],
      dryRunDeferred: [],
    };
  } finally {
    if (!opts.dryRun) {
      await writeMerged();
    }
  }
}
