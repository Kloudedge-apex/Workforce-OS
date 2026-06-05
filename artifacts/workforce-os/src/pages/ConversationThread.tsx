import React from "react";
import { useRoute, useLocation } from "wouter";
import { useGetConversation, useDraftReply, useArchiveConversation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MessageSquare, Archive, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SENTIMENT_STYLES = {
  positive: "bg-green-100 text-green-800 border-green-200",
  objection: "bg-amber-100 text-amber-800 border-amber-200",
  neutral: "bg-paper-200 text-ink-600 border-paper-300",
  negative: "bg-red-100 text-red-800 border-red-200",
};

export default function ConversationThread() {
  const [, params] = useRoute("/conversations/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";

  const { data, isLoading, refetch } = useGetConversation(id, {
    query: { queryKey: ["getConversation", id], enabled: !!id },
  });

  const { mutate: draftReply, isPending: drafting } = useDraftReply({
    mutation: {
      onSuccess: () => { toast.success("Reply draft queued"); refetch(); },
      onError: () => toast.error("Failed to queue draft"),
    },
  });

  const { mutate: archive } = useArchiveConversation({
    mutation: {
      onSuccess: () => { toast.success("Archived"); navigate("/conversations"); },
    },
  });

  if (isLoading) return (
    <div className="flex flex-col h-full p-6 space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );

  if (!data) return <div className="p-6 text-ink-400">Conversation not found</div>;

  const { conversation: conv, messages } = data;
  const ri = conv.replyIntelligence;

  return (
    <div className="flex flex-col h-full bg-paper-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-paper-100 border-b border-paper-200 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/conversations")} className="text-ink-600 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4 mr-1" /> Conversations
        </Button>
        <span className="text-ink-300">/</span>
        <span className="text-sm font-medium text-ink-900 truncate flex-1">{conv.subject}</span>
        <div className="flex items-center gap-2">
          {!conv.archived && (
            <Button variant="ghost" size="sm" onClick={() => archive({ id })} className="text-ink-500 hover:text-ink-900">
              <Archive className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* Message thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => {
            const isOut = msg.direction === "outbound";
            return (
              <div key={msg.id} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[80%] rounded-lg px-4 py-3",
                  isOut
                    ? "bg-ink-900 text-paper-50"
                    : "bg-white border border-paper-200 text-ink-900"
                )}>
                  <div
                    className="text-sm leading-relaxed prose prose-sm max-w-none"
                    style={{ color: "inherit" }}
                    dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
                  />
                  <p className={cn("text-xs mt-2", isOut ? "text-paper-400" : "text-ink-400")}>
                    {msg.senderName} · {new Date(msg.sentAt).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Reply intelligence sidebar */}
        {ri && (
          <div className="w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-paper-200 bg-white overflow-y-auto">
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Reply Intelligence</p>
                <Badge className={cn("text-xs border", SENTIMENT_STYLES[ri.sentiment])}>
                  {ri.sentiment} · {Math.round(ri.sentimentConfidence * 100)}%
                </Badge>
              </div>

              <div>
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Next Best Action</p>
                <div className="bg-rust-50 border border-rust-200 rounded-lg p-3">
                  <p className="text-sm text-rust-900">{ri.nextBestAction}</p>
                  <p className="text-xs text-rust-500 mt-1 capitalize">{ri.nextBestActionType?.replace(/_/g, " ")}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  className="w-full bg-rust-500 hover:bg-rust-600 text-white"
                  size="sm"
                  onClick={() => draftReply({ id })}
                  disabled={drafting}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {drafting ? "Drafting…" : "Draft Reply"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-paper-300"
                  size="sm"
                  onClick={() => archive({ id })}
                >
                  <Archive className="h-4 w-4 mr-2" /> Archive
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
