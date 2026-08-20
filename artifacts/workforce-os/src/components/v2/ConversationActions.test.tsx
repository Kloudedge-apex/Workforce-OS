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
    useCancelConversationMeeting: mutation,
    useCompleteConversationMeeting: mutation,
    useConfirmConversationMeeting: mutation,
    useCreateConversationFollowUp: mutation,
    useCreateConversationMeeting: mutation,
    useCreateConversationReply: mutation,
    useMarkConversationMeetingNoShow: mutation,
    useMarkConversationRead: mutation,
    useUnarchiveConversation: mutation,
    useUpdateConversationFollowUp: mutation,
    useUpdateConversationMeeting: mutation,
  };
});

function detail(
  archived: boolean,
  meetingStatus?:
    | "PROPOSED"
    | "CONFIRMED"
    | "CANCELLED"
    | "COMPLETED"
    | "NO_SHOW",
): ConversationDetail {
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
    meetings: meetingStatus
      ? [
          {
            id: "meeting_1",
            conversationId: "conv_1",
            title: "Technical review",
            scheduledFor: "2026-08-21T10:00:00.000Z",
            durationMinutes: 45,
            attendeeEmails: ["buyer@example.com"],
            notes: "Review security",
            status: meetingStatus,
            source: "HUMAN_LOGGED",
            createdAt: "2026-08-12T09:00:00.000Z",
            updatedAt: "2026-08-12T09:00:00.000Z",
          },
        ]
      : [],
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
    const writeDraft = markup.match(
      /<button[^>]*data-testid="conversation-write-draft"[^>]*>/,
    )?.[0];
    expect(writeDraft).toBeDefined();
    expect(writeDraft).not.toContain(' disabled=""');
  });

  it("offers restore for an archived desktop thread", () => {
    Object.assign(globalThis, { React });
    const markup = renderToStaticMarkup(
      <ConversationActions detail={detail(true)} />,
    );

    expect(markup).toContain("Restore");
    expect(markup).not.toContain("Archiving…");
    expect(markup).toContain(
      "Restore this conversation before writing another reply.",
    );
    expect(markup).toContain(
      "Archiving stops any reply that had not started provider delivery.",
    );
    const writeDraft = markup.match(
      /<button[^>]*data-testid="conversation-write-draft"[^>]*>/,
    )?.[0];
    expect(writeDraft).toBeDefined();
    expect(writeDraft).toContain(' disabled=""');
    expect(writeDraft).toContain(
      'title="Restore this conversation before writing a reply"',
    );
  });
});

describe("ConversationActions meeting lifecycle", () => {
  it("offers edit, confirm, and cancel for a proposed meeting", () => {
    Object.assign(globalThis, { React });
    const markup = renderToStaticMarkup(
      <ConversationActions detail={detail(false, "PROPOSED")} />,
    );

    expect(markup).toContain('data-testid="meeting-edit-meeting_1"');
    expect(markup).toContain('data-testid="meeting-confirm-meeting_1"');
    expect(markup).toContain('data-testid="meeting-cancel-meeting_1"');
    expect(markup).not.toContain('data-testid="meeting-complete-meeting_1"');
    expect(markup).not.toContain('data-testid="meeting-no-show-meeting_1"');
  });

  it("offers final outcomes for a confirmed meeting", () => {
    Object.assign(globalThis, { React });
    const markup = renderToStaticMarkup(
      <ConversationActions detail={detail(false, "CONFIRMED")} />,
    );

    expect(markup).toContain('data-testid="meeting-edit-meeting_1"');
    expect(markup).toContain('data-testid="meeting-complete-meeting_1"');
    expect(markup).toContain('data-testid="meeting-no-show-meeting_1"');
    expect(markup).toContain('data-testid="meeting-cancel-meeting_1"');
    expect(markup).not.toContain('data-testid="meeting-confirm-meeting_1"');
  });

  it.each(["CANCELLED", "COMPLETED", "NO_SHOW"] as const)(
    "does not offer lifecycle mutations for a terminal %s meeting",
    (status) => {
      Object.assign(globalThis, { React });
      const markup = renderToStaticMarkup(
        <ConversationActions detail={detail(false, status)} />,
      );

      expect(markup).not.toContain('data-testid="meeting-edit-meeting_1"');
      expect(markup).not.toContain('data-testid="meeting-confirm-meeting_1"');
      expect(markup).not.toContain('data-testid="meeting-cancel-meeting_1"');
      expect(markup).not.toContain('data-testid="meeting-complete-meeting_1"');
      expect(markup).not.toContain('data-testid="meeting-no-show-meeting_1"');
    },
  );
});
