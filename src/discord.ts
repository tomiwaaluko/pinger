import {
  DISCORD_FIELD_CAP,
  DISCORD_TITLE_CAP,
  FIT_NOTE_CAP,
  REQUEST_TIMEOUT_MS,
} from "./constants.js";
import { truncate } from "./text.js";
import type { DiscordEmbed, FetchLike, Job } from "./types.js";

function stripRolePings(text: string): string {
  return text.replace(/@everyone/gi, "").replace(/@here/gi, "");
}

export function buildDiscordEmbed(input: {
  job: Job;
  companyName: string;
  companyId: string;
  fit: string;
}): DiscordEmbed {
  return {
    title: truncate(
      stripRolePings(input.job.title.trim()).trim(),
      DISCORD_TITLE_CAP,
    ),
    url: input.job.absoluteUrl,
    fields: [
      { name: "Company", value: input.companyName },
      {
        name: "Location",
        value: truncate(input.job.location || "Unknown", DISCORD_FIELD_CAP),
      },
      { name: "Fit", value: truncate(stripRolePings(input.fit), FIT_NOTE_CAP) },
    ],
    footer: { text: `pinger · ${input.companyId}` },
  };
}

export async function postDiscord(
  webhookUrl: string,
  embed: DiscordEmbed,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");
  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`Discord request failed: ${(err as Error).message}`);
  }
  if (!response.ok) {
    throw new Error(`Discord HTTP ${response.status}`);
  }
}
