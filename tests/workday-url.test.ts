import { describe, expect, it } from "vitest";
import { parseWorkdayCareersUrl } from "../src/adapters/workday-url.js";

describe("parseWorkdayCareersUrl", () => {
  it("parses boeing careers URL", () => {
    expect(
      parseWorkdayCareersUrl(
        "https://boeing.wd1.myworkdayjobs.com/external_subsidiary/job/USA---Maryland/Associate-Software-Engineer_JR2026516706",
      ),
    ).toEqual({
      host: "boeing.wd1.myworkdayjobs.com",
      tenant: "boeing",
      site: "external_subsidiary",
    });
  });

  it("strips en-US locale segment", () => {
    expect(
      parseWorkdayCareersUrl(
        "https://disney.wd5.myworkdayjobs.com/en-US/disneycareer/job/Glendale-CA-USA/Software-Engineer-I_10158076",
      ).site,
    ).toBe("disneycareer");
  });

  it("parses expedia search site", () => {
    expect(
      parseWorkdayCareersUrl(
        "https://expedia.wd108.myworkdayjobs.com/search/job/Seattle/Engineer_R-123",
      ),
    ).toEqual({
      host: "expedia.wd108.myworkdayjobs.com",
      tenant: "expedia",
      site: "search",
    });
  });
});
