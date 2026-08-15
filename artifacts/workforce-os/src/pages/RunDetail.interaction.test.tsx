// @vitest-environment jsdom

import React, { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RunDetail, { RUN_DETAIL_POLL_INTERVAL_MS } from "./RunDetail";

type RunDetailQueryOptions =
  | {
      query?: {
        refetchInterval?: (query: {
          state: { data: unknown };
        }) => number | false;
      };
    }
  | undefined;

const mocks = vi.hoisted(() => ({
  status: "AWAITING_APPROVAL",
  customFetch: vi.fn(),
  refetch: vi.fn(),
  queryOptions: undefined as RunDetailQueryOptions,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

function runDetail(status: string) {
  return {
    run: {
      id: "run_awaiting",
      status,
      stagesCompleted: ["sourcing", "enrichment", "scoring", "research"],
      leadsScored: 12,
      artifactsGenerated: null,
      durationMs: 60_000,
      costUsd: null,
      approvedBy: null,
      startedAt: "2026-08-13T00:00:00.000Z",
      completedAt: null,
    },
    timeline: [],
  };
}

vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "run_awaiting" }],
  useLocation: () => ["/runs/run_awaiting", vi.fn()],
}));

vi.mock("@/lib/motion", () => ({
  cardEnter: {},
  springHover: {},
  useReducedMotionSafe: () => true,
}));

vi.mock("@/components/motion/Stagger", () => ({
  Stagger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  StaggerItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/motion/CountUp", () => ({
  CountUp: ({ value }: { value: number }) => <span>{value}</span>,
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useGetRun: (_id: string, options: RunDetailQueryOptions) => {
      mocks.queryOptions = options;
      return {
        data: runDetail(mocks.status),
        isLoading: false,
        isError: false,
        refetch: mocks.refetch,
      };
    },
    useGetOrgSettings: () => ({
      data: { canReviewArtifacts: true },
    }),
    customFetch: (url: string, options?: RequestInit) =>
      mocks.customFetch(url, options),
  };
});

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

async function renderRunDetail() {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <RunDetail />
      </QueryClientProvider>,
    );
  });
}

function getTestButton(testId: string): HTMLButtonElement {
  const button = container.querySelector(`[data-testid="${testId}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Could not find button: ${testId}`);
  }
  return button;
}

function configuredPollInterval(data: unknown): number | false {
  const interval = mocks.queryOptions?.query?.refetchInterval;
  if (typeof interval !== "function") {
    throw new Error("Run query did not configure a polling callback");
  }
  return interval({ state: { data } });
}

describe("RunDetail decision settling", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.status = "AWAITING_APPROVAL";
    mocks.customFetch.mockReset();
    mocks.refetch.mockReset();
    mocks.refetch.mockResolvedValue({ data: runDetail(mocks.status) });
    mocks.queryOptions = undefined;
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    queryClient.clear();
  });

  it("locks duplicate decisions and polls until the run becomes stable", async () => {
    let resolveDecision: ((value: { status: string }) => void) | undefined;
    mocks.customFetch.mockImplementation(
      () =>
        new Promise<{ status: string }>((resolve) => {
          resolveDecision = resolve;
        }),
    );

    await renderRunDetail();
    expect(configuredPollInterval(runDetail("AWAITING_APPROVAL"))).toBe(false);

    const approveButton = getTestButton("approve-run");
    await act(async () => {
      approveButton.click();
      approveButton.click();
    });

    expect(mocks.customFetch).toHaveBeenCalledTimes(1);
    expect(getTestButton("approve-run").disabled).toBe(true);
    expect(getTestButton("reject-run").disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Submitting the decision",
    );
    expect(configuredPollInterval(runDetail("AWAITING_APPROVAL"))).toBe(
      RUN_DETAIL_POLL_INTERVAL_MS,
    );

    await act(async () => {
      resolveDecision?.({ status: "resuming" });
      await vi.waitFor(() => {
        expect(queryClient.isMutating()).toBe(0);
      });
    });

    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "waiting for the run status to update",
    );
    getTestButton("approve-run").click();
    expect(mocks.customFetch).toHaveBeenCalledTimes(1);

    mocks.status = "RUNNING";
    await renderRunDetail();
    expect(
      container.querySelector('[data-testid="run-approval-panel"]'),
    ).toBeNull();
    expect(configuredPollInterval(runDetail("RUNNING"))).toBe(
      RUN_DETAIL_POLL_INTERVAL_MS,
    );

    mocks.status = "COMPLETED";
    await renderRunDetail();
    expect(configuredPollInterval(runDetail("COMPLETED"))).toBe(false);
  });
});
