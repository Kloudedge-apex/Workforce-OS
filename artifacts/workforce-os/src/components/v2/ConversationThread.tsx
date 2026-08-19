import React from "react";
import { Conversation, ConversationDetail } from "@workspace/api-client-react";
import { useDraftReply } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";
import { Sparkles, Bot, AlertTriangle } from "lucide-react";
import { SentimentBadge } from "@/components/v2/SentimentBadge";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ConversationActions } from "@/components/v2/ConversationActions";
import { decisionErrorMessage } from "@/lib/decisionError";

interface ConversationThreadProps {
  mode: "preview" | "full";
  conversation?: Conversation;
  detail?: ConversationDetail;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

export function ConversationThread({
  mode,
  conversation,
  detail,
  selected,
  onSelect,
}: ConversationThreadProps) {
  const draftReplyMut = useDraftReply();
  const [, setLocation] = useLocation();

  const handleDraftReply = async () => {
    if (!detail) return;
    toast("Generating draft reply...");
    try {
      const res = await draftReplyMut.mutateAsync({
        id: detail.conversation.id,
      });
      toast(res.message);
      setLocation(`/outbound/${res.runId}`);
    } catch (error) {
      toast.error(decisionErrorMessage(error));
    }
  };

  if (mode === "preview" && conversation) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`Open conversation with ${conversation.leadName}: ${conversation.subject}`}
        className={cn(
          "hover-elevate active-elevate-2 p-4 pl-5 border-b border-paper-200 cursor-pointer transition-colors flex gap-3 relative",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust-500/40 focus-visible:ring-inset",
          selected
            ? "bg-paper-100 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-rust-500"
            : "hover:bg-paper-100/60",
        )}
        onClick={() => onSelect?.(conversation.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect?.(conversation.id);
          }
        }}
      >
        {conversation.unread && (
          <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-rust-500" />
        )}
        <Avatar className="h-10 w-10 border border-paper-200">
          <AvatarImage src={conversation.leadAvatarUrl || undefined} />
          <AvatarFallback className="bg-paper-200 text-ink-900 font-serif">
            {conversation.leadName.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-1">
            <h4
              className={cn(
                "text-sm truncate",
                conversation.unread
                  ? "font-bold text-ink-900"
                  : "font-medium text-ink-900",
              )}
            >
              {conversation.leadName}
            </h4>
            <span className="text-[10px] text-ink-400 whitespace-nowrap font-tabular ml-2">
              {formatDistanceToNow(new Date(conversation.lastMessageAt), {
                addSuffix: true,
              })}
            </span>
          </div>
          <p className="text-xs text-ink-900 font-serif truncate mb-1">
            {conversation.subject}
          </p>
          <p className="text-xs text-ink-400 truncate mb-2">
            {conversation.lastMessagePreview}
          </p>
          <div className="flex items-center gap-2">
            {conversation.replyIntelligence.analysisStatus === "READY" &&
            conversation.replyIntelligence.sentiment !== null ? (
              <SentimentBadge
                sentiment={conversation.replyIntelligence.sentiment}
                dense
              />
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 bg-paper-100 text-ink-500 border-paper-300"
              >
                {conversation.replyIntelligence.analysisStatus === "FAILED"
                  ? "Analysis failed"
                  : "Analysis pending"}
              </Badge>
            )}
            {conversation.needsReply && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 bg-rust-100 text-rust-500 border-rust-200"
              >
                Needs Reply
              </Badge>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (mode === "full" && detail) {
    const { conversation, messages } = detail;
    const { replyIntelligence } = conversation;
    const analysisReady =
      replyIntelligence.analysisStatus === "READY" &&
      replyIntelligence.sentiment !== null &&
      replyIntelligence.sentimentConfidence !== null &&
      replyIntelligence.nextBestAction !== null &&
      replyIntelligence.nextBestActionType !== null;

    return (
      <div className="flex flex-col h-full bg-paper-50 relative">
        {/* Reply Intelligence Strip */}
        <div className="shrink-0 p-4 border-b border-paper-200 bg-paper-100 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-rust-500" />
              <span className="text-sm font-medium text-ink-900">
                AI Analysis
              </span>
            </div>
            {analysisReady ? (
              <>
                <div className="h-4 w-px bg-paper-200" />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-700">Sentiment:</span>
                  <span className="text-xs font-semibold capitalize text-ink-900">
                    {replyIntelligence.sentiment}
                  </span>
                  <span className="text-[10px] text-ink-400 font-tabular">
                    ({(replyIntelligence.sentimentConfidence! * 100).toFixed(0)}
                    %)
                  </span>
                </div>
                <div className="h-4 w-px bg-paper-200" />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-700">Action:</span>
                  <Badge
                    variant="secondary"
                    className="bg-paper-200 text-ink-900 hover:bg-paper-200"
                  >
                    {replyIntelligence.nextBestAction!.replace(/_/g, " ")}
                  </Badge>
                </div>
              </>
            ) : (
              <Badge
                variant="outline"
                className="border-paper-300 text-ink-600"
              >
                {replyIntelligence.analysisStatus === "FAILED"
                  ? "Analysis failed — retry draft generation"
                  : "Analysis pending"}
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            className="bg-rust-500 hover:bg-rust-500/90 text-white shadow-sm"
            onClick={handleDraftReply}
            disabled={draftReplyMut.isPending}
          >
            <Sparkles className="h-3 w-3 mr-2" />
            Draft Reply
          </Button>
        </div>

        <ConversationActions
          detail={detail}
          className="max-h-[42vh] shrink-0 overflow-y-auto border-b border-paper-200 bg-paper-50 p-4"
        />

        {/* Thread */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="border-b border-paper-200 pb-4 mb-6">
            <h2 className="text-xl font-serif text-ink-900">
              {conversation.subject}
            </h2>
            <p className="text-sm text-ink-400 mt-1">
              Between you and {conversation.leadName} (
              {conversation.leadCompany})
            </p>
          </div>

          {messages.map((msg) => {
            const isInbound = msg.direction === "inbound";
            return (
              <div
                key={msg.id}
                className={cn("flex max-w-[85%]", isInbound ? "ml-auto" : "")}
              >
                {!isInbound && (
                  <Avatar className="h-8 w-8 mr-3 mt-1 shrink-0 border border-paper-200">
                    <AvatarFallback className="bg-rust-100 text-rust-500 text-xs font-medium">
                      YOU
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    "rounded-lg p-4 border",
                    isInbound
                      ? "bg-paper-100 border-paper-200"
                      : "bg-white border-paper-200 shadow-sm",
                  )}
                >
                  <div className="flex items-center justify-between mb-2 gap-4">
                    <span className="text-xs font-semibold text-ink-900">
                      {msg.senderName}
                    </span>
                    <span className="text-[10px] text-ink-400 font-tabular whitespace-nowrap">
                      {format(new Date(msg.sentAt), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <div
                    className="prose prose-sm prose-ink max-w-none text-ink-700 leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(msg.bodyHtml),
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
