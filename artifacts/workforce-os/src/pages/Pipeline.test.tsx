// @vitest-environment jsdom

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Pipeline from "./Pipeline";

const state = vi.hoisted(() => ({
  canManageSuppressions: false as boolean | null,
  leads: [] as Array<Record<string, unknown>>,
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
}));

function lead(id: string, name: string) {
  return {
    id,
    name,
    email: `${id}@example.com`,
    company: "Example",
    score: 91,
    stage: "qualified",
    cohort: null,
    emailStatus: null,
    intentSignals: null,
    sendPolicy: null,
    createdAt: null,
  };
}

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

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useListLeads: () => ({
      data: {
        items: state.leads,
        total: state.leads.length,
        page: 1,
        limit: 20,
      },
      isLoading: false,
      isError: false,
      refetch: state.refetch,
    }),
    useGetOrgSettings: () => ({
      data: { canManageSuppressions: state.canManageSuppressions },
    }),
    useBulkSuppressLeads: () => ({
      mutateAsync: state.mutateAsync,
      isPending: false,
    }),
  };
});

let container: HTMLDivElement;
let root: Root;

async function renderPipeline() {
  await act(async () => {
    root.render(<Pipeline />);
  });
}

function getButton(
  label: string,
  scope: ParentNode = document,
): HTMLButtonElement {
  const button = Array.from(scope.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Could not find button: ${label}`);
  }
  return button;
}

function getAriaButton(label: string): HTMLButtonElement {
  const button = container.querySelector(`[aria-label="${label}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Could not find aria-labelled button: ${label}`);
  }
  return button;
}

describe("Pipeline suppression capability", () => {
  beforeEach(() => {
    state.canManageSuppressions = false;
    state.leads = [lead("lead_1", "Ada Buyer")];
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

describe("Pipeline bulk suppression scope", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    state.canManageSuppressions = true;
    state.leads = [lead("lead_1", "Ada Buyer")];
    state.mutateAsync.mockReset();
    state.mutateAsync.mockResolvedValue({
      affectedCount: 1,
      alreadySuppressedCount: 0,
      results: [{ personId: "lead_1", status: "CREATED", reason: "MANUAL" }],
    });
    state.refetch.mockReset();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("requires an accessible confirmation before submitting", async () => {
    await renderPipeline();

    await act(async () => {
      getAriaButton("Select Ada Buyer for suppression").click();
    });

    await act(async () => {
      getButton("Suppress 1", container).click();
    });

    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(state.mutateAsync).not.toHaveBeenCalled();
    const labelledBy = dialog?.getAttribute("aria-labelledby");
    const describedBy = dialog?.getAttribute("aria-describedby");
    expect(document.getElementById(labelledBy ?? "")?.textContent).toBe(
      "Suppress selected leads?",
    );
    expect(document.getElementById(describedBy ?? "")?.textContent).toContain(
      "1 currently visible lead",
    );

    await act(async () => {
      getButton("Suppress leads").click();
    });

    expect(state.mutateAsync).toHaveBeenCalledTimes(1);
    expect(state.mutateAsync).toHaveBeenCalledWith({
      data: { personIds: ["lead_1"] },
    });
  });

  it("never submits a selection that is no longer visible", async () => {
    await renderPipeline();

    await act(async () => {
      getAriaButton("Select Ada Buyer for suppression").click();
    });

    state.leads = [lead("lead_2", "Grace Buyer")];
    await renderPipeline();
    expect(container.textContent).not.toContain("Suppress 1");

    await act(async () => {
      getAriaButton("Select Grace Buyer for suppression").click();
    });
    await act(async () => {
      getButton("Suppress 1", container).click();
    });
    await act(async () => {
      getButton("Suppress leads").click();
    });

    expect(state.mutateAsync).toHaveBeenCalledTimes(1);
    expect(state.mutateAsync).toHaveBeenCalledWith({
      data: { personIds: ["lead_2"] },
    });
  });
});
