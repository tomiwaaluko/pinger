import { getAdapter } from "./adapters/index.js";
import {
  ASHBY_CONCURRENCY,
  EMPTY_VAULT_FIT_NOTE,
  FALLBACK_FIT_NOTE,
  FIT_NOTE_CAP,
  GREENHOUSE_CONCURRENCY,
  WORKDAY_CONCURRENCY,
} from "./constants.js";
import { buildDiscordEmbed } from "./discord.js";
import { matchesJob } from "./matcher.js";
import {
  isFirstRun,
  newMatchingJobs,
  recordJob,
} from "./seen-store.js";
import { compareJobIds, selectAttemptWindow } from "./soft-cap.js";
import { truncate } from "./text.js";
import type { BoundJob } from "./soft-cap.js";
import type {
  AshbyCompany,
  DryRunPing,
  FitNoteInput,
  GreenhouseCompany,
  Job,
  RunWatcherOptions,
  RunWatcherResult,
  SeenStore,
  VaultContents,
  WorkdayCompany,
} from "./types.js";
import { resolveCareerDir } from "./vault.js";

type EnabledCompany = GreenhouseCompany | AshbyCompany | WorkdayCompany;

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

async function processInBatches(
  companies: EnabledCompany[],
  concurrency: number,
  processCompany: (company: EnabledCompany) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < companies.length; i += concurrency) {
    const chunk = companies.slice(i, i + concurrency);
    await Promise.all(chunk.map((company) => processCompany(company)));
  }
}

async function hydrateWorkdayAttemptWindow(
  attempt: BoundJob[],
  enabled: EnabledCompany[],
  fetch: RunWatcherOptions["fetch"],
): Promise<void> {
  const companyById = new Map(enabled.map((company) => [company.id, company]));
  const boundsByCompany = new Map<string, BoundJob[]>();

  for (const bound of attempt) {
    const company = companyById.get(bound.companyId);
    if (company?.ats !== "workday") {
      continue;
    }
    const list = boundsByCompany.get(bound.companyId) ?? [];
    list.push(bound);
    boundsByCompany.set(bound.companyId, list);
  }

  for (const [companyId, bounds] of boundsByCompany) {
    const company = companyById.get(companyId) as WorkdayCompany;
    const adapter = getAdapter("workday");
    if (!adapter.hydrateContent) {
      continue;
    }
    const hydrated = await adapter.hydrateContent(
      company,
      fetch,
      bounds.map((bound) => bound.job),
    );
    const byId = new Map(hydrated.map((job) => [job.id, job]));
    for (const bound of bounds) {
      const updated = byId.get(bound.job.id);
      if (updated) {
        bound.job = updated;
      }
    }
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

  const enabled = opts.config.companies.filter(
    (company): company is EnabledCompany => company.enabled,
  );
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
    async function processCompany(company: EnabledCompany): Promise<void> {
      try {
        const adapter = getAdapter(company.ats);
        const jobs = await adapter.listJobs(company, opts.fetch);
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
          (a, b) => compareJobIds(a.id, b.id),
        );
        for (const job of newJobs) {
          discordBound.push({ companyId: company.id, job });
        }
      } catch (err) {
        console.error(
          `Job fetch failed for ${company.id} (${company.ats}):`,
          String(err),
        );
        fetchFailures.push(company.id);
      }
    }

    const greenhouse = enabled.filter((c) => c.ats === "greenhouse");
    const ashby = enabled.filter((c) => c.ats === "ashby");
    const workday = enabled.filter((c) => c.ats === "workday");

    await Promise.all([
      processInBatches(greenhouse, GREENHOUSE_CONCURRENCY, processCompany),
      processInBatches(ashby, ASHBY_CONCURRENCY, processCompany),
      processInBatches(workday, WORKDAY_CONCURRENCY, processCompany),
    ]);

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

      await hydrateWorkdayAttemptWindow(attempt, enabled, opts.fetch);

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
