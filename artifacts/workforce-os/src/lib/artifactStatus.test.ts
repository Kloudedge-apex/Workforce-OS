import { describe, it, expect } from "vitest";
import {
  ARTIFACT_STATUS_BADGES,
  artifactStatusBadge,
  isTerminalArtifactStatus,
} from "./artifactStatus";

describe("artifactStatusBadge", () => {
  it("keeps SENT meaning actually-sent (green, plain 'Sent')", () => {
    const badge = artifactStatusBadge("SENT");
    expect(badge.label).toBe("Sent");
    expect(badge.className).toContain("signal-positive");
  });

  it("renders SIMULATED as a distinct amber dry-run badge, never 'Sent'", () => {
    const badge = artifactStatusBadge("SIMULATED");
    expect(badge.label).toBe("Simulated (dry-run)");
    expect(badge.className).toContain("ember");
    expect(badge.className).not.toContain("signal-positive");
    expect(badge.label).not.toBe("Sent");
  });

  it("renders SENDING as in-flight, not sent", () => {
    const badge = artifactStatusBadge("SENDING");
    expect(badge.label).toBe("Sending…");
    expect(badge.className).not.toContain("signal-positive");
  });

  it("quarantines DELIVERY_UNKNOWN without claiming delivery or retryability", () => {
    const badge = artifactStatusBadge("DELIVERY_UNKNOWN");
    expect(badge.label).toContain("Delivery unknown");
    expect(badge.label).toContain("reconcile");
    expect(badge.label).not.toBe("Sent");
    expect(badge.className).not.toContain("signal-positive");
  });

  it("labels APPROVED as queued, not delivered", () => {
    expect(artifactStatusBadge("APPROVED").label).toBe(
      "Approved — queued to send",
    );
  });

  it("renders FAILED as terminal no-delivery truth, distinct from rejection", () => {
    const badge = artifactStatusBadge("FAILED");
    expect(badge.label).toBe("Failed — no delivery");
    expect(badge.label).not.toContain("Rejected");
    expect(badge.label).not.toBe("Sent");
    expect(isTerminalArtifactStatus("FAILED")).toBe(true);
    expect(isTerminalArtifactStatus("REJECTED")).toBe(true);
    expect(isTerminalArtifactStatus("APPROVED")).toBe(false);
    expect(isTerminalArtifactStatus("SENDING")).toBe(false);
  });

  it("renders historical ambiguity as terminal reconciliation, not rejection", () => {
    const badge = artifactStatusBadge("RECONCILIATION_REQUIRED");
    expect(badge.label).toBe("Unclassified — reconcile history");
    expect(badge.label).not.toContain("Rejected");
    expect(badge.label).not.toContain("Failed");
    expect(badge.className).toContain("ember");
    expect(isTerminalArtifactStatus("RECONCILIATION_REQUIRED")).toBe(true);
  });

  it("humanizes unknown statuses with a neutral badge instead of crashing", () => {
    const badge = artifactStatusBadge("SOME_NEW_STATUS");
    expect(badge.label).toBe("SOME NEW STATUS");
    expect(badge.className).toContain("paper");
  });

  it("covers every declared UI status with a non-empty label", () => {
    for (const [status, badge] of Object.entries(ARTIFACT_STATUS_BADGES)) {
      expect(badge.label.length, `label for ${status}`).toBeGreaterThan(0);
      expect(badge.className.length, `className for ${status}`).toBeGreaterThan(
        0,
      );
    }
  });
});
