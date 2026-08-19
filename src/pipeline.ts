import {
  EMPTY_VAULT_FIT_NOTE,
  FALLBACK_FIT_NOTE,
  FIT_NOTE_CAP,
} from "./constants.js";
import { buildDiscordEmbed } from "./discord.js";
import { matchesJob } from "./matcher.js";
import {
  isFirstRun,
  newMatchingJobs,
  recordJob,
} from "./seen-store.js";
import { truncate } from "./text.js";
import type {
  FitNoteInput,
  Job,
  RunWatcherOptions,
  RunWatcherResult,
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
  const store = await opts.readSeen(opts.seenPath);
  const dryRunPings: RunWatcherResult["dryRunPings"] = [];
  let anyDiscordFailure = false;
  let seenDirty = false;

  try {
    for (const company of opts.config.companies) {
      const jobs = await opts.fetchJobs(company);
      const matched = jobs.filter((job) =>
        matchesJob(job, company.careerSiteCategory),
      );

      if (isFirstRun(store, company.id)) {
        if (!opts.dryRun) {
          store[company.id] = {};
          for (const job of matched) {
            recordJob(store, company.id, job, opts.now().toISOString());
          }
          seenDirty = true;
        }
        continue;
      }

      const newJobs = newMatchingJobs(matched, store[company.id]).sort(
        (a, b) => Number(a.id) - Number(b.id),
      );

      if (opts.dryRun) {
        for (const job of newJobs) {
          dryRunPings.push({
            companyId: company.id,
            jobId: job.id,
            title: job.title,
            absoluteUrl: job.absoluteUrl,
            location: job.location,
          });
        }
        continue;
      }

      if (newJobs.length === 0) {
        continue;
      }

      const webhookUrl = opts.env.DISCORD_WEBHOOK_URL;
      if (!webhookUrl) {
        throw new Error("DISCORD_WEBHOOK_URL is required when posting new jobs");
      }

      const vault = await opts.readVaultMarkdown(careerDir);

      for (const job of newJobs) {
        const fit = truncate(await fitForJob(opts, vault, job), FIT_NOTE_CAP);
        try {
          await opts.postDiscord(
            webhookUrl,
            buildDiscordEmbed({
              job,
              companyName: company.name,
              companyId: company.id,
              fit,
            }),
          );
          recordJob(store, company.id, job, opts.now().toISOString());
          seenDirty = true;
        } catch (err) {
          console.error(`Discord post failed for job ${job.id}:`, String(err));
          anyDiscordFailure = true;
          // Continue to the next job. Do not break: a later 2xx must still be recorded.
        }
      }
    }

    return {
      exitCode: anyDiscordFailure ? 2 : 0,
      dryRunPings,
    };
  } finally {
    if (seenDirty) {
      await opts.writeSeen(opts.seenPath, store);
    }
  }
}
