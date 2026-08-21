import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TodayLayout, TodayRunAction } from "./Today";

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
