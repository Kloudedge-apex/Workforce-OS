import { describe, expect, it } from "vitest";
import type { GraphRun } from "@workspace/api-client-react";
import { summarizeRunStatuses } from "./Today";

describe("summarizeRunStatuses", () => {
  it("builds the dashboard chart from measured run statuses", () => {
    const runs = [
      { status: "COMPLETED" },
      { status: "COMPLETED" },
      { status: "RUNNING" },
      { status: "AWAITING_APPROVAL" },
    ] as GraphRun[];

    expect(
      summarizeRunStatuses(runs).map(({ label, count }) => ({ label, count })),
    ).toEqual([
      { label: "Completed", count: 2 },
      { label: "Running", count: 1 },
      { label: "Needs review", count: 1 },
      { label: "Failed", count: 0 },
    ]);
  });
});
