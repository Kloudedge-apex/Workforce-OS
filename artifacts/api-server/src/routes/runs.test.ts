import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express, { type Router } from "express";
import { describe, it, expect, vi } from "vitest";
import {
  createRunDecisionRouter,
  shapeRun,
  shapeRunsList,
  shapeRunDetail,
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
  const app = express();
  app.use(express.json());
  if (actor !== undefined) {
    app.use((req, _res, next) => {
      req.clerkUserId = actor;
      next();
    });
  }
  app.use(router);
  app.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({ error: "test-unhandled" });
    },
  );

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "POST",
    });
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
});

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
  it("wraps the run found in the list window with the timeline gap sentinel", () => {
    const awaiting: UpstreamGraphRun = {
      id: "gr_hitl",
      status: "AWAITING_APPROVAL",
      state: { counts: { companies: 12, scored: 9 } },
      startedAt: "2026-06-10T10:00:00.000Z",
      completedAt: null,
    };
    const now = Date.parse("2026-06-10T10:01:00.000Z");
    const out = shapeRunDetail([completedRun, awaiting], "gr_hitl", now);
    expect(out).not.toBeNull();
    expect(out!.run.id).toBe("gr_hitl");
    expect(out!.run.status).toBe("AWAITING_APPROVAL");
    expect(out!.run.leadsScored).toBe(9);
    // the timeline half stays an honest gap — no fabricated/empty timeline
    expect(out!.timeline).toEqual({
      unavailable: true,
      feature: "run-evidence-timeline",
    });
  });

  it("returns null when the run is not in the list window", () => {
    expect(shapeRunDetail([completedRun], "gr_unknown")).toBeNull();
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
