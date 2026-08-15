type IneligibilityCode =
  | "status"
  | "channel"
  | "purpose"
  | "refused"
  | "refusal_unverified"
  | "subject"
  | "body"
  | "grounding"
  | "server_validation";

export type ArtifactApprovalEligibility =
  | { eligible: true; code: null; reason: null }
  | { eligible: false; code: IneligibilityCode; reason: string };

export type ArtifactReviewAccess =
  | { allowed: true; reason: null }
  | { allowed: false; reason: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonblank(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.replace(/[\s\u200B-\u200D\uFEFF]+/g, "").length > 0
  );
}

function hasReviewerVisibleBody(value: unknown): boolean {
  return nonblank(value);
}

function hasReviewerVisibleCitation(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((candidate) => {
    const citation = asRecord(candidate);
    return (
      citation?.["cited"] === true &&
      nonblank(citation["factId"]) &&
      nonblank(citation["claim"]) &&
      nonblank(citation["source"])
    );
  });
}

function unavailable(
  code: IneligibilityCode,
  reason: string,
): ArtifactApprovalEligibility {
  return { eligible: false, code, reason };
}

/**
 * Fail-closed UI gate for the backend's guarded reviewer capability probe.
 * `false` is a known role denial; missing/malformed values are an unavailable
 * capability check. Both are read-only, but the copy distinguishes them.
 */
export function artifactReviewAccess(value: unknown): ArtifactReviewAccess {
  if (value === true) return { allowed: true, reason: null };
  if (value === false) {
    return {
      allowed: false,
      reason:
        "Read-only: your workspace role cannot approve or reject artifacts.",
    };
  }
  return {
    allowed: false,
    reason:
      "Read-only: review capability is unavailable, so approve and reject actions are disabled.",
  };
}

/**
 * Fail-closed approval contract for the guarded SDR release. This helper owns
 * review eligibility for every artifact UI. OUTBOUND drafts require visible
 * grounding; REPLY/FOLLOW_UP artifacts follow the backend's payload-match gate
 * without inventing citations their persistence path does not create.
 */
export function artifactApprovalEligibility(
  artifact: unknown,
): ArtifactApprovalEligibility {
  const row = asRecord(artifact);

  if (row?.["status"] !== "PENDING_REVIEW") {
    return unavailable(
      "status",
      "Approval is available only while the artifact is pending review.",
    );
  }

  if (row["channel"] !== "EMAIL") {
    return unavailable(
      "channel",
      "Approval is unavailable because this release supports email dispatch only.",
    );
  }

  const purpose = row["purpose"];
  if (
    purpose !== "OUTBOUND" &&
    purpose !== "REPLY" &&
    purpose !== "FOLLOW_UP"
  ) {
    return unavailable(
      "purpose",
      "Approval is unavailable because the artifact purpose could not be verified.",
    );
  }

  if (purpose === "OUTBOUND") {
    const refusal = asRecord(row["refusal"]);
    if (refusal?.["refused"] === true) {
      return unavailable(
        "refused",
        "Approval is unavailable because the drafter refused to produce a grounded draft.",
      );
    }
    if (refusal?.["refused"] !== false) {
      return unavailable(
        "refusal_unverified",
        "Approval is unavailable because the drafter refusal state could not be verified.",
      );
    }
  }

  if (!nonblank(row["subject"])) {
    return unavailable(
      "subject",
      "Approval is unavailable because the email subject is blank.",
    );
  }

  if (!hasReviewerVisibleBody(row["bodyText"])) {
    return unavailable(
      "body",
      "Approval is unavailable because the email body is blank.",
    );
  }

  const serverEligibility = asRecord(row["approvalEligibility"]);
  if (serverEligibility?.["eligible"] !== true) {
    const serverReason = serverEligibility?.["reason"];
    return unavailable(
      "server_validation",
      typeof serverReason === "string" && serverReason.trim() !== ""
        ? serverReason
        : "Approval is unavailable because server validation could not be verified.",
    );
  }

  if (purpose === "OUTBOUND" && !hasReviewerVisibleCitation(row["citations"])) {
    return unavailable(
      "grounding",
      "Approval is unavailable because no reviewer-visible fact is explicitly cited.",
    );
  }

  return { eligible: true, code: null, reason: null };
}
