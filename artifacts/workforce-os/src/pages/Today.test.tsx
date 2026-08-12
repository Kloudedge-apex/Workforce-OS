import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TodayLayout } from "./Today";

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
