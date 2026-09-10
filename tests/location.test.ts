import { describe, expect, it } from "vitest";
import { isUsLocation } from "../src/location.js";

describe("isUsLocation", () => {
  it.each([
    ["San Francisco, CA", true],
    ["Remote - United States", true],
    ["US Remote", true],
    ["New York, NY; London, UK", true],
    ["Seattle, Washington", true],
    ["Austin, TX", true],
    ["", false],
    ["   ", false],
    ["Remote", false],
    ["Remote work", false],
    ["Anywhere", false],
    ["London, UK", false],
    ["Washington, UK", false],
    ["Portland, UK", false],
    ["Bangalore, India", false],
    ["Toronto, Canada", false],
    ["Tbilisi, Georgia", false],
    ["Berlin, DE", false],
    ["Paris or London", false],
    ["La Rochelle, France", false],
    ["Atlanta, GA", true],
    ["Los Angeles, CA", true],
    ["San Francisco, CA; London, UK", true],
    ["Remote - United Kingdom", false],
  ])("%j → %s", (location, expected) => {
    expect(isUsLocation(location)).toBe(expected);
  });
});
