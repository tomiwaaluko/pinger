import { describe, expect, it } from "vitest";
import { resolveLogoThumbnailUrl } from "../src/logo.js";

describe("resolveLogoThumbnailUrl", () => {
  it("prefers explicit logoUrl over domain", () => {
    expect(
      resolveLogoThumbnailUrl({
        logoUrl: "https://cdn.example/a.png",
        domain: "stripe.com",
      }),
    ).toBe("https://cdn.example/a.png");
  });

  it("builds Google favicon CDN URL from domain", () => {
    expect(resolveLogoThumbnailUrl({ domain: "stripe.com" })).toBe(
      "https://www.google.com/s2/favicons?sz=128&domain=stripe.com",
    );
  });

  it("returns undefined when neither logoUrl nor domain is set", () => {
    expect(resolveLogoThumbnailUrl({})).toBeUndefined();
  });
});
