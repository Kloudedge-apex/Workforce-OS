// @vitest-environment jsdom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ConversationDetail } from "@workspace/api-client-react";
import { ConversationActions } from "./ConversationActions";

vi.mock("wouter", () => ({
  useLocation: () => ["/conversations", vi.fn()],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@workspace/api-client-react", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useArchiveConversation: mutation,
    useCreateConversationFollowUp: mutation,
    useCreateConversationMeeting: mutation,
    useCreateConversationReply: mutation,
    useMarkConversationRead: mutation,
    useUnarchiveConversation: mutation,
    useUpdateConversationFollowUp: mutation,
  };
});

function detail(archived: boolean): ConversationDetail {
  return {
    conversation: {
      id: "conv_1",
      leadId: "lead_1",
      leadName: "Buyer",
      leadCompany: "Example",
      leadAvatarUrl: null,
      subject: "Pilot",
      lastMessagePreview: "Tuesday works",
      lastMessageAt: "2026-08-13T12:00:00.000Z",
      unread: false,
      needsReply: true,
      archived,
      replyIntelligence: {
        analysisStatus: "PENDING",
        sentiment: null,
        sentimentConfidence: null,
        nextBestAction: null,
        nextBestActionType: null,
      },
    },
    messages: [],
    pendingDraftId: null,
    replyArtifacts: [],
    followUps: [],
    meetings: [],
  } as ConversationDetail;
}

describe("ConversationActions archive recovery", () => {
  it("offers archive for an active desktop thread", () => {
    Object.assign(globalThis, { React });
    const markup = renderToStaticMarkup(
      <ConversationActions detail={detail(false)} />,
    );

    expect(markup).toContain("Archive");
    expect(markup).not.toContain("Restore");
  });

  it("offers restore for an archived desktop thread", () => {
    Object.assign(globalThis, { React });
    const markup = renderToStaticMarkup(
      <ConversationActions detail={detail(true)} />,
    );

    expect(markup).toContain("Restore");
    expect(markup).not.toContain("Archiving…");
  });
});
