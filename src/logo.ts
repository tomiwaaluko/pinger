export function resolveLogoThumbnailUrl(input: {
  domain?: string;
  logoUrl?: string;
}): string | undefined {
  if (input.logoUrl) return input.logoUrl;
  if (input.domain) {
    return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(input.domain)}`;
  }
  return undefined;
}
