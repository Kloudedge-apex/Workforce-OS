import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express, { type Router } from "express";
import { describe, expect, it, vi } from "vitest";
import { UpstreamError } from "../upstream/apex-client";
import {
  buildConversationsListPath,
  createConversationsRouter,
  isReplyArtifactResult,
  shapeConversationDetail,
  shapeConversationsList,
  shapeDraftReply,
  shapeReplyIntelligence,
  type ConversationsUpstreamClient,
  type UpstreamConversation,
  type UpstreamConversationDetail,
  type UpstreamPaginatedConversations,
} from "./conversations";

const readyConversation: UpstreamConversation = {
  id: "conv_1",
  leadId: "lead_1",
  leadName: "Avery Stone",
  leadCompany: "Example Co",
  leadAvatarUrl: null,
  subject: "Re: workflow review",
  lastMessagePreview: "Tuesday works for me.",
  lastMessageAt: "2026-08-12T09:30:00.000Z",
  unread: true,
  needsReply: true,
  archived: false,
  replyIntelligence: {
    status: "READY",
    sentiment: "positive",
    sentimentConfidence: 0.91,
    nextBestAction: "Qualify timing and stakeholders",
    nextBestActionType: "qualify",
  },
};

const listResponse: UpstreamPaginatedConversations = {
  items: [readyConversation],
  total: 1,
  page: 1,
  limit: 20,
};

const detailResponse: UpstreamConversationDetail = {
  conversation: readyConversation,
  messages: [
    {
      id: "msg_1",
      direction: "inbound",
      bodyHtml: "<p>Tuesday works for me.</p>",
      sentAt: "2026-08-12T09:30:00.000Z",
      senderName: "Avery Stone",
    },
  ],
  pendingDraftId: null,
  followUps: [],
  meetings: [],
};

const meetingResponse = {
  id: "meeting_1",
  conversationId: "conv_1",
  title: "Technical review",
  scheduledFor: "2026-08-21T10:00:00.000Z",
  durationMinutes: 45,
  attendeeEmails: ["avery@example.com"],
  notes: "Review security",
  status: "PROPOSED",
  source: "HUMAN_LOGGED",
  createdAt: "2026-08-12T09:00:00.000Z",
  updatedAt: "2026-08-12T09:00:00.000Z",
};

async function request(
  router: Router,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({ error: "test-unhandled" });
    },
  );

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}${path}`,
      init,
    );
    const text = await response.text();
    return {
      status: response.status,
      body: text === "" ? null : JSON.parse(text),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function clientWith(options: {
  get?: () => Promise<unknown>;
  post?: () => Promise<unknown>;
  patch?: () => Promise<unknown>;
}): {
  client: ConversationsUpstreamClient;
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn(options.get ?? (async () => listResponse));
  const post = vi.fn(
    options.post ??
      (async () => ({
        artifactId: "artifact_1",
        status: "PENDING_REVIEW",
        message: "Reply draft ready for review",
        created: true,
      })),
  );
  const patch = vi.fn(
    options.patch ??
      (async () => ({
        id: "follow_up_1",
        conversationId: "conv_1",
        dueAt: "2026-08-20T09:00:00.000Z",
        note: null,
        status: "DONE",
        source: "HUMAN",
        createdAt: "2026-08-12T09:00:00.000Z",
        updatedAt: "2026-08-12T10:00:00.000Z",
      })),
  );

  return {
    client: { get, post, patch } as ConversationsUpstreamClient,
    get,
    post,
    patch,
  };
}

describe("shapeReplyIntelligence", () => {
  it("passes through a ready analysis and preserves its status", () => {
    expect(shapeReplyIntelligence(readyConversation.replyIntelligence)).toEqual(
      {
        sentiment: "positive",
        sentimentConfidence: 0.91,
        nextBestAction: "Qualify timing and stakeholders",
        nextBestActionType: "qualify",
        analysisStatus: "READY",
      },
    );
  });

  it("keeps pending analysis values unknown", () => {
    expect(
      shapeReplyIntelligence({
        status: "PENDING",
        sentiment: null,
        sentimentConfidence: null,
        nextBestAction: null,
        nextBestActionType: null,
      }),
    ).toEqual({
      sentiment: null,
      sentimentConfidence: null,
      nextBestAction: null,
      nextBestActionType: null,
      analysisStatus: "PENDING",
    });
  });

  it("maps failed analysis separately from a genuine neutral result", () => {
    expect(
      shapeReplyIntelligence({
        status: "FAILED",
        sentiment: null,
        sentimentConfidence: null,
        nextBestAction: null,
        nextBestActionType: null,
      }),
    ).toMatchObject({
      sentiment: null,
      sentimentConfidence: null,
      nextBestAction: null,
      nextBestActionType: null,
      analysisStatus: "FAILED",
    });
  });

  it("fails closed when a READY analysis is missing required evidence", () => {
    expect(
      shapeReplyIntelligence({
        status: "READY",
        sentiment: null,
        sentimentConfidence: null,
        nextBestAction: null,
        nextBestActionType: null,
      }),
    ).toMatchObject({
      nextBestAction: null,
      analysisStatus: "FAILED",
    });
  });
});

describe("conversation response transforms", () => {
  it("shapes every list item without changing pagination", () => {
    const out = shapeConversationsList(listResponse);
    expect(out).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(out.items[0].replyIntelligence.analysisStatus).toBe("READY");
  });

  it("shapes detail intelligence and preserves lower-case message direction", () => {
    const out = shapeConversationDetail(detailResponse);
    expect(out.conversation.replyIntelligence.analysisStatus).toBe("READY");
    expect(out.messages[0].direction).toBe("inbound");
    expect(out.pendingDraftId).toBeNull();
  });

  it("maps a review-ready draft artifact to the current TriggerResult", () => {
    expect(
      shapeDraftReply({
        artifactId: "artifact_42",
        status: "PENDING_REVIEW",
        message: "Reply draft ready for review",
        created: true,
      }),
    ).toEqual({
      runId: "artifact_42",
      queued: false,
      message: "Reply draft ready for review",
    });
  });

  it("accepts complete new and idempotently reused artifact responses", () => {
    expect(
      isReplyArtifactResult({
        artifactId: "artifact_42",
        status: "PENDING_REVIEW",
        message: "Ready",
        created: true,
      }),
    ).toBe(true);
    expect(
      isReplyArtifactResult({
        artifactId: "artifact_42",
        status: "SENT",
        message: "Sent",
        created: false,
      }),
    ).toBe(true);
    expect(
      isReplyArtifactResult({
        artifactId: "artifact_42",
        status: "FAILED",
        message: "Prior reply failed without provider acceptance",
        created: false,
      }),
    ).toBe(true);
    expect(
      isReplyArtifactResult({
        status: "PENDING_REVIEW",
        message: "Missing id",
        created: true,
      }),
    ).toBe(false);
    expect(
      isReplyArtifactResult({
        artifactId: "artifact_42",
        status: "MADE_UP",
        message: "Invalid status",
        created: false,
      }),
    ).toBe(false);
  });
});

describe("buildConversationsListPath", () => {
  it("whitelists filters, preserves false booleans, and forwards pagination", () => {
    expect(
      buildConversationsListPath({
        sentiment: "objection",
        unread: "false",
        needsReply: "true",
        archived: "false",
        leadId: "lead_42",
        search: "  Buyer & Pilot  ",
        page: "2",
        limit: "50",
        orgId: "must-not-forward",
      }),
    ).toEqual({
      success: true,
      path: "/conversations?sentiment=objection&unread=false&needsReply=true&archived=false&leadId=lead_42&search=Buyer+%26+Pilot&page=2&limit=50",
    });
  });

  it("rejects malformed booleans, repeated values, and unsafe pagination", () => {
    expect(buildConversationsListPath({ unread: "0" }).success).toBe(false);
    expect(
      buildConversationsListPath({ archived: ["true", "false"] }).success,
    ).toBe(false);
    expect(buildConversationsListPath({ page: "0" }).success).toBe(false);
    expect(buildConversationsListPath({ limit: "101" }).success).toBe(false);
    expect(buildConversationsListPath({ search: "   " }).success).toBe(false);
    expect(
      buildConversationsListPath({ search: "x".repeat(201) }).success,
    ).toBe(false);
    expect(
      buildConversationsListPath({ search: ["buyer", "pilot"] }).success,
    ).toBe(false);
  });
});

describe("conversations router", () => {
  it("proxies a safe list query and returns shaped data", async () => {
    const { client, get } = clientWith({});
    const result = await request(
      createConversationsRouter(client),
      "/conversations?unread=false&search=buyer%40example.com&page=2&limit=25&orgId=ignored",
    );

    expect(result.status).toBe(200);
    expect(get).toHaveBeenCalledOnce();
    expect(get.mock.calls[0][0]).toBe(
      "/conversations?unread=false&search=buyer%40example.com&page=2&limit=25",
    );
    expect(result.body).toMatchObject({
      items: [{ replyIntelligence: { analysisStatus: "READY" } }],
    });
  });

  it("returns 400 without calling upstream for an invalid list query", async () => {
    const { client, get } = clientWith({});
    const result = await request(
      createConversationsRouter(client),
      "/conversations?archived=not-a-boolean",
    );

    expect(result.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it("proxies detail with an encoded id", async () => {
    const { client, get } = clientWith({
      get: async () => detailResponse,
    });
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv%20one",
    );

    expect(result.status).toBe(200);
    expect(get.mock.calls[0][0]).toBe("/conversations/conv%20one");
    expect(result.body).toMatchObject({
      conversation: {
        id: "conv_1",
        replyIntelligence: { analysisStatus: "READY" },
      },
      messages: [{ direction: "inbound" }],
    });
  });

  it("maps draft-reply to a 202 TriggerResult", async () => {
    const { client, post } = clientWith({});
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv_1/draft-reply",
      { method: "POST" },
    );

    expect(result).toEqual({
      status: 202,
      body: {
        runId: "artifact_1",
        queued: false,
        message: "Reply draft ready for review",
      },
    });
    expect(post.mock.calls[0][0]).toBe("/conversations/conv_1/draft-reply");
  });

  it("returns an existing AI reply artifact idempotently", async () => {
    const { client } = clientWith({
      post: async () => ({
        artifactId: "artifact_sent",
        status: "SENT",
        message:
          "A reply has already been sent for the latest inbound message.",
        created: false,
      }),
    });
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv_1/draft-reply",
      { method: "POST" },
    );

    expect(result).toEqual({
      status: 200,
      body: {
        runId: "artifact_sent",
        queued: false,
        message:
          "A reply has already been sent for the latest inbound message.",
      },
    });
  });

  it("proxies archive and preserves the affected count", async () => {
    const { client, post } = clientWith({
      post: async () => ({ affected: 1 }),
    });
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv_1/archive",
      { method: "POST" },
    );

    expect(result).toEqual({ status: 200, body: { affected: 1 } });
    expect(post.mock.calls[0][0]).toBe("/conversations/conv_1/archive");
  });

  it("proxies archive restoration and preserves the affected count", async () => {
    const { client, post } = clientWith({
      post: async () => ({ affected: 1 }),
    });
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv_1/unarchive",
      { method: "POST" },
    );

    expect(result).toEqual({ status: 200, body: { affected: 1 } });
    expect(post.mock.calls[0][0]).toBe("/conversations/conv_1/unarchive");
  });

  it("marks a conversation read through the tenant-forwarding client", async () => {
    const { client, post } = clientWith({
      post: async () => ({ affected: 1 }),
    });
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv_1/read",
      { method: "POST" },
    );

    expect(result).toEqual({ status: 200, body: { affected: 1 } });
    expect(post.mock.calls[0][0]).toBe("/conversations/conv_1/read");
  });

  it("creates a human reply only as a review artifact", async () => {
    const { client, post } = clientWith({
      post: async () => ({
        artifactId: "artifact_human_1",
        status: "PENDING_REVIEW",
        message: "Reply draft created and held for human review.",
        created: true,
      }),
    });
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv_1/replies",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: "Re: workflow review",
          body: "Tuesday at 10 works for me.",
          orgId: "must-not-forward",
          status: "SENT",
        }),
      },
    );

    expect(result).toEqual({
      status: 201,
      body: {
        runId: "artifact_human_1",
        queued: false,
        message: "Reply draft created and held for human review.",
      },
    });
    expect(post.mock.calls[0][0]).toBe("/conversations/conv_1/replies");
    expect(post.mock.calls[0][2]).toEqual({
      subject: "Re: workflow review",
      body: "Tuesday at 10 works for me.",
    });
  });

  it("rejects a whitespace-only human reply before calling upstream", async () => {
    const { client, post } = clientWith({});
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv_1/replies",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "   " }),
      },
    );

    expect(result.status).toBe(400);
    expect(post).not.toHaveBeenCalled();
  });

  it("rejects reply subject header injection before calling upstream", async () => {
    const { client, post } = clientWith({});
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv_1/replies",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: "Re: Pilot\r\nBcc: attacker@example.com",
          body: "Tuesday works.",
        }),
      },
    );

    expect(result.status).toBe(400);
    expect(post).not.toHaveBeenCalled();
  });

  it("returns an existing sent reply idempotently without claiming a new draft", async () => {
    const { client } = clientWith({
      post: async () => ({
        artifactId: "artifact_unsafe",
        status: "SENT",
        message:
          "A reply has already been sent for the latest inbound message.",
        created: false,
      }),
    });
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv_1/replies",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "Tuesday works." }),
      },
    );

    expect(result).toEqual({
      status: 200,
      body: {
        runId: "artifact_unsafe",
        queued: false,
        message:
          "A reply has already been sent for the latest inbound message.",
      },
    });
  });

  it("returns an existing failed reply idempotently instead of a 502", async () => {
    const { client } = clientWith({
      post: async () => ({
        artifactId: "artifact_failed",
        status: "FAILED",
        message: "The prior reply failed without provider acceptance.",
        created: false,
      }),
    });
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv_1/replies",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "Try a separately reviewed reply." }),
      },
    );

    expect(result).toEqual({
      status: 200,
      body: {
        runId: "artifact_failed",
        queued: false,
        message: "The prior reply failed without provider acceptance.",
      },
    });
  });

  it("creates an internal follow-up with a parsed ISO datetime", async () => {
    const followUp = {
      id: "follow_up_1",
      conversationId: "conv_1",
      dueAt: "2026-08-20T09:00:00.000Z",
      note: "Share security notes",
      status: "OPEN",
      source: "HUMAN",
      createdAt: "2026-08-12T09:00:00.000Z",
      updatedAt: "2026-08-12T09:00:00.000Z",
    };
    const { client, post } = clientWith({ post: async () => followUp });
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv_1/follow-ups",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dueAt: followUp.dueAt,
          note: followUp.note,
          createdBy: "must-not-forward",
        }),
      },
    );

    expect(result).toEqual({ status: 201, body: followUp });
    expect(post.mock.calls[0][0]).toBe("/conversations/conv_1/follow-ups");
    expect(post.mock.calls[0][2]).toEqual({
      dueAt: new Date(followUp.dueAt),
      note: followUp.note,
    });
  });

  it("completes a follow-up with PATCH and no client-supplied actor", async () => {
    const { client, patch } = clientWith({});
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv_1/follow-ups/follow%20up",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "DONE", completedBy: "spoofed" }),
      },
    );

    expect(result.status).toBe(200);
    expect(patch.mock.calls[0][0]).toBe(
      "/conversations/conv_1/follow-ups/follow%20up",
    );
    expect(patch.mock.calls[0][2]).toEqual({ status: "DONE" });
  });

  it("records a meeting proposal without forwarding send fields", async () => {
    const { client, post } = clientWith({ post: async () => meetingResponse });
    const result = await request(
      createConversationsRouter(client),
      "/conversations/conv_1/meetings",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: meetingResponse.title,
          scheduledFor: meetingResponse.scheduledFor,
          durationMinutes: meetingResponse.durationMinutes,
          notes: meetingResponse.notes,
          sendInvite: true,
        }),
      },
    );

    expect(result).toEqual({ status: 201, body: meetingResponse });
    expect(post.mock.calls[0][0]).toBe("/conversations/conv_1/meetings");
    expect(post.mock.calls[0][2]).toEqual({
      title: meetingResponse.title,
      scheduledFor: new Date(meetingResponse.scheduledFor),
      durationMinutes: 45,
      notes: meetingResponse.notes,
    });
  });

  it("edits an active meeting without forwarding unknown fields", async () => {
    const updatedMeeting = { ...meetingResponse, status: "CONFIRMED" };
    const { client, patch } = clientWith({ patch: async () => updatedMeeting });
    const result = await request(
      createConversationsRouter(client),
      "/meetings/meeting%201",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Updated review",
          scheduledFor: "2026-08-22T11:30:00.000Z",
          durationMinutes: 60,
          notes: null,
          status: "COMPLETED",
        }),
      },
    );

    expect(result).toEqual({ status: 200, body: updatedMeeting });
    expect(patch.mock.calls[0][0]).toBe("/meetings/meeting%201");
    expect(patch.mock.calls[0][2]).toEqual({
      title: "Updated review",
      scheduledFor: new Date("2026-08-22T11:30:00.000Z"),
      durationMinutes: 60,
      notes: null,
    });
  });

  it("rejects an empty or malformed meeting update", async () => {
    const { client, patch } = clientWith({});
    const router = createConversationsRouter(client);
    const empty = await request(router, "/meetings/meeting_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    const fractionalDuration = await request(router, "/meetings/meeting_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ durationMinutes: 30.5 }),
    });

    expect(empty).toEqual({
      status: 400,
      body: { error: "Invalid meeting update" },
    });
    expect(fractionalDuration).toEqual({
      status: 400,
      body: { error: "Invalid meeting update" },
    });
    expect(patch).not.toHaveBeenCalled();
  });

  it.each([
    ["confirm", undefined],
    ["cancel", { reason: "Prospect rescheduled" }],
    ["complete", undefined],
    ["no-show", undefined],
  ])("forwards the meeting %s lifecycle action", async (action, body) => {
    const { client, post } = clientWith({
      post: async () => ({ ...meetingResponse, status: "CONFIRMED" }),
    });
    const result = await request(
      createConversationsRouter(client),
      `/meetings/meeting%201/${action}`,
      {
        method: "POST",
        ...(body
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      },
    );

    expect(result.status).toBe(200);
    expect(post.mock.calls[0][0]).toBe(`/meetings/meeting%201/${action}`);
    expect(post.mock.calls[0][2]).toEqual(body);
  });

  it("preserves an upstream error's status and JSON body", async () => {
    const { client } = clientWith({
      get: async () => {
        throw new UpstreamError(409, {
          error: "analysis_in_progress",
          message: "Conversation analysis is already running",
        });
      },
    });
    const result = await request(
      createConversationsRouter(client),
      "/conversations?page=1&limit=20",
    );

    expect(result).toEqual({
      status: 409,
      body: {
        error: "analysis_in_progress",
        message: "Conversation analysis is already running",
      },
    });
  });
});
