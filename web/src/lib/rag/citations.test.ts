import { describe, expect, it } from "vitest";
import { splitGroupedCitations } from "./citations";

describe("splitGroupedCitations", () => {
  it("splits grouped markers into single ones", () => {
    expect(splitGroupedCitations("fees are due [S2, S5]. Also [S1; S3; S4].")).toBe("fees are due [S2][S5]. Also [S1][S3][S4].");
  });
  it("leaves single markers and other brackets alone", () => {
    expect(splitGroupedCitations("one [S1] and [CA-VEH-REG] and [see S2]")).toBe("one [S1] and [CA-VEH-REG] and [see S2]");
  });
});
