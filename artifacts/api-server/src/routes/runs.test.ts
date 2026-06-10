import { describe, it, expect } from "vitest";
import {
  shapeRun,
  shapeRunsList,
  shapeTrigger,
  type UpstreamGraphRun,
  type UpstreamTrigger,
} from "./runs";

// A GraphRun row shaped exactly like apex-gtm-api GET /api/graph/runs returns
// (GraphService.listGraphRuns → GraphRun[] with the snapshotPublicState `state`).
const completedRun: UpstreamGraphRun = {
  id: "gr_1",
  graphName: "pipeline-supervisor",
  status: "COMPLETED",
  state: {
    stagesCompleted: ["supervisor", "sourcing", "scoring"],
    counts: { companies: 40, people: 120, scored: 25, outreach: 8 },
    approvedBy: "user_42",
  },
  approvedBy: "user_42",
  startedAt: "2026-06-10T10:00:00.000Z",
  completedAt: "2026-06-10T10:05:00.000Z",
};

describe("shapeRun", () => {
  it("maps a completed GraphRun row to the openapi GraphRun schema", () => {
    expect(shapeRun(completedRun)).toEqual({
      id: "gr_1",
      status: "COMPLETED",
      agentsInvolved: ["supervisor", "sourcing", "scoring"],
      leadsSourced: 25,
      artifactsGenerated: 8,
      durationMs: 5 * 60 * 1000,
      costUsd: 0,
      triggeredBy: "user_42",
      startedAt: "2026-06-10T10:00:00.000Z",
      completedAt: "2026-06-10T10:05:00.000Z",
    });
  });

  it("maps CANCELLED → FAILED (openapi enum omits CANCELLED)", () => {
    const r: UpstreamGraphRun = { ...completedRun, status: "CANCELLED" };
    expect(shapeRun(r).status).toBe("FAILED");
  });

  it("derives duration from now for an in-flight run and falls back to the supervisor roster", () => {
    const now = Date.parse("2026-06-10T10:03:00.000Z");
    const running: UpstreamGraphRun = {
      id: "gr_2",
      status: "RUNNING",
      state: { counts: { companies: 5 } },
      startedAt: "2026-06-10T10:00:00.000Z",
      completedAt: null,
    };
    const out = shapeRun(running, now);
    expect(out.durationMs).toBe(3 * 60 * 1000);
    expect(out.completedAt).toBeNull();
    // no scored count → falls back to companies; no stagesCompleted → full roster
    expect(out.leadsSourced).toBe(5);
    expect(out.artifactsGenerated).toBe(0);
    expect(out.agentsInvolved).toEqual([
      "supervisor",
      "sourcing",
      "enrichment",
      "scoring",
      "outreach",
    ]);
    // no approvedBy anywhere → "system"
    expect(out.triggeredBy).toBe("system");
  });
});

describe("shapeRunsList", () => {
  it("wraps the bare GraphRun[] in the PaginatedRuns envelope", () => {
    const out = shapeRunsList([completedRun], { page: 1, limit: 20 });
    expect(out.total).toBe(1);
    expect(out.page).toBe(1);
    expect(out.limit).toBe(20);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].id).toBe("gr_1");
  });

  it("post-filters by status when provided", () => {
    const running: UpstreamGraphRun = {
      id: "gr_3",
      status: "RUNNING",
      startedAt: "2026-06-10T11:00:00.000Z",
      completedAt: null,
    };
    const out = shapeRunsList([completedRun, running], {
      page: 1,
      limit: 20,
      status: "RUNNING",
    });
    expect(out.items.map((i) => i.id)).toEqual(["gr_3"]);
    expect(out.total).toBe(1);
  });
});

describe("shapeTrigger", () => {
  it("maps an enqueued pipeline/run response to TriggerResult", () => {
    const upstream: UpstreamTrigger = {
      message: "Pipeline graph started for 1 ICP profile(s)",
      graphRunId: "gr_new",
    };
    expect(shapeTrigger(upstream)).toEqual({
      runId: "gr_new",
      queued: true,
      message: "Pipeline graph started for 1 ICP profile(s)",
    });
  });

  it("reports queued=false with empty runId when the graph did not start", () => {
    const upstream: UpstreamTrigger = {
      message: "Pipeline could not start: already running",
      graphRunId: null,
    };
    expect(shapeTrigger(upstream)).toEqual({
      runId: "",
      queued: false,
      message: "Pipeline could not start: already running",
    });
  });
});
