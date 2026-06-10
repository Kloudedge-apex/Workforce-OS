import { Router } from "express";
import { gapResponse } from "../lib/unavailable";

const router = Router();

/**
 * Phase-2 §R — conversations domain.
 *
 * VERDICT (release/go-live-2026-06-01 audit): ALL FOUR endpoints are TRUE GAPs.
 * The deployed apex-gtm-api has NO conversation/inbox/message/thread store:
 *   - No `/conversations` controller exists in apps/api/src.
 *   - The Prisma schema has NO Conversation / ConversationMessage / ReplyIntelligence
 *     model (the only `threadId` columns are LangGraph checkpoint ids, not email
 *     threads). OutreachArtifact is outbound-only with no inbound/thread/state fields.
 *   - Inbound Gmail replies are not persisted (maybeDispatchReply triggers a Reply
 *     Handler agent run and logs context to AgentLog; the reply_draft JSON is ephemeral).
 *   - The closest live surfaces (GET /api/inbox hardcoded `[]`, and the Gmail proxy
 *     endpoints) carry NONE of the FE conversation-state fields (leadName, unread,
 *     needsReply, archived, lastMessageAt, lastMessagePreview, replyIntelligence,
 *     sentiment, nextBestAction) and cannot be faithfully transformed.
 *
 * Per the BFF gap policy we degrade honestly: each endpoint returns
 * 200 { unavailable: true, feature } and NEVER fabricates conversation data.
 * A real implementation requires new Conversation + ConversationMessage +
 * ReplyIntelligence models, a Gmail-thread ingestion pipeline, a sentiment/NBA
 * classifier, and a persisted ReplyDraft entity upstream.
 */

router.get("/conversations", (_req, res) => {
  return gapResponse(res, "conversations");
});

router.get("/conversations/:id", (_req, res) => {
  return gapResponse(res, "conversation-detail");
});

router.post("/conversations/:id/draft-reply", (_req, res) => {
  return gapResponse(res, "conversation-draft-reply");
});

router.post("/conversations/:id/archive", (_req, res) => {
  return gapResponse(res, "conversation-archive");
});

export default router;
