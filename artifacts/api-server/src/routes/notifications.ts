import { Router } from "express";
import { db } from "@workspace/db";
import { inAppNotificationsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const router = Router();
const ORG_ID = "org_mynoted";

router.get("/notifications", async (req, res) => {
  const all = await db
    .select()
    .from(inAppNotificationsTable)
    .where(eq(inAppNotificationsTable.orgId, ORG_ID))
    .orderBy(desc(inAppNotificationsTable.createdAt))
    .limit(10);

  const unreadCount = all.filter((n) => !n.read).length;

  type NotifRow = typeof all[0];
  res.json({
    items: all.map((n: NotifRow) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.read,
      link: n.link ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  });
});

router.post("/notifications/mark-read", async (req, res) => {
  const unread = await db
    .select()
    .from(inAppNotificationsTable)
    .where(
      and(
        eq(inAppNotificationsTable.orgId, ORG_ID),
        eq(inAppNotificationsTable.read, false),
      ),
    );

  for (const n of unread) {
    await db
      .update(inAppNotificationsTable)
      .set({ read: true })
      .where(eq(inAppNotificationsTable.id, n.id));
  }

  res.json({ affected: unread.length });
});

export default router;
