import { Router } from "express";
import { db } from "@workspace/db";
import {
  outreachArtifactsTable,
  conversationsTable,
  leadsTable,
} from "@workspace/db";
import { eq, and, gte, sql, isNotNull } from "drizzle-orm";

const router = Router();

const ORG_ID = "org_mynoted";

router.get("/today/kpis", async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [pendingRows, sentTodayRows, totalSentRows, repliedRows, meetingsRows, leadsSourcedRows, leadsScoredRows] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(outreachArtifactsTable)
        .where(
          and(
            eq(outreachArtifactsTable.orgId, ORG_ID),
            eq(outreachArtifactsTable.status, "PENDING_REVIEW"),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(outreachArtifactsTable)
        .where(
          and(
            eq(outreachArtifactsTable.orgId, ORG_ID),
            eq(outreachArtifactsTable.status, "SENT"),
            gte(outreachArtifactsTable.sentAt, todayStart),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(outreachArtifactsTable)
        .where(
          and(
            eq(outreachArtifactsTable.orgId, ORG_ID),
            eq(outreachArtifactsTable.status, "SENT"),
            gte(outreachArtifactsTable.sentAt, sevenDaysAgo),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.orgId, ORG_ID),
            gte(conversationsTable.lastMessageAt, sevenDaysAgo),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.orgId, ORG_ID),
            eq(conversationsTable.sentiment, "positive"),
            gte(conversationsTable.lastMessageAt, sevenDaysAgo),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.orgId, ORG_ID),
            gte(leadsTable.createdAt, todayStart),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.orgId, ORG_ID),
            isNotNull(leadsTable.score),
          ),
        ),
    ]);

  const totalSent = Number(totalSentRows[0]?.count ?? 0);
  const replied = Number(repliedRows[0]?.count ?? 0);
  const replyRate = totalSent > 0 ? Math.round((replied / totalSent) * 100) / 100 : 0;

  res.json({
    artifactsPending: Number(pendingRows[0]?.count ?? 0),
    artifactsSentToday: Number(sentTodayRows[0]?.count ?? 0),
    replyRate7d: replyRate,
    qualifiedMeetingsBooked: Number(meetingsRows[0]?.count ?? 0),
    leadsSourcedToday: Number(leadsSourcedRows[0]?.count ?? 0),
    leadsScored: Number(leadsScoredRows[0]?.count ?? 0),
  });
});

export default router;
