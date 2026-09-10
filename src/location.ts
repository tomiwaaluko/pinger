const US_COUNTRY = /\b(?:united states|usa|u\.s\.a\.|u\.s\.)\b/i;
const STANDALONE_US = /(?:^|[^a-z])us(?:[^a-z]|$)/i;

const STATE_NAMES = [
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","hawaii","idaho","illinois","indiana","iowa",
  "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
  "minnesota","mississippi","missouri","montana","nebraska","nevada",
  "new hampshire","new jersey","new mexico","new york","north carolina",
  "north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island",
  "south carolina","south dakota","tennessee","texas","utah","vermont",
  "virginia","washington","west virginia","wisconsin","wyoming","district of columbia",
] as const;

const STATE_ABBR = [
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia",
  "ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
  "nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt",
  "va","wa","wv","wi","wy","dc",
] as const;

/** Abbreviations that overlap ISO country codes or common English words. */
const AMBIGUOUS_STATE_ABBR = new Set(["de", "or", "in", "la"]);

/** Cities commonly paired with an international country code, not a US state. */
const INTL_CITY_BLOCKLIST: Partial<Record<(typeof STATE_ABBR)[number], readonly string[]>> = {
  de: [
    "berlin", "munich", "hamburg", "frankfurt", "cologne", "koln", "dusseldorf",
    "stuttgart", "leipzig", "dresden", "hanover", "nuremberg", "bonn",
  ],
  in: [
    "bangalore", "bengaluru", "mumbai", "delhi", "new delhi", "hyderabad",
    "chennai", "kolkata", "pune", "gurgaon", "noida",
  ],
};

const US_METROS = [
  "san francisco","sf","bay area","new york","nyc","new york city","seattle",
  "austin","boston","chicago","los angeles","denver","atlanta","miami",
  "dallas","houston","phoenix","san diego","san jose","portland","philadelphia",
  "minneapolis","detroit","salt lake city","raleigh","durham","pittsburgh",
  "washington dc","washington d.c.","arlington","brooklyn","manhattan",
  "redmond","cupertino","mountain view","palo alto","menlo park","sunnyvale",
] as const;

function hasWholePhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

function hasPostalStateAbbr(haystack: string, abbr: string): boolean {
  const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`,\\s*${escaped}\\b`, "i").test(haystack);
}

function cityBeforePostalAbbr(haystack: string, abbr: string): string | null {
  const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = haystack.match(new RegExp(`([^,]+),\\s*${escaped}\\b`, "i"));
  return match ? match[1].trim().toLowerCase() : null;
}

function hasUsStateAbbr(haystack: string, abbr: string): boolean {
  if (!hasPostalStateAbbr(haystack, abbr)) return false;

  if (!AMBIGUOUS_STATE_ABBR.has(abbr)) return true;

  const blockedCities = INTL_CITY_BLOCKLIST[abbr as keyof typeof INTL_CITY_BLOCKLIST];
  if (!blockedCities) return true;

  const city = cityBeforePostalAbbr(haystack, abbr);
  if (!city) return true;

  return !blockedCities.some((blocked) => hasWholePhrase(city, blocked));
}

function hasGeorgiaUsContext(haystack: string): boolean {
  if (!hasWholePhrase(haystack, "georgia")) return false;
  if (hasPostalStateAbbr(haystack, "ga")) return true;
  if (/\bgeorgia,\s*(?:us|usa|u\.s\.)\b/i.test(haystack)) return true;
  if (hasWholePhrase(haystack, "atlanta")) return true;
  return false;
}

export function isUsLocation(location: string): boolean {
  const raw = location.trim();
  if (!raw) return false;
  const normalized = raw.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  if (/^(remote|remote work|anywhere)$/i.test(normalized)) return false;
  if (US_COUNTRY.test(normalized) || STANDALONE_US.test(normalized)) return true;
  if (STATE_NAMES.some((s) => hasWholePhrase(normalized, s))) return true;
  if (STATE_ABBR.some((s) => hasUsStateAbbr(normalized, s))) return true;
  if (hasGeorgiaUsContext(normalized)) return true;
  if (US_METROS.some((s) => hasWholePhrase(normalized, s))) return true;
  return false;
}
