import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutreachArtifact } from "@workspace/api-client-react";
import { ApprovalCard } from "./ApprovalCard";

const mockState = vi.hoisted(() => ({
  reviewCapability: true as boolean | null,
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useApproveArtifact: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useRejectArtifact: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
    useGetGraphRunTimeline: () => ({ data: [], isLoading: false }),
  };
});

function artifact(overrides: Partial<OutreachArtifact> = {}): OutreachArtifact {
  return {
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
    bodyText: "Thanks <team>. Tuesday works.",
    bodyHtml: "<p>Different secondary HTML</p>",
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
    ...overrides,
  };
}

function renderCard(value: OutreachArtifact): string {
  const client = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ApprovalCard artifact={value} />
    </QueryClientProvider>,
  );
}

describe("ApprovalCard review contract", () => {
  beforeEach(() => {
    mockState.reviewCapability = true;
  });

  it("renders provider-bound reply text and allows citation-free review", () => {
    const html = renderCard(artifact());
    expect(html).toContain("Thanks &lt;team&gt;. Tuesday works.");
    expect(html).not.toContain("Different secondary HTML");
    expect(html).toContain(">Approve<");
  });

  it("keeps unsupported-channel content visible with only one Reject control", () => {
    const html = renderCard(
      artifact({
        purpose: "OUTBOUND",
        channel: "LINKEDIN",
        bodyText: "Read this draft before rejecting it.",
        approvalEligibility: {
          eligible: false,
          reason: "LINKEDIN approval is unavailable",
        },
      }),
    );
    expect(html).toContain("Read this draft before rejecting it.");
    expect(html.match(/>Reject</g)).toHaveLength(1);
  });

  it("is read-only with explicit role-denied copy when the backend returns false", () => {
    mockState.reviewCapability = false;
    const html = renderCard(artifact());
    expect(html).toContain("workspace role cannot approve or reject artifacts");
    expect(html).not.toContain(">Approve<");
    expect(html).not.toContain(">Reject<");
  });

  it("fails closed with capability-unavailable copy when the probe is unknown", () => {
    mockState.reviewCapability = null;
    const html = renderCard(artifact());
    expect(html).toContain("review capability is unavailable");
    expect(html).not.toContain(">Approve<");
    expect(html).not.toContain(">Reject<");
  });
});
