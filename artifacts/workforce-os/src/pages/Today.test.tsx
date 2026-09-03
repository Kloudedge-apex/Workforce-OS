import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GraphRun } from "@workspace/api-client-react";
import { summarizeRunStatuses, TodayLayout, TodayRunAction } from "./Today";

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

describe("TodayLayout", () => {
  it("keeps the approval queue before the overview rail in source order", () => {
    const html = renderToStaticMarkup(
      <TodayLayout
        approvalQueue={<div>Draft requiring review</div>}
        overviewRail={<div>KPIs and activity</div>}
      />,
    );

    const approvalIndex = html.indexOf('data-testid="pending-approval-panel"');
    const overviewIndex = html.indexOf('data-testid="today-overview-rail"');

    expect(approvalIndex).toBeGreaterThanOrEqual(0);
    expect(overviewIndex).toBeGreaterThan(approvalIndex);
    expect(html).toContain('aria-label="Pending approval queue"');
    expect(html).toContain('aria-label="Today overview"');
    expect(html).not.toContain("<main");
  });
});

describe("TodayRunAction", () => {
  const handlers = {
    onOpenRun: () => undefined,
    onOpenRuns: () => undefined,
    onStart: () => undefined,
  };

  it("surfaces a blocking approval before offering another run", () => {
    const html = renderToStaticMarkup(
      <TodayRunAction
        {...handlers}
        awaitingRunId="run_waiting"
        runningRunId={null}
        isLoading={false}
        isError={false}
        isStarting={false}
        workflowCapability={true}
      />,
    );
    expect(html).toContain("A pipeline run needs approval");
    expect(html).toContain("Review run");
    expect(html).not.toContain(">Start run<");
  });

  it("offers a start action only when no run is active", () => {
    const html = renderToStaticMarkup(
      <TodayRunAction
        {...handlers}
        awaitingRunId={null}
        runningRunId={null}
        isLoading={false}
        isError={false}
        isStarting={false}
        workflowCapability={true}
      />,
    );
    expect(html).toContain("Ready for the next pipeline run");
    expect(html).toContain("Start run");
  });

  it("keeps run start disabled for a regular workspace member", () => {
    const html = renderToStaticMarkup(
      <TodayRunAction
        {...handlers}
        awaitingRunId={null}
        runningRunId={null}
        isLoading={false}
        isError={false}
        isStarting={false}
        workflowCapability={false}
      />,
    );
    expect(html).toContain("Run start restricted");
    expect(html).toContain("Admin or manager required");
    expect(html).toContain("disabled");
  });
});
