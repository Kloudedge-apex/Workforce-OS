import React, { useEffect, useState } from "react";
import {
  useListConversations,
  useGetConversation,
  ListConversationsSentiment,
} from "@workspace/api-client-react";
import { ConversationThread } from "@/components/v2/ConversationThread";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { motion } from "framer-motion";
import { cardEnter, useReducedMotionSafe } from "@/lib/motion";
import { Search, Inbox, SearchX, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONVERSATION_REFRESH_INTERVAL_MS } from "@/lib/conversationRefresh";
import { useLocation } from "wouter";

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Needs Reply", value: "needs_reply" },
  { label: "Positive", value: "positive" },
  { label: "Objection", value: "objection" },
  { label: "Archived", value: "archived" },
];

const PAGE_SIZE = 20;

export default function Conversations() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const reduced = useReducedMotionSafe();
  const [, navigate] = useLocation();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const selectConversation = (id: string) => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      navigate(`/conversations/${id}`);
      return;
    }
    setSelectedId(id);
  };

  const queryParams: any = { page, limit: PAGE_SIZE };
  if (activeFilter === "needs_reply") queryParams.needsReply = true;
  if (activeFilter === "positive")
    queryParams.sentiment = "positive" as ListConversationsSentiment;
  if (activeFilter === "objection")
    queryParams.sentiment = "objection" as ListConversationsSentiment;
  if (activeFilter === "archived") queryParams.archived = true;
  if (debouncedSearch) queryParams.search = debouncedSearch;

  const {
    data: listData,
    isLoading: listLoading,
    isFetching: listFetching,
    isError: listError,
    refetch: refetchList,
  } = useListConversations(queryParams, {
    query: {
      refetchInterval: CONVERSATION_REFRESH_INTERVAL_MS,
      queryKey: [
        "listConversations",
        activeFilter,
        debouncedSearch,
        page,
        PAGE_SIZE,
      ],
    },
  });

  const conversations = listData?.items || [];
  const total = listData?.total ?? 0;
  const responseLimit = listData?.limit ?? PAGE_SIZE;
  const currentPage = listData?.page ?? page;
  const totalPages = Math.max(1, Math.ceil(total / responseLimit));
  const firstResult = total === 0 ? 0 : (currentPage - 1) * responseLimit + 1;
  const lastResult = Math.min(currentPage * responseLimit, total);

  useEffect(() => {
    if (!listLoading && listData && page > totalPages) {
      setPage(totalPages);
    }
  }, [listData, listLoading, page, totalPages]);

  const {
    data: detailData,
    isLoading: detailLoading,
    isError: detailError,
    refetch: refetchDetail,
  } = useGetConversation(selectedId || "", {
    query: {
      enabled: !!selectedId,
      queryKey: ["getConversation", selectedId],
      refetchInterval: CONVERSATION_REFRESH_INTERVAL_MS,
    },
  });

  return (
    <div className="flex h-full min-w-0">
      {/* Thread List (Left) */}
      <div className="w-full md:w-[40%] md:min-w-[320px] md:max-w-[420px] border-r border-paper-200 bg-paper-50 flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-paper-200 space-y-4 shrink-0 bg-ink-0 shadow-sm z-10">
          <h2 className="font-serif text-2xl font-semibold text-ink-900 dark:text-paper-50">
            Inbox
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search conversations..."
              className="pl-9 bg-paper-50 border-paper-200"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {FILTERS.map((f) => (
              <button
                type="button"
                key={f.value}
                aria-pressed={activeFilter === f.value}
                className={cn(
                  "inline-flex items-center whitespace-nowrap rounded-md border border-transparent px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-paper-200",
                  activeFilter === f.value
                    ? "bg-ink-900 text-white hover:bg-ink-800"
                    : "bg-paper-100 text-ink-700",
                )}
                onClick={() => {
                  setActiveFilter(f.value);
                  setPage(1);
                }}
              >
                {f.label}
              </button>
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
            debouncedSearch ? (
              <EmptyState
                icon={SearchX}
                title="No matches"
                description={`No conversations match "${debouncedSearch}". Try a different search.`}
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
                    onSelect={selectConversation}
                  />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
        {!listLoading && !listError && total > 0 ? (
          <div className="shrink-0 border-t border-paper-200 bg-ink-0 px-3 py-2 flex items-center justify-between gap-2 text-xs text-ink-500">
            <span className="whitespace-nowrap">
              {firstResult}-{lastResult} of {total}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2"
                disabled={currentPage <= 1 || listFetching}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span className="min-w-12 text-center text-ink-600">
                {currentPage}/{totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2"
                disabled={currentPage >= totalPages || listFetching}
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Detail View (Right) */}
      <div className="hidden md:flex flex-col flex-1 bg-paper-50 min-w-0">
        {!selectedId ? (
          <EmptyState
            icon={MessageSquareText}
            title="No conversation selected"
            description="Select a thread from the list to view the full message history and AI analysis."
          />
        ) : detailError && !detailData ? (
          <ErrorState
            title="Couldn't load this conversation"
            description="The conversation service didn't respond. Your data is safe — try again."
            onRetry={() => refetchDetail()}
          />
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
