import { loadConfig } from "./config.js";
import { postDiscord } from "./discord.js";
import { generateFitNote } from "./fit-note.js";
import { runWatcher } from "./pipeline.js";
import { readSeen, writeSeen } from "./seen-store.js";
import { readVaultMarkdown } from "./vault.js";

async function main(): Promise<void> {
  const vaultDir = process.env.VAULT_DIR;
  if (!vaultDir) {
    console.error("VAULT_DIR is required");
    process.exit(1);
  }
  const dryRun = process.env.DRY_RUN === "true";
  const config = loadConfig("companies.yaml");
  const result = await runWatcher({
    config,
    vaultDir,
    seenPath: "seen-jobs.json",
    dryRun,
    env: {
      DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
      DISCORD_WEBHOOK_URL_INTERN: process.env.DISCORD_WEBHOOK_URL_INTERN,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    },
    now: () => new Date(),
    fetch,
    readVaultMarkdown,
    generateFitNote,
    postDiscord,
    readSeen,
    writeSeen,
  });
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
  process.exitCode = result.exitCode;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
