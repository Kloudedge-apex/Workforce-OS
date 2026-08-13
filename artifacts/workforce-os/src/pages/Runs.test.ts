import { describe, it, expect } from "vitest";
import { runStatusBadge } from "./Runs";
import { describeTriggerError } from "@/lib/runTrigger";

describe("runStatusBadge", () => {
  it("gives AWAITING_APPROVAL a distinct filled 'Needs approval' badge", () => {
    const badge = runStatusBadge("AWAITING_APPROVAL");
    expect(badge.label).toBe("Needs approval");
    expect(badge.className).toContain("bg-rust-500");
    expect(badge.className).toContain("text-white");
  });

  it("keeps the soft styles for the other statuses", () => {
    expect(runStatusBadge("COMPLETED")).toEqual({
      label: "COMPLETED",
      className: "bg-green-100 text-green-800 border-green-200",
    });
    expect(runStatusBadge("RUNNING").label).toBe("RUNNING");
    expect(runStatusBadge("FAILED").className).toContain("bg-red-100");
  });

  it("falls back to the muted style for unknown statuses and de-underscores the label", () => {
    const badge = runStatusBadge("SOME_NEW_STATUS");
    expect(badge.label).toBe("SOME NEW STATUS");
    expect(badge.className).toBe("bg-paper-100 text-ink-600");
  });
});

// Matches the shape the generated client throws: an ApiError carrying the BFF
// 409 passthrough body { runId: "", queued: false, message } in `.data`.
function apiError(status: number, message?: string): unknown {
  const err = new Error(message ?? `HTTP ${status}`);
  return Object.assign(err, {
    status,
    data: message !== undefined ? { runId: "", queued: false, message } : null,
  });
}

describe("describeTriggerError", () => {
  it("parses the awaiting-approval single-flight 409 and points at the blocking run", () => {
    const err = apiError(
      409,
      "A pipeline graph is already awaiting_approval for this org (runId=gr_blocked)",
    );
    const t = describeTriggerError(err, []);
    expect(t.title).toBe("A run is awaiting your approval");
    expect(t.description).toContain("Approve or reject");
    expect(t.goToRunId).toBe("gr_blocked");
  });

  it("reports an in-progress (running) conflict verbatim with a link to the run", () => {
    const message = "A pipeline graph is already running for this org (runId=gr_live)";
    const t = describeTriggerError(apiError(409, message), [
      // an awaiting row in the list must NOT override the explicit message
      { id: "gr_other", status: "AWAITING_APPROVAL" },
    ]);
    expect(t.title).toBe("A run is already in progress");
    expect(t.description).toBe(message);
    expect(t.goToRunId).toBe("gr_live");
  });

  it("falls back to the loaded list when the 409 message has no runId", () => {
    const t = describeTriggerError(apiError(409, "Conflict"), [
      { id: "gr_done", status: "COMPLETED" },
      { id: "gr_wait", status: "AWAITING_APPROVAL" },
    ]);
    expect(t.title).toBe("A run is awaiting your approval");
    expect(t.goToRunId).toBe("gr_wait");
  });

  it("stays generic-but-actionable for a bare 409 with no message and no awaiting row", () => {
    const t = describeTriggerError(apiError(409), [{ id: "gr_live", status: "RUNNING" }]);
    expect(t.title).toBe("A run is already in progress");
    expect(t.description).toBe("Wait for the current run to finish before starting another.");
    expect(t.goToRunId).toBeNull();
  });

  it("surfaces non-conflict errors with their own message and no link", () => {
    const t = describeTriggerError(new Error("Network down"), []);
    expect(t.title).toBe("Failed to start run");
    expect(t.description).toBe("Network down");
    expect(t.goToRunId).toBeNull();
  });

  it("handles a completely unknown error shape", () => {
    const t = describeTriggerError(undefined, []);
    expect(t.title).toBe("Failed to start run");
    expect(t.description).toBeUndefined();
    expect(t.goToRunId).toBeNull();
  });
});
