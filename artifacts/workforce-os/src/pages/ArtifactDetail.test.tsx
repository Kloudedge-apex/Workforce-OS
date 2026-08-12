import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutreachArtifact } from "@workspace/api-client-react";
import ArtifactDetail from "./ArtifactDetail";

const mockState = vi.hoisted(() => ({
  reviewCapability: false as boolean | null,
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
      data: pendingArtifact,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useGetOrgSettings: () => ({
      data: {
        canReviewArtifacts: mockState.reviewCapability,
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
