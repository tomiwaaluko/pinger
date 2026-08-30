export type WorkdayBoard = {
  host: string;
  tenant: string;
  site: string;
};

const LOCALE_SEGMENT = /^[a-z]{2}(?:-[A-Za-z]{2})?$/;

export function parseWorkdayCareersUrl(url: string): WorkdayBoard {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid Workday careers URL: ${url}`);
  }

  const hostMatch = parsed.hostname.match(
    /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/i,
  );
  if (!hostMatch) {
    throw new Error(`Workday host not recognized: ${parsed.hostname}`);
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  let site = segments[0] ?? "";
  if (LOCALE_SEGMENT.test(site) && segments.length > 1) {
    site = segments[1];
  }
  if (!site) {
    throw new Error(`Workday site segment missing in URL: ${url}`);
  }

  return {
    host: parsed.hostname,
    tenant: hostMatch[1].toLowerCase(),
    site,
  };
}
