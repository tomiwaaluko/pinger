#!/usr/bin/env node
/**
 * Refine compiled target-company list into a clean 500-1000 company set.
 * Usage: node scripts/refine-target-companies.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IN = join(ROOT, "data", "target-companies.yaml");
const OUT = join(ROOT, "data", "target-companies-refined.yaml");

const NAME_MAP = new Map(
  Object.entries({
    abnormalsecurity: "Abnormal Security",
    airbnb: "Airbnb",
    algolia: "Algolia",
    amplitude: "Amplitude",
    andurilindustries: "Anduril Industries",
    anthropic: "Anthropic",
    asana: "Asana",
    brex: "Brex",
    chime: "Chime",
    clickhouse: "ClickHouse",
    cloudflare: "Cloudflare",
    cockroachlabs: "Cockroach Labs",
    coinbase: "Coinbase",
    customerio: "Customer.io",
    databricks: "Databricks",
    datadog: "Datadog",
    descope: "Descope",
    discord: "Discord",
    dropbox: "Dropbox",
    duolingo: "Duolingo",
    elastic: "Elastic",
    fastly: "Fastly",
    figma: "Figma",
    gitlab: "GitLab",
    gleanwork: "Glean",
    grafanalabs: "Grafana Labs",
    honeycomb: "Honeycomb",
    inflectionai: "Inflection AI",
    instacart: "Instacart",
    intercom: "Intercom",
    jetbrains: "JetBrains",
    launchdarkly: "LaunchDarkly",
    lyft: "Lyft",
    mercury: "Mercury",
    mixpanel: "Mixpanel",
    mongodb: "MongoDB",
    mozilla: "Mozilla",
    netlify: "Netlify",
    newrelic: "New Relic",
    nuro: "Nuro",
    okta: "Okta",
    pinterest: "Pinterest",
    planetscale: "PlanetScale",
    postman: "Postman",
    prisma: "Prisma",
    reddit: "Reddit",
    roblox: "Roblox",
    robinhood: "Robinhood",
    scaleai: "Scale AI",
    spacex: "SpaceX",
    stripe: "Stripe",
    tailscale: "Tailscale",
    temporaltechnologies: "Temporal",
    togetherai: "Together AI",
    twilio: "Twilio",
    twitch: "Twitch",
    vercel: "Vercel",
    waymo: "Waymo",
    webflow: "Webflow",
    xai: "xAI",
  })
);

// Parent/subsidiary merges — canonical slug -> preferred display name
const ALIASES = new Map([
  ["alphabet", "google"],
  ["square", "block"],
  ["meta-platforms", "meta"],
  ["facebook", "meta"],
]);

const CANONICAL_NAMES = new Map([
  ["google", "Google"],
  ["block", "Block"],
  ["meta", "Meta"],
]);

// Staffing agencies, IT body shops, and non-target employers
const EXCLUDE_PATTERNS = [
  /^(robert half|randstad|teksystems|insight global|apex systems|kforce|modis|cybercoders|motion recruitment|aerotek|actalent|collabera|compunnel|mindlance|procom|sirius|staffing|recruiting)/i,
  /^(ag technologies|endictus|pae|jnd|usan|worth finance|gm financial|barry-wehmiller|empower ai|torch technologies|inductive automation|sierra nevada)/i,
  /^(caci|leidos|saic|booz allen|northrop|rtx|lockheed|boeing|general dynamics|l3harris|bae systems)/i, // defense — optional, user wants big tech; keep defense actually since user mentioned aerospace
];

// Keep defense — user wants big tech AND fintech. Remove only clear staffing.
const EXCLUDE_ONLY = [
  /^(robert half|randstad|teksystems|insight global|apex systems|kforce|modis|cybercoders|motion recruitment|aerotek|actalent|collabera|compunnel|mindlance|procom|staffing|recruiting)/i,
  /^(ag technologies|endictus|pae|jnd|usan|worth finance|barry-wehmiller|empower ai|torch technologies)/i,
  /\b(careers|staffing|recruiting agency|it careers|technical services|talent solutions|workforce)\b/i,
  /^(ace it|9to9|absurd|alphataraxia|agate software)\b/i,
  /university$/i, // "Akuna Capital University" etc.
];

function isJunkTier3(c) {
  if (c.tier > 2 && EXCLUDE_ONLY.some((re) => re.test(c.name))) return true;
  // Very short obscure names unlikely to be target employers
  if (c.tier > 2 && c.name.length <= 2) return true;
  return false;
}

function qualityScore(c) {
  let score = 0;
  if (c.tier === 1) score += 100;
  if (c.tier === 2) score += 50;
  if (c.greenhouseFleet) score += 30;
  if (c.curated) score += 25;
  if (c.earlyCareerVerified) score += 20;
  if (c.ats !== "unknown") score += 15;
  if (c.category && c.category !== "other" && c.category !== "tech") score += 10;
  if (c.boardToken) score += 10;
  return score;
}

const CATEGORY_KEYWORDS = [
  ["big-tech", /\b(google|meta|apple|amazon|microsoft|netflix|nvidia|tesla|alphabet|bytedance|tiktok|alibaba|tencent|baidu|samsung)\b/i],
  ["fintech", /\b(stripe|plaid|brex|ramp|chime|sofi|affirm|robinhood|coinbase|block|square|marqeta|toast|visa|mastercard|paypal|capital one|fidelity|blackrock|goldman|morgan stanley|jpmorgan|chase|citadel|jane street|two sigma|optiver|akuna|five rings|bloomberg|klarna|wise|revolut|nubank|adyen|intuit|carta|mercury|american express|amex|discover|wells fargo|regions bank|ally|sofi|lendingclub|upstart|figure|blend|dave|current|varo|kikoff|perpay|aven|nymbus|quicken|rocket mortgage|expensify|bill\.com|gusto|navan|deel)\b/i],
  ["ai", /\b(anthropic|openai|cognition|cohere|mistral|hugging face|perplexity|xai|scale ai|inflection|together ai|anysphere|cursor)\b/i],
  ["devtools", /\b(vercel|cloudflare|datadog|gitlab|github|postman|prisma|sentry|launchdarkly|grafana|new relic|hashicorp|pulumi|replit|sourcegraph|netlify|heroku|render|railway|fly\.io|tailwind|supabase)\b/i],
  ["data", /\b(databricks|snowflake|mongodb|elastic|confluent|fivetran|airbyte|dbt|hex|amplitude|segment|mixpanel|planetscale|cockroach|neon|redis|clickhouse)\b/i],
  ["security", /\b(okta|crowdstrike|palo alto|zscaler|snyk|sentinelone|wiz|1password|vanta|drata|verkada|netskope|auth0|clerk|stytch)\b/i],
  ["defense", /\b(anduril|palantir|spacex|rtx|lockheed|northrop|boeing|leidos|caci|saic|booz allen|general dynamics|l3harris|bae|raytheon|aero\s*viron)/i],
  ["hardware", /\b(intel|amd|nvidia|qualcomm|broadcom|micron|arm|marvell|globalfoundries|applied materials|lam research|hp|dell|lenovo|pure storage|netapp|garmin|nxp)\b/i],
  ["consumer", /\b(airbnb|doordash|instacart|uber|lyft|discord|reddit|pinterest|snap|spotify|roblox|riot|epic|netflix|disney|zoom|dropbox)\b/i],
  ["enterprise", /\b(salesforce|servicenow|workday|oracle|sap|adobe|atlassian|hubspot|zendesk|freshworks|ibm|splunk|accenture|deloitte|cognizant|infosys|amentum|leidos|caci|saic)\b/i],
  ["finance", /\b(goldman|morgan stanley|jpmorgan|chase|citi|bank of america|wells fargo|blackrock|fidelity|schwab|vanguard|state street|northern trust|mastercard|visa|amex|american express)\b/i],
  ["healthtech", /\b(epic systems|veeva|tempus|oscar|devoted|flatiron|natera|guardant|abbott|abbvie|agilon|aledade|unitedhealth|anthem|cigna|humana|kaiser)\b/i],
  ["retail", /\b(walmart|target|costco|amazon|albertsons|kroger|home depot|lowes|best buy|nordstrom|macys)\b/i],
  ["autonomous", /\b(waymo|cruise|aurora|nuro|applied intuition|zoox|motional|argo)\b/i],
  ["infra", /\b(cloudflare|fastly|akamai|digitalocean|tailscale|cloudinary|algolia)\b/i],
  ["gaming", /\b(roblox|riot|epic|unity|ea |electronic arts|activision|blizzard|valve)\b/i],
  ["consulting", /\b(accenture|deloitte|pwc|ey |kpmg|capgemini|cognizant|infosys|wipro|tcs |hcl )\b/i],
];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function displayName(slug, rawName) {
  if (CANONICAL_NAMES.has(slug)) return CANONICAL_NAMES.get(slug);
  if (NAME_MAP.has(slug)) return NAME_MAP.get(slug);
  if (NAME_MAP.has(slug.replace(/-/g, ""))) return NAME_MAP.get(slug.replace(/-/g, ""));
  // Title-case if all lowercase concatenated
  if (rawName && /^[a-z]+$/.test(rawName.replace(/\s/g, ""))) {
    return rawName
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return rawName;
}

function inferCategory(name, slug) {
  const hay = `${name} ${slug}`;
  for (const [cat, re] of CATEGORY_KEYWORDS) {
    if (re.test(hay)) return cat;
  }
  return null;
}

function parseYamlCompanies(text) {
  const blocks = text.split(/\n  - slug:/).slice(1);
  return blocks
    .map((b) => {
      const slug = b.match(/^ ([^\n]+)/)?.[1]?.trim();
      const name = b.match(/name: "([^"]+)"/)?.[1];
      let category = b.match(/category: ([^\n]+)/)?.[1]?.trim();
      const ats = b.match(/ats: ([^\n]+)/)?.[1]?.trim();
      const tier = parseInt(b.match(/tier: (\d)/)?.[1] || "3", 10);
      const boardToken = b.match(/boardToken: ([^\n]+)/)?.[1]?.trim();
      const ghEnabled = b.match(/greenhouseEnabled: (true|false)/)?.[1];
      const sourcesMatch = b.match(/sources: \[([^\]]+)\]/);
      const sourceMatch = b.match(/source: ([^\n]+)/);
      const sources = sourcesMatch
        ? sourcesMatch[1].split(",").map((s) => s.trim())
        : sourceMatch
          ? [sourceMatch[1].trim()]
          : [];

      const canonical = ALIASES.get(slug) || slug;
      const fixedName = displayName(canonical, ALIASES.has(slug) ? displayName(canonical, name) : name);
      const betterCategory =
        inferCategory(fixedName, canonical) ||
        (category !== "other" ? category : null) ||
        "tech";

      return {
        slug: canonical,
        name: fixedName,
        category: betterCategory || "tech",
        ats,
        tier,
        boardToken: boardToken?.replace(/"/g, ""),
        greenhouseEnabled: ghEnabled === "true",
        sources,
        earlyCareerVerified: sources.some((s) =>
          ["simplify-jobs", "apply-guy"].includes(s)
        ),
        greenhouseFleet: sources.includes("greenhouse-fleet") || Boolean(boardToken),
        curated: sources.includes("curated"),
      };
    })
    .filter((c) => c.slug);
}

function mergeCompanies(companies) {
  const bySlug = new Map();
  for (const c of companies) {
    const existing = bySlug.get(c.slug);
    if (!existing) {
      bySlug.set(c.slug, { ...c, sources: [...c.sources] });
      continue;
    }
    bySlug.set(c.slug, {
      slug: c.slug,
      name: c.name.length > existing.name.length ? c.name : existing.name,
      category:
        existing.category !== "other" && existing.category !== "tech"
          ? existing.category
          : c.category,
      ats: c.ats !== "unknown" ? c.ats : existing.ats,
      tier: Math.min(c.tier, existing.tier),
      boardToken: c.boardToken || existing.boardToken,
      greenhouseEnabled: c.greenhouseEnabled || existing.greenhouseEnabled,
      sources: [...new Set([...existing.sources, ...c.sources])],
      earlyCareerVerified:
        c.earlyCareerVerified || existing.earlyCareerVerified,
      greenhouseFleet: c.greenhouseFleet || existing.greenhouseFleet,
      curated: c.curated || existing.curated,
    });
  }
  return [...bySlug.values()];
}

function shouldInclude(c) {
  if (isJunkTier3(c)) return false;

  const signals = [];
  if (c.tier === 1) signals.push("tier-1");
  if (c.tier === 2 && c.greenhouseFleet) signals.push("greenhouse-fleet");
  if (c.earlyCareerVerified) signals.push("active-early-career");
  if (c.curated && c.tier <= 2) signals.push("curated");
  if (c.ats !== "unknown" && c.tier <= 2) signals.push("known-ats");

  // Tier 1 always included
  if (c.tier === 1) {
    c.signals = signals.length ? signals : ["tier-1"];
    c._score = qualityScore(c);
    return true;
  }

  // Greenhouse fleet (verified board)
  if (c.greenhouseFleet && c.boardToken) {
    c.signals = signals.length ? signals : ["greenhouse-fleet"];
    c._score = qualityScore(c);
    return true;
  }

  // Known ATS + curated or early career
  if (c.ats !== "unknown" && (c.curated || c.earlyCareerVerified)) {
    c.signals = signals;
    c._score = qualityScore(c);
    return true;
  }

  // Workday/custom tier-2 curated
  if (c.tier === 2 && c.curated) {
    c.signals = signals;
    c._score = qualityScore(c);
    return true;
  }

  // Tier 3: defer to scoring pass (included if top-ranked)
  if (c.tier === 3 && c.earlyCareerVerified) {
    c.signals = signals.length ? signals : ["active-early-career"];
    c._score = qualityScore(c);
    return "candidate";
  }

  return false;
}

function atsConfidence(c) {
  if (c.boardToken) return "verified";
  if (c.ats === "unknown") return "unknown";
  if (c.curated) return "inferred";
  return "inferred";
}

function toYaml(companies) {
  const lines = [
    "# Refined target companies for pinger multi-ATS expansion",
    `# Generated: ${new Date().toISOString().slice(0, 10)}`,
    `# Total: ${companies.length} companies`,
    "#",
    "# Inclusion: tier-1, verified Greenhouse fleet, curated known-ATS,",
    "#            or active early-career SWE listings (Simplify/ApplyGuy).",
    "# Excludes: staffing agencies and IT body shops.",
    "",
    "companies:",
  ];

  for (const c of companies) {
    lines.push(`  - slug: ${c.slug}`);
    lines.push(`    name: "${c.name.replace(/"/g, '\\"')}"`);
    lines.push(`    category: ${c.category}`);
    lines.push(`    ats: ${c.ats}`);
    lines.push(`    atsConfidence: ${atsConfidence(c)}`);
    lines.push(`    tier: ${c.tier}`);
    if (c.boardToken) lines.push(`    boardToken: "${c.boardToken}"`);
    if (c.greenhouseEnabled) lines.push(`    greenhouseEnabled: true`);
    if (c.earlyCareerVerified) lines.push(`    earlyCareerVerified: true`);
    if (c.signals?.length)
      lines.push(`    signals: [${c.signals.join(", ")}]`);
  }
  return lines.join("\n") + "\n";
}

// Main
const raw = readFileSync(IN, "utf8");
const parsed = parseYamlCompanies(raw);
const merged = mergeCompanies(parsed);

const core = [];
const tier3Candidates = [];
for (const c of merged) {
  const result = shouldInclude(c);
  if (result === true) core.push(c);
  else if (result === "candidate") tier3Candidates.push(c);
}

// Add top tier-3 early-career companies up to TARGET total
const TARGET = 950;
const slots = Math.max(0, TARGET - core.length);
const extra = tier3Candidates
  .sort((a, b) => b._score - a._score || a.name.localeCompare(b.name))
  .slice(0, slots);

const refined = [...core, ...extra].sort((a, b) => {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.earlyCareerVerified !== b.earlyCareerVerified)
    return a.earlyCareerVerified ? -1 : 1;
  return a.name.localeCompare(b.name);
});

writeFileSync(OUT, toYaml(refined));
writeFileSync(join(ROOT, "data", "target-companies-priority.yaml"), toYaml(refined));

// Stats
const byAts = {};
const byCategory = {};
const byTier = {};
let earlyCareer = 0;
let ghFleet = 0;
for (const c of refined) {
  byAts[c.ats] = (byAts[c.ats] || 0) + 1;
  byCategory[c.category] = (byCategory[c.category] || 0) + 1;
  byTier[c.tier] = (byTier[c.tier] || 0) + 1;
  if (c.earlyCareerVerified) earlyCareer++;
  if (c.greenhouseFleet) ghFleet++;
}

console.log(`\nRefined: ${refined.length} companies → ${OUT}\n`);
console.log("By ATS:", byAts);
console.log("By tier:", byTier);
console.log(`Early-career verified: ${earlyCareer}`);
console.log(`Greenhouse fleet: ${ghFleet}`);
console.log(
  "Top categories:",
  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, v]) => `${k}(${v})`)
    .join(", ")
);

// ATS breakdown for expansion planning
const workday = refined.filter((c) => c.ats === "workday");
const ashby = refined.filter((c) => c.ats === "ashby");
const custom = refined.filter((c) => c.ats === "custom");
console.log(`\nExpansion targets:`);
console.log(`  Workday (${workday.length}): ${workday.slice(0, 8).map((c) => c.name).join(", ")}...`);
console.log(`  Ashby (${ashby.length}): ${ashby.map((c) => c.name).join(", ")}`);
console.log(`  Custom (${custom.length}): ${custom.slice(0, 8).map((c) => c.name).join(", ")}...`);
