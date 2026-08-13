import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  ArchiveConversationParams,
  CreateConversationFollowUpBody,
  CreateConversationFollowUpParams,
  CreateConversationMeetingBody,
  CreateConversationMeetingParams,
  CreateConversationReplyBody,
  CreateConversationReplyParams,
  DraftReplyParams,
  GetConversationParams,
  ListConversationsQueryParams,
  MarkConversationReadParams,
  UpdateConversationFollowUpBody,
  UpdateConversationFollowUpParams,
  type BulkActionResult,
  type Conversation,
  type ConversationDetail,
  type ConversationFollowUp,
  type ConversationMeeting,
  type PaginatedConversations,
  type ReplyIntelligence,
  type TriggerResult,
  OutreachArtifactStatus,
} from "@workspace/api-zod";
import { apex, UpstreamError } from "../upstream/apex-client";

export type AnalysisStatus = "PENDING" | "READY" | "FAILED";

export interface UpstreamReplyIntelligence {
  status: AnalysisStatus;
  sentiment: ReplyIntelligence["sentiment"] | null;
  sentimentConfidence: number | null;
  nextBestAction: string | null;
  nextBestActionType: ReplyIntelligence["nextBestActionType"] | null;
}

export type UpstreamConversation = Omit<Conversation, "replyIntelligence"> & {
  replyIntelligence: UpstreamReplyIntelligence;
};

export interface ShapedReplyIntelligence {
  analysisStatus: AnalysisStatus;
  sentiment: ReplyIntelligence["sentiment"] | null;
  sentimentConfidence: number | null;
  nextBestAction: string | null;
  nextBestActionType: ReplyIntelligence["nextBestActionType"] | null;
}

export type ConversationWithAnalysisStatus = Omit<
  Conversation,
  "replyIntelligence"
> & {
  replyIntelligence: ShapedReplyIntelligence;
};

export type UpstreamPaginatedConversations = Omit<
  PaginatedConversations,
  "items"
> & {
  items: UpstreamConversation[];
};

export type PaginatedConversationsWithAnalysisStatus = Omit<
  PaginatedConversations,
  "items"
> & {
  items: ConversationWithAnalysisStatus[];
};

export type UpstreamConversationDetail = Omit<
  ConversationDetail,
  "conversation"
> & {
  conversation: UpstreamConversation;
};

export type ConversationDetailWithAnalysisStatus = Omit<
  ConversationDetail,
  "conversation"
> & {
  conversation: ConversationWithAnalysisStatus;
};

export interface UpstreamDraftReplyResult {
  artifactId: string;
  status: string;
  message: string;
  created: boolean;
}

const ARTIFACT_STATUSES: ReadonlySet<string> = new Set(
  Object.values(OutreachArtifactStatus),
);

export function isReplyArtifactResult(
  value: unknown,
): value is UpstreamDraftReplyResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.artifactId === "string" &&
    result.artifactId.trim().length > 0 &&
    typeof result.status === "string" &&
    ARTIFACT_STATUSES.has(result.status) &&
    typeof result.message === "string" &&
    typeof result.created === "boolean"
  );
}

export function shapeReplyIntelligence(
  upstream: UpstreamReplyIntelligence,
): ShapedReplyIntelligence {
  if (
    upstream.status !== "READY" ||
    upstream.sentiment === null ||
    upstream.sentimentConfidence === null ||
    upstream.nextBestAction === null ||
    upstream.nextBestActionType === null
  ) {
    const status: AnalysisStatus =
      upstream.status === "PENDING" ? "PENDING" : "FAILED";
    return {
      sentiment: null,
      sentimentConfidence: null,
      nextBestAction: null,
      nextBestActionType: null,
      analysisStatus: status,
    };
  }

  return {
    sentiment: upstream.sentiment,
    sentimentConfidence: upstream.sentimentConfidence,
    nextBestAction: upstream.nextBestAction,
    nextBestActionType: upstream.nextBestActionType,
    analysisStatus: "READY",
  };
}

export function shapeConversation(
  upstream: UpstreamConversation,
): ConversationWithAnalysisStatus {
  return {
    ...upstream,
    replyIntelligence: shapeReplyIntelligence(upstream.replyIntelligence),
  };
}

export function shapeConversationsList(
  upstream: UpstreamPaginatedConversations,
): PaginatedConversationsWithAnalysisStatus {
  return {
    ...upstream,
    items: upstream.items.map(shapeConversation),
  };
}

export function shapeConversationDetail(
  upstream: UpstreamConversationDetail,
): ConversationDetailWithAnalysisStatus {
  return {
    ...upstream,
    conversation: shapeConversation(upstream.conversation),
  };
}

export function shapeDraftReply(
  upstream: UpstreamDraftReplyResult,
): TriggerResult {
  return {
    // The upstream artifact already exists (new or idempotently reused), so
    // this is an artifact target rather than a still-queued generation job.
    runId: upstream.artifactId,
    queued: false,
    message: upstream.message,
  };
}

export type ConversationListPathResult =
  | { success: true; path: string }
  | { success: false; error: string };

const LIST_QUERY_KEYS = [
  "sentiment",
  "unread",
  "needsReply",
  "archived",
  "leadId",
  "search",
  "page",
  "limit",
] as const;

const BOOLEAN_QUERY_KEYS = ["unread", "needsReply", "archived"] as const;

/**
 * Whitelist and normalize the public list query before forwarding it. In
 * particular, do not pass raw Express query values upstream: repeated params
 * become arrays, and z.coerce.boolean() would otherwise turn the string
 * "false" into true.
 */
export function buildConversationsListPath(
  query: Record<string, unknown>,
): ConversationListPathResult {
  const normalized: Record<string, unknown> = {};

  for (const key of LIST_QUERY_KEYS) {
    const value = query[key];
    if (value === undefined) continue;
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      return { success: false, error: `Invalid ${key} query parameter` };
    }
    normalized[key] = value;
  }

  for (const key of BOOLEAN_QUERY_KEYS) {
    const value = normalized[key];
    if (value === undefined || typeof value === "boolean") continue;
    if (value === "true") {
      normalized[key] = true;
    } else if (value === "false") {
      normalized[key] = false;
    } else {
      return { success: false, error: `Invalid ${key} query parameter` };
    }
  }

  const rawSearch = normalized.search;
  delete normalized.search;
  let search: string | undefined;
  if (rawSearch !== undefined) {
    if (typeof rawSearch !== "string") {
      return { success: false, error: "Invalid search query parameter" };
    }
    search = rawSearch.trim();
    if (search.length === 0 || search.length > 200) {
      return { success: false, error: "Invalid search query parameter" };
    }
  }

  const parsed = ListConversationsQueryParams.safeParse(normalized);
  if (!parsed.success) {
    return { success: false, error: "Invalid conversations query" };
  }

  const { page, limit } = parsed.data;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return { success: false, error: "Invalid pagination query" };
  }

  if (parsed.data.leadId !== undefined && parsed.data.leadId.trim() === "") {
    return { success: false, error: "Invalid leadId query parameter" };
  }

  const params = new URLSearchParams();
  if (parsed.data.sentiment !== undefined) {
    params.set("sentiment", parsed.data.sentiment);
  }
  if (parsed.data.unread !== undefined) {
    params.set("unread", String(parsed.data.unread));
  }
  if (parsed.data.needsReply !== undefined) {
    params.set("needsReply", String(parsed.data.needsReply));
  }
  if (parsed.data.archived !== undefined) {
    params.set("archived", String(parsed.data.archived));
  }
  if (parsed.data.leadId !== undefined) {
    params.set("leadId", parsed.data.leadId);
  }
  if (search !== undefined) {
    params.set("search", search);
  }
  params.set("page", String(page));
  params.set("limit", String(limit));

  return { success: true, path: `/conversations?${params.toString()}` };
}

export type ConversationsUpstreamClient = Pick<
  typeof apex,
  "get" | "post" | "patch"
>;

function forwardUpstreamError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (!(error instanceof UpstreamError)) {
    next(error);
    return;
  }

  if (typeof error.body === "string") {
    res.status(error.status).send(error.body);
    return;
  }

  res.status(error.status).json(error.body);
}

export function createConversationsRouter(
  upstreamClient: ConversationsUpstreamClient = apex,
): Router {
  const router = Router();

  router.get(
    "/conversations",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const query = buildConversationsListPath(req.query);
      if (!query.success) {
        res.status(400).json({ error: query.error });
        return;
      }

      try {
        const upstream = (await upstreamClient.get(query.path, {
          req,
        })) as UpstreamPaginatedConversations;
        res.json(shapeConversationsList(upstream));
      } catch (error) {
        forwardUpstreamError(error, res, next);
      }
    },
  );

  router.get(
    "/conversations/:id",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const parsed = GetConversationParams.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid params" });
        return;
      }

      try {
        const upstream = (await upstreamClient.get(
          `/conversations/${encodeURIComponent(parsed.data.id)}`,
          { req },
        )) as UpstreamConversationDetail;
        res.json(shapeConversationDetail(upstream));
      } catch (error) {
        forwardUpstreamError(error, res, next);
      }
    },
  );

  router.post(
    "/conversations/:id/draft-reply",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const parsed = DraftReplyParams.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid params" });
        return;
      }

      try {
        const upstream = await upstreamClient.post(
          `/conversations/${encodeURIComponent(parsed.data.id)}/draft-reply`,
          { req },
        );
        if (!isReplyArtifactResult(upstream)) {
          res
            .status(502)
            .json({ error: "Reply artifact response was invalid" });
          return;
        }
        res
          .status(upstream.created ? 202 : 200)
          .json(shapeDraftReply(upstream));
      } catch (error) {
        forwardUpstreamError(error, res, next);
      }
    },
  );

  router.post(
    "/conversations/:id/read",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const parsed = MarkConversationReadParams.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid params" });
        return;
      }

      try {
        const upstream = (await upstreamClient.post(
          `/conversations/${encodeURIComponent(parsed.data.id)}/read`,
          { req },
        )) as BulkActionResult;
        res.json(upstream);
      } catch (error) {
        forwardUpstreamError(error, res, next);
      }
    },
  );

  router.post(
    "/conversations/:id/replies",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const params = CreateConversationReplyParams.safeParse(req.params);
      const body = CreateConversationReplyBody.safeParse(req.body);
      if (
        !params.success ||
        !body.success ||
        body.data.body.trim().length === 0 ||
        (body.data.subject !== undefined &&
          body.data.subject.trim().length === 0)
      ) {
        res.status(400).json({ error: "Invalid reply draft" });
        return;
      }

      try {
        const upstream = await upstreamClient.post(
          `/conversations/${encodeURIComponent(params.data.id)}/replies`,
          { req },
          body.data,
        );
        if (!isReplyArtifactResult(upstream)) {
          res.status(502).json({
            error: "Reply artifact response was invalid",
          });
          return;
        }
        res
          .status(upstream.created ? 201 : 200)
          .json(shapeDraftReply(upstream));
      } catch (error) {
        forwardUpstreamError(error, res, next);
      }
    },
  );

  router.post(
    "/conversations/:id/follow-ups",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const params = CreateConversationFollowUpParams.safeParse(req.params);
      const body = CreateConversationFollowUpBody.safeParse(req.body);
      if (
        !params.success ||
        typeof req.body?.dueAt !== "string" ||
        !body.success
      ) {
        res.status(400).json({ error: "Invalid follow-up reminder" });
        return;
      }

      try {
        const upstream = (await upstreamClient.post(
          `/conversations/${encodeURIComponent(params.data.id)}/follow-ups`,
          { req },
          body.data,
        )) as ConversationFollowUp;
        res.status(201).json(upstream);
      } catch (error) {
        forwardUpstreamError(error, res, next);
      }
    },
  );

  router.patch(
    "/conversations/:id/follow-ups/:followUpId",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const params = UpdateConversationFollowUpParams.safeParse(req.params);
      const body = UpdateConversationFollowUpBody.safeParse(req.body);
      if (!params.success || !body.success) {
        res.status(400).json({ error: "Invalid follow-up update" });
        return;
      }

      try {
        const upstream = (await upstreamClient.patch(
          `/conversations/${encodeURIComponent(params.data.id)}/follow-ups/${encodeURIComponent(params.data.followUpId)}`,
          { req },
          body.data,
        )) as ConversationFollowUp;
        res.json(upstream);
      } catch (error) {
        forwardUpstreamError(error, res, next);
      }
    },
  );

  router.post(
    "/conversations/:id/meetings",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const params = CreateConversationMeetingParams.safeParse(req.params);
      const body = CreateConversationMeetingBody.safeParse(req.body);
      if (
        !params.success ||
        typeof req.body?.scheduledFor !== "string" ||
        !body.success ||
        (body.data.durationMinutes !== undefined &&
          !Number.isInteger(body.data.durationMinutes)) ||
        (body.data.title !== undefined && body.data.title.trim().length === 0)
      ) {
        res.status(400).json({ error: "Invalid meeting proposal" });
        return;
      }

      try {
        const upstream = (await upstreamClient.post(
          `/conversations/${encodeURIComponent(params.data.id)}/meetings`,
          { req },
          body.data,
        )) as ConversationMeeting;
        res.status(201).json(upstream);
      } catch (error) {
        forwardUpstreamError(error, res, next);
      }
    },
  );

  router.post(
    "/conversations/:id/archive",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const parsed = ArchiveConversationParams.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid params" });
        return;
      }

      try {
        const upstream = (await upstreamClient.post(
          `/conversations/${encodeURIComponent(parsed.data.id)}/archive`,
          { req },
        )) as BulkActionResult;
        res.json(upstream);
      } catch (error) {
        forwardUpstreamError(error, res, next);
      }
    },
  );

  return router;
}

export default createConversationsRouter();
