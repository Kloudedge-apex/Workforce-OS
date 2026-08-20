import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVERSATION_REFRESH_INTERVAL_MS } from "@/lib/conversationRefresh";
import ConversationThread from "./ConversationThread";

const mocks = vi.hoisted(() => ({
  detailData: undefined as any,
  detailError: false,
  detailLoading: true,
  queryOptions: undefined as
    | { query?: { refetchInterval?: number } }
    | undefined,
}));

vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "conv_1" }],
  useLocation: () => ["/conversations/conv_1", vi.fn()],
}));

vi.mock("@/lib/motion", () => ({
  cardEnter: {},
  springHover: {},
  useReducedMotionSafe: () => true,
}));

vi.mock("@/components/v2/ConversationActions", () => ({
  ConversationActions: () => <div>Conversation actions</div>,
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetConversation: (
    _id: string,
    options: { query?: { refetchInterval?: number } },
  ) => {
    mocks.queryOptions = options;
    return {
      data: mocks.detailData,
      isLoading: mocks.detailLoading,
      isError: mocks.detailError,
      refetch: vi.fn(),
    };
  },
  useDraftReply: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveConversation: () => ({ mutate: vi.fn() }),
  useUnarchiveConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("ConversationThread observation loop", () => {
  beforeEach(() => {
    mocks.detailData = undefined;
    mocks.detailError = false;
    mocks.detailLoading = true;
    mocks.queryOptions = undefined;
  });

  it("polls an open mobile thread for inbound and follow-up changes", () => {
    Object.assign(globalThis, { React });
    renderToStaticMarkup(<ConversationThread />);
    expect(mocks.queryOptions?.query?.refetchInterval).toBe(
      CONVERSATION_REFRESH_INTERVAL_MS,
    );
  });

  it("keeps the last loaded thread visible when a background refresh fails", () => {
    mocks.detailData = {
      conversation: {
        id: "conv_1",
        leadId: null,
        leadName: "Buyer",
        leadCompany: "Example",
        leadAvatarUrl: null,
        subject: "Cached conversation subject",
        lastMessagePreview: "Still available",
        lastMessageAt: "2026-08-13T12:00:00.000Z",
        unread: false,
        needsReply: true,
        archived: false,
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
      followUps: [],
      meetings: [],
    };
    mocks.detailLoading = false;
    mocks.detailError = true;

    Object.assign(globalThis, { React });
    const markup = renderToStaticMarkup(<ConversationThread />);

    expect(markup).toContain("Cached conversation subject");
    expect(markup).not.toContain("Couldn&#x27;t load this conversation");
  });

  it("offers a restore action for an archived mobile thread", () => {
    mocks.detailData = {
      conversation: {
        id: "conv_1",
        leadId: null,
        leadName: "Buyer",
        leadCompany: "Example",
        leadAvatarUrl: null,
        subject: "Archived conversation",
        lastMessagePreview: "Stored safely",
        lastMessageAt: "2026-08-13T12:00:00.000Z",
        unread: false,
        needsReply: false,
        archived: true,
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
      followUps: [],
      meetings: [],
    };
    mocks.detailLoading = false;

    Object.assign(globalThis, { React });
    const markup = renderToStaticMarkup(<ConversationThread />);

    expect(markup).toContain("Restore");
    expect(markup).not.toContain('aria-label="Archive conversation"');
  });
});
