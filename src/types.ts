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
