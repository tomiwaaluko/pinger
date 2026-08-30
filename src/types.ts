export type Job = {
  id: string;
  title: string;
  location: string;
  careerSiteCategory: string | null;
  departments: string[];
  absoluteUrl: string;
  content: string;
};

export type GreenhouseCompany = {
  id: string;
  name: string;
  ats: "greenhouse";
  boardToken: string;
  enabled: boolean;
};

export type AshbyCompany = {
  id: string;
  name: string;
  ats: "ashby";
  boardName: string;
  enabled: boolean;
};

export type WorkdayCompany = {
  id: string;
  name: string;
  ats: "workday";
  workday: { host: string; tenant: string; site: string };
  enabled: boolean;
};

export type CustomCompany = {
  id: string;
  name: string;
  ats: "custom";
  enabled: false;
};

export type CompanyConfig =
  | GreenhouseCompany
  | AshbyCompany
  | WorkdayCompany
  | CustomCompany;

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
    [jobId: string]: SeenJob;
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
  dryRunDeferred: DryRunPing[];
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
  fetch: FetchLike;
  readVaultMarkdown: (careerDir: string) => Promise<VaultContents>;
  generateFitNote: (input: FitNoteInput) => Promise<string>;
  postDiscord: (webhookUrl: string, embed: DiscordEmbed) => Promise<void>;
  readSeen: (path: string) => Promise<SeenStore>;
  writeSeen: (path: string, store: SeenStore) => Promise<void>;
};
