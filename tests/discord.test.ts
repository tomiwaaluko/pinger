import { describe, expect, it } from "vitest";
import { DISCORD_TITLE_CAP } from "../src/constants.js";
import { buildDiscordEmbed, postDiscord } from "../src/discord.js";
import { makeJob } from "./helpers.js";

describe("buildDiscordEmbed", () => {
  it("uses Greenhouse absolute_url, not a vercel.com/careers slug", () => {
    const job = makeJob({
      title: "Software Engineer Intern (Summer 2027) ",
      location: "Remote - United States",
      absoluteUrl: "https://job-boards.greenhouse.io/vercel/jobs/9990001004",
    });
    const embed = buildDiscordEmbed({
      job,
      companyName: "Vercel",
      companyId: "vercel",
      fit: "Intern role overlaps with Next.js internships.",
    });
    expect(embed.title).toBe("Software Engineer Intern (Summer 2027)");
    expect(embed.url).toBe(
      "https://job-boards.greenhouse.io/vercel/jobs/9990001004",
    );
    expect(embed.url).not.toMatch(/vercel\.com\/careers/);
    expect(embed.fields).toEqual([
      { name: "Company", value: "Vercel" },
      { name: "Location", value: "Remote - United States" },
      { name: "Fit", value: "Intern role overlaps with Next.js internships." },
    ]);
    expect(embed.footer).toEqual({ text: "pinger · vercel" });
  });

  it("keeps Trust & Safety and trailing-space titles on the Greenhouse URL", () => {
    const job = makeJob({
      title: "Software Engineer Intern, Trust & Safety ",
      absoluteUrl: "https://job-boards.greenhouse.io/vercel/jobs/5788954004",
    });
    const embed = buildDiscordEmbed({
      job,
      companyName: "Vercel",
      companyId: "vercel",
      fit: "ok",
    });
    expect(embed.title).toBe("Software Engineer Intern, Trust & Safety");
    expect(embed.url).toBe(
      "https://job-boards.greenhouse.io/vercel/jobs/5788954004",
    );
  });

  it("truncates title to 256 characters", () => {
    const job = makeJob({ title: `${"A".repeat(300)} intern software engineer` });
    const embed = buildDiscordEmbed({
      job,
      companyName: "Vercel",
      companyId: "vercel",
      fit: "ok",
    });
    expect(embed.title).toHaveLength(DISCORD_TITLE_CAP);
  });

  it("strips @everyone and @here from title and fit", () => {
    const embed = buildDiscordEmbed({
      job: makeJob({ title: "@everyone Software Engineer Intern" }),
      companyName: "Vercel",
      companyId: "vercel",
      fit: "Ping @here and @everyone please",
    });
    expect(embed.title).toBe("Software Engineer Intern");
    expect(embed.title).not.toMatch(/@everyone/i);
    expect(embed.fields.find((field) => field.name === "Fit")?.value).toBe(
      "Ping  and  please",
    );
    expect(embed.fields.find((field) => field.name === "Fit")?.value).not.toMatch(
      /@everyone|@here/i,
    );
  });
});

describe("postDiscord", () => {
  it("POSTs embeds JSON and throws on 4xx", async () => {
    const embed = buildDiscordEmbed({
      job: makeJob(),
      companyName: "Vercel",
      companyId: "vercel",
      fit: "ok",
    });
    await postDiscord("https://discord.test/webhook", embed, async (input, init) => {
      expect(String(input)).toBe("https://discord.test/webhook?wait=true");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)) as { embeds: unknown[] };
      expect(body.embeds).toHaveLength(1);
      return new Response(JSON.stringify({ id: "1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    await postDiscord(
      "https://discord.test/webhook?foo=1",
      embed,
      async (input) => {
        expect(String(input)).toBe(
          "https://discord.test/webhook?foo=1&wait=true",
        );
        return new Response(JSON.stringify({ id: "1" }), { status: 200 });
      },
    );
    await expect(
      postDiscord("https://discord.test/webhook", embed, async () => {
        return new Response("bad", { status: 400 });
      }),
    ).rejects.toThrow(/400/);
  });
});
