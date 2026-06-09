import { describe, it, expect } from "vitest";
import { formatValue } from "./CountUp";

describe("formatValue", () => {
  it("formats an integer with no decimals", () => {
    expect(formatValue(42)).toBe("42");
  });

  it("rounds to the requested number of decimals", () => {
    expect(formatValue(3.14159, 2)).toBe("3.14");
    expect(formatValue(2.5, 0)).toBe("3"); // toFixed rounds half-up
  });

  it("appends a suffix", () => {
    expect(formatValue(87.5, 1, "%")).toBe("87.5%");
  });

  it("pads trailing zeros to match decimals", () => {
    expect(formatValue(5, 2)).toBe("5.00");
  });

  it("coerces non-finite input to 0", () => {
    expect(formatValue(Number.NaN, 1, "%")).toBe("0.0%");
    expect(formatValue(Number.POSITIVE_INFINITY)).toBe("0");
  });

  it("handles negatives", () => {
    expect(formatValue(-2.5, 1)).toBe("-2.5");
  });
});
