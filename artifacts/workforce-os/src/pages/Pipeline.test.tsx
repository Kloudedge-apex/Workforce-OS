import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Pipeline from "./Pipeline";

const state = vi.hoisted(() => ({
  canManageSuppressions: false as boolean | null,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/pipeline", vi.fn()],
}));

vi.mock("@/components/motion/CountUp", () => ({
  CountUp: ({ value }: { value: number }) => <span>{value}</span>,
}));

vi.mock("@/lib/motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/motion")>();
  return { ...actual, useReducedMotionSafe: () => true };
});

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useListLeads: () => ({
      data: {
        items: [
          {
            id: "lead_1",
            name: "Ada Buyer",
            email: "ada@example.com",
            company: "Example",
            score: 91,
            stage: "qualified",
            cohort: null,
            emailStatus: null,
            intentSignals: null,
            sendPolicy: null,
            createdAt: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useGetOrgSettings: () => ({
      data: { canManageSuppressions: state.canManageSuppressions },
    }),
    useBulkSuppressLeads: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

describe("Pipeline suppression capability", () => {
  beforeEach(() => {
    state.canManageSuppressions = false;
  });

  it("shows a known role denial and disables suppression selection", () => {
    const html = renderToStaticMarkup(<Pipeline />);
    expect(html).toContain("Suppression controls are read-only");
    expect(html).toContain("owner or administrator");
    expect(html).toContain('aria-label="Select all leads for suppression"');
    expect(html).toContain("disabled");
  });

  it("fails closed when suppression permissions are unavailable", () => {
    state.canManageSuppressions = null;
    const html = renderToStaticMarkup(<Pipeline />);
    expect(html).toContain("Suppression permissions could not be verified");
  });
});
