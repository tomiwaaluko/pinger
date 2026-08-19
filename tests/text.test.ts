import { describe, expect, it } from "vitest";
import { stripJobHtml, truncate } from "../src/text.js";

describe("truncate", () => {
  it("leaves short text alone and cuts long text", () => {
    expect(truncate("abc", 5)).toBe("abc");
    expect(truncate("abcdefghij", 4)).toBe("abcd");
  });
});

describe("stripJobHtml", () => {
  it("decodes Greenhouse entity-encoded HTML and strips tags", () => {
    expect(stripJobHtml("&lt;p&gt;Hello &amp; welcome&lt;/p&gt;")).toBe(
      "Hello & welcome",
    );
  });
});
