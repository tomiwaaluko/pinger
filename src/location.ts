const US_COUNTRY = /\b(?:united states|usa|u\.s\.a\.|u\.s\.)\b/i;
const STANDALONE_US = /(?:^|[^a-z])us(?:[^a-z]|$)/i;

const STATE_NAMES = [
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
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

const US_METROS = [
  "san francisco","sf","bay area","new york","nyc","new york city","seattle",
  "austin","boston","chicago","los angeles","la","denver","atlanta","miami",
  "dallas","houston","phoenix","san diego","san jose","portland","philadelphia",
  "minneapolis","detroit","salt lake city","raleigh","durham","pittsburgh",
  "washington dc","washington d.c.","arlington","brooklyn","manhattan",
  "redmond","cupertino","mountain view","palo alto","menlo park","sunnyvale",
] as const;

function hasWholePhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

export function isUsLocation(location: string): boolean {
  const raw = location.trim();
  if (!raw) return false;
  const normalized = raw.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  if (/^(remote|remote work|anywhere)$/i.test(normalized)) return false;
  if (US_COUNTRY.test(normalized) || STANDALONE_US.test(normalized)) return true;
  if (STATE_NAMES.some((s) => hasWholePhrase(normalized, s))) return true;
  if (STATE_ABBR.some((s) => hasWholePhrase(normalized, s))) return true;
  if (US_METROS.some((s) => hasWholePhrase(normalized, s))) return true;
  return false;
}
