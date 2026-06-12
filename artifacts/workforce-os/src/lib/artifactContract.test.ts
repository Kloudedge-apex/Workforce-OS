import { describe, it, expect } from "vitest";
import {
  getArtifactRefusal,
  isRefusedArtifact,
  uiCitations,
  citedCount,
  type UiFactCitation,
} from "./artifactContract";

describe("getArtifactRefusal", () => {
  it("surfaces a real refusal with its reason", () => {
    const artifact = {
      refusal: { refused: true, reason: "No dated trigger (missing: funding_event, hiring_signal)" },
    };
    expect(getArtifactRefusal(artifact)).toEqual({
      refused: true,
      reason: "No dated trigger (missing: funding_event, hiring_signal)",
    });
    expect(isRefusedArtifact(artifact)).toBe(true);
  });

  it("treats refused: false as not refused but still surfaces the envelope", () => {
    const artifact = { refusal: { refused: false, reason: null } };
    expect(getArtifactRefusal(artifact)).toEqual({ refused: false, reason: null });
    expect(isRefusedArtifact(artifact)).toBe(false);
  });

  it("normalizes a blank reason to null", () => {
    expect(getArtifactRefusal({ refusal: { refused: true, reason: "   " } })).toEqual({
      refused: true,
      reason: null,
    });
  });

  it("returns null for artifacts without a refusal field (lagging client)", () => {
    expect(getArtifactRefusal({ id: "a1", status: "PENDING_REVIEW" })).toBeNull();
    expect(isRefusedArtifact({ id: "a1" })).toBe(false);
  });

  it("degrades malformed shapes to 'not refused' instead of crashing", () => {
    expect(getArtifactRefusal(null)).toBeNull();
    expect(getArtifactRefusal(undefined)).toBeNull();
    expect(getArtifactRefusal("nope")).toBeNull();
    expect(getArtifactRefusal({ refusal: "yes" })).toBeNull();
    expect(getArtifactRefusal({ refusal: ["refused"] })).toBeNull();
    expect(getArtifactRefusal({ refusal: { refused: "true", reason: "x" } })).toBeNull();
    expect(isRefusedArtifact({ refusal: { reason: "missing refused flag" } })).toBe(false);
  });
});

describe("uiCitations / citedCount", () => {
  const base = { factId: "f1", claim: "Raised Series A", source: "techcrunch.com" };

  it("passes through citations and preserves cited/date wire fields", () => {
    const wire: UiFactCitation[] = [
      { ...base, cited: true, date: "2026-05-01" },
      { factId: "f2", claim: "Hiring SDRs", source: "linkedin.com" },
    ];
    const cites = uiCitations(wire);
    expect(cites).toHaveLength(2);
    expect(cites[0].cited).toBe(true);
    expect(cites[0].date).toBe("2026-05-01");
    expect(cites[1].cited).toBeUndefined();
  });

  it("returns [] for null/undefined citation lists", () => {
    expect(uiCitations(null)).toEqual([]);
    expect(uiCitations(undefined)).toEqual([]);
  });

  it("counts only citations explicitly marked cited", () => {
    const wire: UiFactCitation[] = [
      { ...base, cited: true },
      { ...base, factId: "f2", cited: false },
      { ...base, factId: "f3" },
    ];
    expect(citedCount(wire)).toBe(1);
    expect(citedCount([])).toBe(0);
    expect(citedCount(null)).toBe(0);
  });
});
