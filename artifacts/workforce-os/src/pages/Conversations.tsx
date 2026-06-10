import React, { useMemo, useState } from "react";
import { useListConversations, useGetConversation, ListConversationsSentiment } from "@workspace/api-client-react";
import { ConversationThread } from "@/components/v2/ConversationThread";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { motion } from "framer-motion";
import { cardEnter, useReducedMotionSafe } from "@/lib/motion";
import { Search, Inbox, SearchX, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { isUnavailable, UnavailableState } from "@/lib/unavailable";

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Needs Reply", value: "needs_reply" },
  { label: "Positive", value: "positive" },
  { label: "Objection", value: "objection" },
];

export default function Conversations() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const reduced = useReducedMotionSafe();

  const queryParams: any = { limit: 50 };
  if (activeFilter === "needs_reply") queryParams.needsReply = true;
  if (activeFilter === "positive") queryParams.sentiment = "positive" as ListConversationsSentiment;
  if (activeFilter === "objection") queryParams.sentiment = "objection" as ListConversationsSentiment;

  const {
    data: listData,
    isLoading: listLoading,
    isError: listError,
    refetch: refetchList,
  } = useListConversations(
    queryParams,
    { query: { refetchInterval: 15000, queryKey: ["listConversations", activeFilter] } }
  );

  const allConversations = listData?.items || [];

  const conversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allConversations;
    return allConversations.filter((c) =>
      [c.leadName, c.subject, c.lastMessagePreview]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    );
  }, [allConversations, search]);

  const { data: detailData, isLoading: detailLoading } = useGetConversation(
    selectedId || "",
    { query: { enabled: !!selectedId, queryKey: ["getConversation", selectedId] } }
  );

  // Gap endpoint: the conversations backend isn't wired up yet, so the BFF
  // returns `{ unavailable: true }`. Show the whole surface as coming soon.
  if (isUnavailable(listData)) {
    return <UnavailableState feature="conversations" />;
  }

  const detailUnavailable = isUnavailable(detailData);

  return (
    <div className="flex h-full min-w-0">
      {/* Thread List (Left) */}
      <div className="w-full md:w-[40%] md:min-w-[320px] md:max-w-[420px] border-r border-paper-200 bg-paper-50 flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-paper-200 space-y-4 shrink-0 bg-ink-0 shadow-sm z-10">
          <h2 className="font-serif text-2xl font-semibold text-ink-900 dark:text-paper-50">Inbox</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="pl-9 bg-paper-50 border-paper-200"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {FILTERS.map(f => (
              <Badge
                key={f.value}
                variant="secondary"
                className={cn(
                  "cursor-pointer whitespace-nowrap hover:bg-paper-200",
                  activeFilter === f.value
                    ? "bg-ink-900 text-white hover:bg-ink-800"
                    : "bg-paper-100 text-ink-700"
                )}
                onClick={() => setActiveFilter(f.value)}
              >
                {f.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-4 border-b border-paper-200 flex gap-3">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))
          ) : listError ? (
            <ErrorState
              title="Couldn't load conversations"
              description="The inbox failed to load. Check your connection and try again."
              onRetry={() => refetchList()}
            />
          ) : conversations.length === 0 ? (
            search.trim() ? (
              <EmptyState
                icon={SearchX}
                title="No matches"
                description={`No conversations match "${search.trim()}". Try a different search.`}
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title="Inbox zero"
                description="No conversations match this filter. New replies will appear here as they arrive."
              />
            )
          ) : (
            <Stagger>
              {conversations.map((conv) => (
                <StaggerItem key={conv.id}>
                  <ConversationThread
                    mode="preview"
                    conversation={conv}
                    selected={selectedId === conv.id}
                    onSelect={setSelectedId}
                  />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </div>

      {/* Detail View (Right) */}
      <div className="hidden md:flex flex-col flex-1 bg-paper-50 min-w-0">
        {!selectedId ? (
          <EmptyState
            icon={MessageSquareText}
            title="No conversation selected"
            description="Select a thread from the list to view the full message history and AI analysis."
          />
        ) : detailUnavailable ? (
          <UnavailableState feature="conversation detail" />
        ) : detailLoading || !detailData ? (
          <div className="p-6 space-y-6 h-full flex flex-col">
            <Skeleton className="h-16 w-full" />
            <div className="flex-1 space-y-4">
              <Skeleton className="h-32 w-[80%] ml-auto" />
              <Skeleton className="h-24 w-[70%]" />
            </div>
          </div>
        ) : (
          <motion.div
            key={selectedId}
            variants={reduced ? undefined : cardEnter}
            initial={reduced ? false : "hidden"}
            animate={reduced ? false : "visible"}
            className="flex flex-col h-full min-w-0"
          >
            <ConversationThread mode="full" detail={detailData} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
