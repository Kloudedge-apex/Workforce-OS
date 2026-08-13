import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutreachArtifact } from "@workspace/api-client-react";
import ArtifactDetail from "./ArtifactDetail";

const mockState = vi.hoisted(() => ({
  reviewCapability: false as boolean | null,
  suppressionCapability: true as boolean | null,
  artifact: undefined as OutreachArtifact | undefined,
}));

const pendingArtifact: OutreachArtifact = {
  id: "art_1",
  status: "PENDING_REVIEW",
  purpose: "REPLY",
  channel: "EMAIL",
  recipient: {
    id: "buyer@example.com",
    name: "Buyer",
    email: "buyer@example.com",
    company: "Acme",
  },
  subject: "Re: Pilot",
  bodyText: "Tuesday works.",
  bodyHtml: null,
  citations: [],
  evaluatorScores: null,
  sendPolicy: null,
  refusal: { refused: false, reason: null },
  approvalEligibility: { eligible: true, reason: null },
  langsmithRunId: null,
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
  approvedAt: null,
  sentAt: null,
  rejectionReason: null,
  failureReason: null,
  failedAt: null,
  statusReason: null,
  sendReceiptId: null,
  graphRunId: null,
  cohort: null,
};

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    useRoute: () => [true, { id: "art_1" }],
    useLocation: () => ["/outbound/art_1", vi.fn()],
  };
});

vi.mock("@/components/motion/Stagger", () => ({
  Stagger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  StaggerItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useGetArtifact: () => ({
      data: mockState.artifact ?? pendingArtifact,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useGetOrgSettings: () => ({
      data: {
        canReviewArtifacts: mockState.reviewCapability,
        canManageSuppressions: mockState.suppressionCapability,
        sendReadiness: {
          liveSendAllowed: false,
          physicalAddressSet: true,
          senderNameSet: true,
          countrySet: true,
          mailboxConnected: true,
          dailyCapRemaining: 10,
        },
      },
    }),
    useApproveArtifact: () => ({ mutate: vi.fn(), isPending: false }),
    useRejectArtifact: () => ({ mutate: vi.fn(), isPending: false }),
    useSuppressArtifact: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

function renderPage(): string {
  const client = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ArtifactDetail />
    </QueryClientProvider>,
  );
}

describe("ArtifactDetail review capability", () => {
  beforeEach(() => {
    mockState.reviewCapability = false;
    mockState.suppressionCapability = true;
    mockState.artifact = undefined;
  });

  it("hides approve and reject controls for a known role denial", () => {
    const html = renderPage();
    expect(html).toContain("workspace role cannot approve or reject artifacts");
    expect(html).not.toContain(">Approve<");
    expect(html).not.toContain(">Reject<");
  });

  it("fails closed with distinct copy when capability is unavailable", () => {
    mockState.reviewCapability = null;
    const html = renderPage();
    expect(html).toContain("review capability is unavailable");
    expect(html).not.toContain(">Approve<");
    expect(html).not.toContain(">Reject<");
  });
});

describe("ArtifactDetail suppression capability", () => {
  beforeEach(() => {
    mockState.reviewCapability = true;
    mockState.suppressionCapability = false;
    mockState.artifact = undefined;
  });

  it("renders a known suppression denial as read-only", () => {
    const html = renderPage();
    expect(html).toContain("Suppression controls are read-only");
    expect(html).not.toContain("Suppressing…");
    expect(html).not.toContain(">Suppress<");
  });

  it("fails closed when suppression permission is unavailable", () => {
    mockState.suppressionCapability = null;
    const html = renderPage();
    expect(html).toContain("Suppression permissions could not be verified");
    expect(html).not.toContain(">Suppress<");
  });
});

describe("ArtifactDetail FAILED state", () => {
  beforeEach(() => {
    mockState.reviewCapability = true;
    mockState.suppressionCapability = true;
    mockState.artifact = {
      ...pendingArtifact,
      status: "FAILED",
      approvalEligibility: {
        eligible: false,
        reason: "Artifact is FAILED; only PENDING_REVIEW can be approved",
      },
      failureReason: "provider rejected after retry exhaustion",
      failedAt: "2026-08-13T01:02:03.000Z",
    };
  });

  it("shows terminal no-delivery evidence without review or retry controls", () => {
    const html = renderPage();
    expect(html).toContain("Send failed — no delivery");
    expect(html).toContain("provider rejected after retry exhaustion");
    expect(html).toContain("Automatic retries are exhausted");
    expect(html).not.toContain(">Approve<");
    expect(html).not.toContain(">Reject<");
    expect(html).not.toContain("Retry");
  });
});

describe("ArtifactDetail reconciliation state", () => {
  beforeEach(() => {
    mockState.reviewCapability = true;
    mockState.suppressionCapability = true;
    mockState.artifact = {
      ...pendingArtifact,
      status: "RECONCILIATION_REQUIRED",
      approvalEligibility: {
        eligible: false,
        reason:
          "Artifact is RECONCILIATION_REQUIRED; only PENDING_REVIEW can be approved",
      },
      rejectionReason: null,
      failureReason: null,
      failedAt: null,
      statusReason: "Historical system marker lacks trusted failure evidence.",
    };
  });

  it("shows an explicit unclassified state without rejection or failure claims", () => {
    const html = renderPage();
    expect(html).toContain("Historical outcome needs reconciliation");
    expect(html).toContain("Why it is unclassified");
    expect(html).toContain("Unclassified — reconcile history");
    expect(html).not.toContain("Draft rejected by reviewer");
    expect(html).not.toContain("Send failed — no delivery");
    expect(html).not.toContain(">Approve<");
    expect(html).not.toContain(">Reject<");
    expect(html).not.toContain("Retry");
  });
});
