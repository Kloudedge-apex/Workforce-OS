import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Router } from "express";
import { describe, it, expect, vi } from "vitest";
import { createApp } from "../app";
import { UpstreamError } from "../upstream/apex-client";
import {
  createRunDecisionRouter,
  shapeRun,
  shapeRunsList,
  shapeRunDetail,
  shapeRunTimeline,
  shapeTrigger,
  upstreamMessage,
  type RunDecisionUpstreamClient,
  type UpstreamGraphRun,
  type UpstreamTrigger,
} from "./runs";

async function requestDecision(
  router: Router,
  path: string,
  actor?: string,
): Promise<{ status: number; body: unknown }> {
  const app = createApp({
    apiRouter: router,
    clerkGuard: (req, _res, next) => {
      if (actor !== undefined) {
        req.clerkUserId = actor;
      }
      next();
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api${path}`,
      {
        method: "POST",
      },
    );
    const text = await response.text();
    return {
      status: response.status,
      body: text === "" ? null : JSON.parse(text),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("run decision routes", () => {
  it.each(["approve", "reject"] as const)(
    "rejects %s without an authenticated reviewer before calling upstream",
    async (decision) => {
      const post = vi.fn(
        async (..._args: Parameters<RunDecisionUpstreamClient["post"]>) => ({
          status: "resuming",
        }),
      );
      const client = { post } as RunDecisionUpstreamClient;

      const result = await requestDecision(
        createRunDecisionRouter(client),
        `/runs/run_1/${decision}`,
      );

      expect(result).toEqual({
        status: 401,
        body: { error: "authenticated reviewer identity required" },
      });
      expect(post).not.toHaveBeenCalled();
    },
  );

  it.each(["approve", "reject"] as const)(
    "forwards the authenticated reviewer for run %s",
    async (decision) => {
      const post = vi.fn(
        async (..._args: Parameters<RunDecisionUpstreamClient["post"]>) => ({
          status: "resuming",
        }),
      );
      const client = { post } as RunDecisionUpstreamClient;

      const result = await requestDecision(
        createRunDecisionRouter(client),
        `/runs/run_1/${decision}`,
        "user_reviewer",
      );

      expect(result).toEqual({ status: 200, body: { status: "resuming" } });
      expect(post).toHaveBeenCalledOnce();
      expect(post.mock.calls[0]?.[2]).toEqual({ approvedBy: "user_reviewer" });
    },
  );

  it.each(["approve", "reject"] as const)(
    "preserves an upstream role denial for run %s",
    async (decision) => {
      const post = vi.fn(
        async (..._args: Parameters<RunDecisionUpstreamClient["post"]>) => {
          throw new UpstreamError(403, {
            message: "Requires admin or manager role",
          });
        },
      );
      const client = { post } as RunDecisionUpstreamClient;

      const result = await requestDecision(
        createRunDecisionRouter(client),
        `/runs/run_1/${decision}`,
        "user_member",
      );

      expect(result).toEqual({
        status: 403,
        body: { error: "upstream", status: 403 },
      });
      expect(post).toHaveBeenCalledOnce();
    },
  );
});

// A GraphRun row shaped exactly like apex-gtm-api GET /api/graph/runs returns
// (GraphService.listGraphRuns → GraphRun[] with the snapshotPublicState `state`).
const completedRun: UpstreamGraphRun = {
  id: "gr_1",
  graphName: "pipeline-supervisor",
  status: "COMPLETED",
  state: {
    stagesCompleted: ["supervisor", "sourcing", "scoring"],
    stageStatuses: { sourcing: "COMPLETE", scoring: "COMPLETE" },
    counts: { companies: 40, people: 120, scored: 25, outreach: 8 },
    approvedBy: "user_42",
    messages: [
      {
        node: "sourcing_agent",
        ts: "2026-06-10T10:00:10.000Z",
        level: "info",
        text: "sourcing for 1 ICP(s)",
      },
      {
        node: "scoring_agent",
        ts: "2026-06-10T10:03:00.000Z",
        level: "info",
        text: "scoring for 1 ICP(s)",
      },
    ],
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
      stagesCompleted: ["supervisor", "sourcing", "scoring"],
      leadsScored: 25,
      artifactsGenerated: 8,
      durationMs: 5 * 60 * 1000,
      costUsd: null,
      approvedBy: "user_42",
      startedAt: "2026-06-10T10:00:00.000Z",
      completedAt: "2026-06-10T10:05:00.000Z",
    });
  });

  it("preserves a cancelled run instead of misreporting it as failed", () => {
    const r: UpstreamGraphRun = { ...completedRun, status: "CANCELLED" };
    expect(shapeRun(r).status).toBe("CANCELLED");
  });

  it("derives duration from now and leaves unrecorded fields unknown", () => {
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
    // A company count is not a scored-lead count; absent metrics stay unknown.
    expect(out.leadsScored).toBeNull();
    expect(out.artifactsGenerated).toBeNull();
    expect(out.stagesCompleted).toEqual([]);
    expect(out.approvedBy).toBeNull();
    expect(out.costUsd).toBeNull();
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

  it("preserves the real total and server page from a paginated response", () => {
    const out = shapeRunsList(
      {
        items: [completedRun],
        total: 37,
        page: 2,
        limit: 10,
        totalPages: 4,
      },
      { page: 2, limit: 10 },
    );
    expect(out).toMatchObject({ total: 37, page: 2, limit: 10 });
    expect(out.items.map((item) => item.id)).toEqual(["gr_1"]);
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

describe("shapeRunDetail", () => {
  it("wraps the run with its real persisted timeline and approval checkpoint", () => {
    const awaiting: UpstreamGraphRun = {
      id: "gr_hitl",
      status: "AWAITING_APPROVAL",
      state: {
        counts: { companies: 12, scored: 9 },
        stageStatuses: { sourcing: "COMPLETE", scoring: "COMPLETE" },
        messages: [
          {
            node: "scoring_agent",
            ts: "2026-06-10T10:00:40.000Z",
            text: "scoring for 1 ICP(s)",
          },
        ],
      },
      startedAt: "2026-06-10T10:00:00.000Z",
      lastActivityAt: "2026-06-10T10:00:55.000Z",
      completedAt: null,
    };
    const now = Date.parse("2026-06-10T10:01:00.000Z");
    const out = shapeRunDetail([completedRun, awaiting], "gr_hitl", now);
    expect(out).not.toBeNull();
    expect(out!.run.id).toBe("gr_hitl");
    expect(out!.run.status).toBe("AWAITING_APPROVAL");
    expect(out!.run.leadsScored).toBe(9);
    expect(out!.timeline).toHaveLength(1);
    expect(out!.timeline[0]).toMatchObject({
      id: "gr_hitl:run",
      summary:
        "Pipeline paused before drafting and awaits an authorized reviewer.",
    });
    expect(out!.timeline[0]?.children).toEqual([
      expect.objectContaining({
        nodeType: "evaluator",
        label: "Lead scoring",
        summary: "scoring for 1 ICP(s) · complete",
        timestamp: "2026-06-10T10:00:40.000Z",
      }),
      expect.objectContaining({
        id: "gr_hitl:approval-required",
        nodeType: "human_action",
        timestamp: "2026-06-10T10:00:55.000Z",
      }),
    ]);
  });

  it("returns null when the run is not in the list window", () => {
    expect(shapeRunDetail([completedRun], "gr_unknown")).toBeNull();
  });
});

describe("shapeRunTimeline", () => {
  it("uses persisted stage messages and statuses without exposing raw run errors", () => {
    const failed: UpstreamGraphRun = {
      id: "gr_failed",
      status: "FAILED",
      state: {
        stageStatuses: { enrichment: "FAILED" },
        messages: [
          {
            node: "enrichment_agent",
            ts: "2026-06-10T10:01:00.000Z",
            text: "enriching for 1 ICP(s)",
          },
        ],
      },
      error: "provider token rejected for secret@example.com",
      startedAt: "2026-06-10T10:00:00.000Z",
      completedAt: "2026-06-10T10:01:30.000Z",
    };

    const timeline = shapeRunTimeline(failed);
    expect(timeline[0]?.summary).toBe(
      "Pipeline failed during lead enrichment.",
    );
    expect(timeline[0]?.children[0]?.summary).toBe(
      "enriching for 1 ICP(s) · failed",
    );
    expect(JSON.stringify(timeline)).not.toContain("secret@example.com");
    expect(JSON.stringify(timeline)).not.toContain("provider token");
  });

  it("returns an authoritative root for legacy runs without stage messages", () => {
    const timeline = shapeRunTimeline({
      id: "gr_legacy",
      status: "COMPLETED",
      state: null,
      startedAt: "2026-06-10T10:00:00.000Z",
      completedAt: "2026-06-10T10:02:00.000Z",
    });

    expect(timeline).toEqual([
      expect.objectContaining({
        id: "gr_legacy:run",
        summary: "Pipeline completed.",
        durationMs: 120_000,
        children: [],
      }),
    ]);
  });
});

describe("upstreamMessage", () => {
  it("passes a NestJS exception message through verbatim", () => {
    expect(
      upstreamMessage(
        {
          statusCode: 409,
          message: "Graph run is COMPLETED, not AWAITING_APPROVAL",
          error: "Conflict",
        },
        "fallback",
      ),
    ).toBe("Graph run is COMPLETED, not AWAITING_APPROVAL");
  });

  it("falls back when the body has no usable message", () => {
    expect(upstreamMessage(undefined, "fallback")).toBe("fallback");
    expect(upstreamMessage("plain text", "fallback")).toBe("fallback");
    expect(upstreamMessage({ message: "   " }, "fallback")).toBe("fallback");
    expect(upstreamMessage({ message: 42 }, "fallback")).toBe("fallback");
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
