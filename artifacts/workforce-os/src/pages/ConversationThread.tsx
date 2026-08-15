import React from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetConversation,
  useDraftReply,
  useArchiveConversation,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Archive,
  Sparkles,
  MessageSquareDashed,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { isUnavailable, UnavailableState } from "@/lib/unavailable";
import { sanitizeHtml } from "@/lib/sanitize";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { CountUp } from "@/components/motion/CountUp";
import { motion } from "framer-motion";
import { cardEnter, springHover, useReducedMotionSafe } from "@/lib/motion";
import { ConversationActions } from "@/components/v2/ConversationActions";
import { CONVERSATION_REFRESH_INTERVAL_MS } from "@/lib/conversationRefresh";

const SENTIMENT_STYLES = {
  positive: "bg-green-100 text-green-800 border-green-200",
  objection: "bg-amber-100 text-amber-800 border-amber-200",
  neutral: "bg-paper-200 text-ink-600 border-paper-300",
  negative: "bg-red-100 text-red-800 border-red-200",
};

export default function ConversationThread() {
  const reduced = useReducedMotionSafe();
  const [, params] = useRoute("/conversations/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";

  const { data, isLoading, isError, refetch } = useGetConversation(id, {
    query: {
      queryKey: ["getConversation", id],
      enabled: !!id,
      refetchInterval: CONVERSATION_REFRESH_INTERVAL_MS,
    },
  });

  const { mutate: draftReply, isPending: drafting } = useDraftReply({
    mutation: {
      onSuccess: (res) => {
        if (isUnavailable(res)) {
          toast("Not available yet — coming soon");
          return;
        }
        toast(res.message);
        navigate(`/outbound/${res.runId}`);
      },
      onError: () => toast.error("Failed to queue draft"),
    },
  });

  const { mutate: archive } = useArchiveConversation({
    mutation: {
      onSuccess: (res) => {
        if (isUnavailable(res)) {
          toast("Not available yet — coming soon");
          return;
        }
        toast.success("Archived");
        navigate("/conversations");
      },
    },
  });

  if (isLoading)
    return (
      <div className="flex flex-col h-full p-6 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );

  if (isError && !data)
    return (
      <div className="flex h-full items-center justify-center bg-paper-50">
        <ErrorState
          title="Couldn't load this conversation"
          description="The conversation service didn't respond. Your data is safe — try again."
          onRetry={() => refetch()}
        />
      </div>
    );

  if (isUnavailable(data))
    return (
      <div className="flex h-full items-center justify-center bg-paper-50">
        <UnavailableState feature="conversation detail" />
      </div>
    );

  if (!data)
    return (
      <div className="flex h-full items-center justify-center bg-paper-50">
        <EmptyState
          icon={MessageSquareDashed}
          title="Conversation not found"
          description="This thread may have been archived or moved. Head back to your inbox to find it."
        />
      </div>
    );

  const { conversation: conv, messages } = data;
  const ri = conv.replyIntelligence;
  const analysisReady =
    ri.analysisStatus === "READY" &&
    ri.sentiment !== null &&
    ri.sentimentConfidence !== null &&
    ri.nextBestAction !== null &&
    ri.nextBestActionType !== null;

  return (
    <div className="flex flex-col h-full bg-paper-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-paper-100 border-b border-paper-200 px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/conversations")}
          className="text-ink-600 hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Conversations
        </Button>
        <span className="text-ink-300">/</span>
        <span className="text-sm font-medium text-ink-900 truncate flex-1">
          {conv.subject}
        </span>
        <div className="flex items-center gap-2">
          {!conv.archived && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => archive({ id })}
              className="text-ink-500 hover:text-ink-900"
            >
              <Archive className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* Message thread */}
        <Stagger className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => {
            const isOut = msg.direction === "outbound";
            return (
              <StaggerItem
                key={msg.id}
                className={cn("flex", isOut ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-4 py-3 shadow-sm",
                    isOut
                      ? "bg-ink-900 text-paper-50"
                      : "bg-ink-0 border border-paper-200 text-ink-900 dark:text-paper-50",
                  )}
                >
                  <div
                    className="text-sm leading-relaxed prose prose-sm max-w-none"
                    style={{ color: "inherit" }}
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(msg.bodyHtml),
                    }}
                  />
                  <p
                    className={cn(
                      "text-xs mt-2",
                      isOut ? "text-paper-400" : "text-ink-400",
                    )}
                  >
                    {msg.senderName} · {new Date(msg.sentAt).toLocaleString()}
                  </p>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>

        {/* Reply intelligence sidebar */}
        {ri && (
          <motion.div
            className="w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-paper-200 bg-ink-0 shadow-md overflow-y-auto"
            variants={reduced ? undefined : cardEnter}
            initial={reduced ? undefined : "hidden"}
            animate={reduced ? undefined : "visible"}
          >
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">
                  Reply Intelligence
                </p>
                {analysisReady ? (
                  <Badge
                    className={cn(
                      "text-xs border",
                      SENTIMENT_STYLES[ri.sentiment!],
                    )}
                  >
                    {ri.sentiment} ·{" "}
                    <CountUp value={ri.sentimentConfidence! * 100} suffix="%" />
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-xs border-paper-300 text-ink-600"
                  >
                    {ri.analysisStatus === "FAILED"
                      ? "Analysis failed"
                      : "Analysis pending"}
                  </Badge>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">
                  Next Best Action
                </p>
                {analysisReady ? (
                  <div className="bg-rust-50 border border-rust-200 rounded-lg p-3 shadow-sm">
                    <p className="text-sm text-rust-900">{ri.nextBestAction}</p>
                    <p className="text-xs text-rust-500 mt-1 capitalize">
                      {ri.nextBestActionType?.replace(/_/g, " ")}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-ink-500">
                    Generate a draft to analyze this reply. Nothing will be sent
                    without review.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <motion.div
                  variants={reduced ? undefined : springHover}
                  initial="rest"
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Button
                    className="w-full bg-rust-500 hover:bg-rust-600 text-white"
                    size="sm"
                    onClick={() => draftReply({ id })}
                    disabled={drafting}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {drafting ? "Drafting…" : "Draft Reply"}
                  </Button>
                </motion.div>
                <motion.div
                  variants={reduced ? undefined : springHover}
                  initial="rest"
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Button
                    variant="outline"
                    className="w-full border-paper-300"
                    size="sm"
                    onClick={() => archive({ id })}
                  >
                    <Archive className="h-4 w-4 mr-2" /> Archive
                  </Button>
                </motion.div>
              </div>

              <ConversationActions
                detail={data}
                className="border-t border-paper-200 pt-4"
              />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
