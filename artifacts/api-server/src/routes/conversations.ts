import { Router } from "express";
import { db } from "@workspace/db";
import { conversationsTable, conversationMessagesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  ListConversationsQueryParams,
  GetConversationParams,
  DraftReplyParams,
} from "@workspace/api-zod";

const router = Router();

const ORG_ID = "org_mynoted";

function shapeConversation(c: typeof conversationsTable.$inferSelect, preview: string) {
  return {
    id: c.id,
    leadName: c.leadName,
    leadCompany: c.leadCompany,
    leadAvatarUrl: c.leadAvatarUrl ?? null,
    subject: c.subject,
    lastMessagePreview: preview,
    lastMessageAt: c.lastMessageAt.toISOString(),
    unread: c.unread,
    needsReply: c.needsReply,
    archived: c.archived,
    replyIntelligence: {
      sentiment: c.sentiment,
      sentimentConfidence: c.sentimentConfidence,
      nextBestAction: c.nextBestAction ?? "Schedule a follow-up call",
      nextBestActionType: c.nextBestActionType ?? "follow_up",
    },
  };
}

router.get("/conversations", async (req, res) => {
  const parsed = ListConversationsQueryParams.safeParse(req.query);
  const page = parsed.success ? (parsed.data.page ?? 1) : 1;
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;
  const offset = (page - 1) * limit;

  const sentimentFilter = parsed.success ? parsed.data.sentiment : undefined;
  const unreadFilter = parsed.success ? parsed.data.unread : undefined;
  const needsReplyFilter = parsed.success ? parsed.data.needsReply : undefined;
  const archivedFilter = parsed.success ? parsed.data.archived : undefined;

  let whereClause = eq(conversationsTable.orgId, ORG_ID);

  const conversations = await db
    .select()
    .from(conversationsTable)
    .where(whereClause)
    .orderBy(desc(conversationsTable.lastMessageAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversationsTable)
    .where(whereClause);

  const filtered = conversations.filter((c) => {
    if (sentimentFilter && c.sentiment !== sentimentFilter) return false;
    if (unreadFilter !== undefined && c.unread !== unreadFilter) return false;
    if (needsReplyFilter !== undefined && c.needsReply !== needsReplyFilter) return false;
    if (archivedFilter !== undefined && c.archived !== archivedFilter) return false;
    return true;
  });

  const lastMessages = await Promise.all(
    filtered.map((c) =>
      db
        .select()
        .from(conversationMessagesTable)
        .where(eq(conversationMessagesTable.conversationId, c.id))
        .orderBy(desc(conversationMessagesTable.sentAt))
        .limit(1),
    ),
  );

  res.json({
    items: filtered.map((c, i) => {
      const lastMsg = lastMessages[i]?.[0];
      const preview = lastMsg
        ? lastMsg.bodyHtml.replace(/<[^>]*>/g, "").slice(0, 120)
        : "";
      return shapeConversation(c, preview);
    }),
    total: Number(countResult[0]?.count ?? 0),
    page,
    limit,
  });
});

router.get("/conversations/:id", async (req, res) => {
  const parsed = GetConversationParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, parsed.data.id),
        eq(conversationsTable.orgId, ORG_ID),
      ),
    );

  if (!conversation) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const messages = await db
    .select()
    .from(conversationMessagesTable)
    .where(eq(conversationMessagesTable.conversationId, conversation.id))
    .orderBy(conversationMessagesTable.sentAt);

  const lastMsg = messages[messages.length - 1];
  const preview = lastMsg
    ? lastMsg.bodyHtml.replace(/<[^>]*>/g, "").slice(0, 120)
    : "";

  res.json({
    conversation: shapeConversation(conversation, preview),
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      bodyHtml: m.bodyHtml,
      sentAt: m.sentAt.toISOString(),
      senderName: m.senderName,
    })),
    pendingDraftId: null,
  });
});

router.post("/conversations/:id/draft-reply", async (req, res) => {
  const parsed = DraftReplyParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const runId = `run_${Date.now()}`;
  res.status(202).json({
    runId,
    queued: true,
    message: "Reply draft queued",
  });
});

export default router;
