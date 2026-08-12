import { describe, expect, it } from "vitest";
import {
  artifactApprovalEligibility,
  artifactReviewAccess,
} from "./artifactApproval";

function eligibleArtifact(overrides: Record<string, unknown> = {}) {
  return {
    status: "PENDING_REVIEW",
    channel: "EMAIL",
    purpose: "OUTBOUND",
    refusal: { refused: false, reason: null },
    subject: "A grounded subject",
    bodyText: "A grounded body.",
    bodyHtml: "<p>A secondary HTML representation.</p>",
    citations: [
      {
        factId: "fact_1",
        claim: "Acme is hiring sales engineers",
        source: "https://acme.example/jobs",
        cited: true,
      },
    ],
    approvalEligibility: { eligible: true, reason: null },
    ...overrides,
  };
}

describe("artifactApprovalEligibility", () => {
  it("allows only a complete, grounded, pending email artifact", () => {
    expect(artifactApprovalEligibility(eligibleArtifact())).toEqual({
      eligible: true,
      code: null,
      reason: null,
    });
  });

  it.each([
    ["status", { status: "DRAFT" }],
    ["channel", { channel: "LINKEDIN" }],
    ["purpose", { purpose: undefined }],
    ["refused", { refusal: { refused: true, reason: "No dated evidence" } }],
    ["refusal_unverified", { refusal: undefined }],
    ["subject", { subject: " \u200B " }],
    ["body", { bodyText: " \u200B " }],
    [
      "grounding",
      {
        citations: [
          {
            factId: "fact_1",
            claim: "Acme is hiring",
            source: "https://acme.example/jobs",
            cited: false,
          },
        ],
      },
    ],
  ] as const)("fails closed with a specific %s reason", (code, overrides) => {
    const result = artifactApprovalEligibility(eligibleArtifact(overrides));
    expect(result.eligible).toBe(false);
    expect(result.code).toBe(code);
    expect(result.reason).toMatch(/^Approval is (available only|unavailable)/);
  });

  it.each(["REPLY", "FOLLOW_UP"] as const)(
    "allows a citation-free %s when server payload validation passed",
    (purpose) => {
      expect(
        artifactApprovalEligibility(
          eligibleArtifact({ purpose, citations: [], refusal: undefined }),
        ),
      ).toEqual({ eligible: true, code: null, reason: null });
    },
  );

  it("surfaces an authoritative server validation failure", () => {
    const reason =
      "Artifact cannot be approved until all draft quality checks pass";
    expect(
      artifactApprovalEligibility(
        eligibleArtifact({
          approvalEligibility: { eligible: false, reason },
        }),
      ),
    ).toEqual({ eligible: false, code: "server_validation", reason });
  });

  it("fails closed when server validation is absent or malformed", () => {
    expect(
      artifactApprovalEligibility(
        eligibleArtifact({ approvalEligibility: undefined }),
      ),
    ).toMatchObject({ eligible: false, code: "server_validation" });
    expect(
      artifactApprovalEligibility(
        eligibleArtifact({ approvalEligibility: { eligible: "yes" } }),
      ),
    ).toMatchObject({ eligible: false, code: "server_validation" });
  });

  it("requires the explicitly cited fact to be visible and attributable", () => {
    for (const citation of [
      { factId: "", claim: "Acme is hiring", source: "jobs", cited: true },
      { factId: "f1", claim: "   ", source: "jobs", cited: true },
      { factId: "f1", claim: "Acme is hiring", source: " ", cited: true },
      {
        factId: "f1",
        claim: "Acme is hiring",
        source: "jobs",
        cited: undefined,
      },
    ]) {
      expect(
        artifactApprovalEligibility(
          eligibleArtifact({ citations: [citation] }),
        ),
      ).toMatchObject({ eligible: false, code: "grounding" });
    }
  });

  it("reviews provider-bound bodyText literally instead of interpreting it as HTML", () => {
    expect(
      artifactApprovalEligibility(
        eligibleArtifact({ bodyText: "<script>alert('send')</script>" }),
      ),
    ).toMatchObject({ eligible: true });
    expect(
      artifactApprovalEligibility(
        eligibleArtifact({ bodyText: "Hello <team>" }),
      ),
    ).toMatchObject({ eligible: true });
  });

  it("fails closed for a malformed artifact instead of throwing", () => {
    expect(artifactApprovalEligibility(null)).toMatchObject({
      eligible: false,
      code: "status",
    });
    expect(artifactApprovalEligibility({})).toMatchObject({
      eligible: false,
      code: "status",
    });
  });
});

describe("artifactReviewAccess", () => {
  it("enables actions only for the exact backend-confirmed capability", () => {
    expect(artifactReviewAccess(true)).toEqual({ allowed: true, reason: null });
    expect(artifactReviewAccess(false)).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("role cannot approve or reject"),
    });
  });

  it("fails closed with capability-unavailable copy for missing or malformed values", () => {
    for (const value of [null, undefined, "true", 1, {}]) {
      expect(artifactReviewAccess(value)).toMatchObject({
        allowed: false,
        reason: expect.stringContaining("capability is unavailable"),
      });
    }
  });
});
