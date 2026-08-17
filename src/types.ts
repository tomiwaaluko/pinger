export type Job = {
  id: string;
  title: string;
  location: string;
  careerSiteCategory: string | null;
  departments: string[];
  absoluteUrl: string;
  content: string;
};

export type CompanyConfig = {
  id: string;
  name: string;
  ats: "greenhouse";
  boardToken: string;
  careerSiteCategory: string;
};

export type AppConfig = {
  vault: { careerPath: string };
  llm: { model: string };
  companies: CompanyConfig[];
};

export type SeenJob = {
  title: string;
  firstSeenAt: string;
};

export type SeenStore = {
  [companyId: string]: {
    [greenhouseId: string]: SeenJob;
  };
};

export type FetchLike = typeof fetch;

export type VaultContents = {
  empty: boolean;
  text: string;
};

export type FitNoteInput = {
  careerText: string;
  job: Job;
  model: string;
  apiKey: string;
};

export type DiscordEmbed = {
  title: string;
  url: string;
  fields: Array<{ name: string; value: string }>;
  footer: { text: string };
};

export type DryRunPing = {
  companyId: string;
  jobId: string;
  title: string;
  absoluteUrl: string;
  location: string;
};

export type RunWatcherResult = {
  exitCode: 0 | 2;
  dryRunPings: DryRunPing[];
};

export type RunWatcherOptions = {
  config: AppConfig;
  vaultDir: string;
  seenPath: string;
  dryRun: boolean;
  env: {
    DISCORD_WEBHOOK_URL?: string;
    GEMINI_API_KEY?: string;
  };
  now: () => Date;
  fetchJobs: (company: CompanyConfig) => Promise<Job[]>;
  readVaultMarkdown: (careerDir: string) => Promise<VaultContents>;
  generateFitNote: (input: FitNoteInput) => Promise<string>;
  postDiscord: (webhookUrl: string, embed: DiscordEmbed) => Promise<void>;
  readSeen: (path: string) => Promise<SeenStore>;
  writeSeen: (path: string, store: SeenStore) => Promise<void>;
};
