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
