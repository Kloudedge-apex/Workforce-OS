import { describe, it, expect } from "vitest";
import { computeDelta } from "./Today";

describe("computeDelta", () => {
  it("returns a signed positive label and up direction on growth", () => {
    expect(computeDelta(20, 18)).toEqual({ label: "+11%", direction: "up" });
  });

  it("returns a negative label and down direction on decline", () => {
    expect(computeDelta(15, 18)).toEqual({ label: "-17%", direction: "down" });
  });

  it("returns 0% and flat when unchanged", () => {
    expect(computeDelta(18, 18)).toEqual({ label: "0%", direction: "flat" });
  });

  it("guards divide-by-zero: positive current reads +100%", () => {
    expect(computeDelta(5, 0)).toEqual({ label: "+100%", direction: "up" });
  });

  it("guards divide-by-zero: zero current reads 0% flat", () => {
    expect(computeDelta(0, 0)).toEqual({ label: "0%", direction: "flat" });
  });

  it("guards non-finite inputs to 0", () => {
    expect(computeDelta(NaN, 18)).toEqual({ label: "-100%", direction: "down" });
  });

  it("rounds fractional rate deltas to whole percent", () => {
    // 0.18 -> 0.22 is +22.2%, rounds to +22%
    expect(computeDelta(0.22, 0.18)).toEqual({ label: "+22%", direction: "up" });
  });
});
