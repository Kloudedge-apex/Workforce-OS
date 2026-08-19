import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  approvalSavedFromError,
  decisionErrorMessage,
} from "@/lib/decisionError";
import RunDetail, {
  RUN_DETAIL_POLL_INTERVAL_MS,
  runDetailRefetchInterval,
} from "./RunDetail";

const mockState = vi.hoisted(() => ({
  reviewCapability: true as boolean | null,
}));

const awaitingRunDetail = {
  run: {
    id: "run_awaiting",
    status: "AWAITING_APPROVAL" as const,
    stagesCompleted: ["sourcing", "enrichment", "scoring", "research"],
    leadsScored: 12,
    artifactsGenerated: null,
    durationMs: 60_000,
    costUsd: null,
    approvedBy: null,
    startedAt: "2026-08-13T00:00:00.000Z",
    completedAt: null,
  },
  timeline: [
    {
      id: "run_awaiting:run",
      nodeType: "agent_run" as const,
      label: "Pipeline run",
      summary:
        "Pipeline paused before drafting and awaits an authorized reviewer.",
      durationMs: 60_000,
      timestamp: "2026-08-13T00:00:00.000Z",
      children: [
        {
          id: "run_awaiting:approval-required",
          nodeType: "human_action" as const,
          label: "Approval required",
          summary:
            "Run paused before outreach drafting; an authorized reviewer must continue or reject it.",
          timestamp: "2026-08-13T00:01:00.000Z",
          children: [],
        },
      ],
    },
  ],
};

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    useRoute: () => [true, { id: "run_awaiting" }],
    useLocation: () => ["/runs/run_awaiting", vi.fn()],
  };
});

vi.mock("@/components/motion/Stagger", () => ({
  Stagger: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  StaggerItem: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

vi.mock("@/components/motion/CountUp", () => ({
  CountUp: ({ value }: { value: number }) =>
    React.createElement("span", null, String(value)),
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useGetRun: () => ({
      data: awaitingRunDetail,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useGetOrgSettings: () => ({
      data: { canReviewArtifacts: mockState.reviewCapability },
    }),
  };
});

function renderRunDetail(): string {
  const client = new QueryClient();
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(RunDetail),
    ),
  );
}

// Matches the shape customFetch throws: an ApiError carrying the parsed BFF
// body in `.data` plus the HTTP `.status`.
function apiError(status: number, data: unknown): unknown {
  const err = new Error(`HTTP ${status}`);
  return Object.assign(err, { status, data });
}

describe("decisionErrorMessage", () => {
  it("surfaces the BFF/upstream `message` verbatim (409 resume conflict)", () => {
    expect(
      decisionErrorMessage(
        apiError(409, {
          message: "Graph run is COMPLETED, not AWAITING_APPROVAL",
        }),
      ),
    ).toBe("Graph run is COMPLETED, not AWAITING_APPROVAL");
  });

  it("falls back to the BFF `error` marker with the HTTP status", () => {
    expect(decisionErrorMessage(apiError(404, { error: "Not found" }))).toBe(
      "Not found (HTTP 404)",
    );
    expect(
      decisionErrorMessage(apiError(502, { error: "upstream", status: 500 })),
    ).toBe("upstream (HTTP 502)");
  });

  it("ignores blank/non-string body fields and uses the error's own message", () => {
    expect(decisionErrorMessage(apiError(500, { message: "   " }))).toBe(
      "HTTP 500",
    );
    expect(decisionErrorMessage(apiError(500, { unrelated: true }))).toBe(
      "HTTP 500",
    );
    expect(decisionErrorMessage(apiError(500, null))).toBe("HTTP 500");
  });

  it("uses a plain Error's message (network failure, no response body)", () => {
    expect(decisionErrorMessage(new Error("Failed to fetch"))).toBe(
      "Failed to fetch",
    );
  });

  it("falls back to a generic line for unknown shapes", () => {
    expect(decisionErrorMessage(undefined)).toBe(
      "Request failed — please try again.",
    );
    expect(decisionErrorMessage({})).toBe("Request failed — please try again.");
  });
});

describe("approvalSavedFromError", () => {
  it("accepts only the explicit boolean partial-success signal", () => {
    expect(approvalSavedFromError(apiError(503, { approvalSaved: true }))).toBe(
      true,
    );
    expect(
      approvalSavedFromError(apiError(503, { approvalSaved: false })),
    ).toBe(false);
    expect(
      approvalSavedFromError(
        apiError(503, {
          message: "The approval is saved",
          approvalSaved: "true",
        }),
      ),
    ).toBe(false);
    expect(approvalSavedFromError(new Error("network failure"))).toBe(false);
  });
});

describe("RunDetail review capability", () => {
  beforeEach(() => {
    mockState.reviewCapability = true;
  });

  it("renders run approve and reject controls for an authorized reviewer", () => {
    const html = renderRunDetail();

    expect(html).toContain('data-testid="approve-run"');
    expect(html).toContain('data-testid="reject-run"');
    expect(html).not.toContain('data-testid="run-review-read-only"');
  });

  it("renders the persisted run timeline without a gap placeholder", () => {
    const html = renderRunDetail();

    expect(html).toContain("Run Timeline");
    expect(html).toContain("Pipeline run");
    expect(html).toContain("Approval required");
    expect(html).not.toContain("the run timeline while this release updates");
  });

  it("hides run decisions for a known role denial", () => {
    mockState.reviewCapability = false;
    const html = renderRunDetail();

    expect(html).toContain("workspace role cannot approve or reject runs");
    expect(html).toContain('data-testid="run-review-read-only"');
    expect(html).not.toContain('data-testid="approve-run"');
    expect(html).not.toContain('data-testid="reject-run"');
  });

  it("fails closed when the review capability is unavailable", () => {
    mockState.reviewCapability = null;
    const html = renderRunDetail();

    expect(html).toContain("review capability is unavailable");
    expect(html).toContain('data-testid="run-review-read-only"');
    expect(html).not.toContain('data-testid="approve-run"');
    expect(html).not.toContain('data-testid="reject-run"');
  });
});

describe("runDetailRefetchInterval", () => {
  const detailWithStatus = (status: string) => ({
    ...awaitingRunDetail,
    run: { ...awaitingRunDetail.run, status },
  });

  it("polls a submitted decision while the worker is settling it", () => {
    expect(
      runDetailRefetchInterval(detailWithStatus("AWAITING_APPROVAL"), true),
    ).toBe(RUN_DETAIL_POLL_INTERVAL_MS);
    expect(
      runDetailRefetchInterval(detailWithStatus("AWAITING_APPROVAL"), false),
    ).toBe(false);
  });

  it("polls asynchronous runs and stops once they are terminal", () => {
    expect(runDetailRefetchInterval(detailWithStatus("RUNNING"), false)).toBe(
      RUN_DETAIL_POLL_INTERVAL_MS,
    );
    for (const status of ["COMPLETED", "FAILED", "CANCELLED"]) {
      expect(runDetailRefetchInterval(detailWithStatus(status), true)).toBe(
        false,
      );
    }
  });
});
