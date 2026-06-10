import React from "react";
import {
  useListNotifications,
  useMarkNotificationsRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { staggerContainer, staggerItem, useReducedMotionSafe } from "@/lib/motion";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";

export function NotificationBell() {
  const reduce = useReducedMotionSafe();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const { data: notifications, isError, refetch } = useListNotifications({
    query: { refetchInterval: 30000, queryKey: ["listNotifications"] },
  });

  const markRead = useMarkNotificationsRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["listNotifications"] });
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      },
    },
  });

  const items = notifications?.items ?? [];
  const unreadCount = items.filter((n) => !n.read).length;

  const handleRowClick = (link?: string | null) => {
    if (!link) return;
    setOpen(false);
    setLocation(link);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
          className="relative text-ink-400 hover:text-ink-900 hover-elevate active-elevate-2"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rust-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rust-500 border-2 border-paper-50"></span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 border-paper-200 shadow-md overflow-hidden"
        align="end"
      >
        <div className="p-4 border-b border-paper-200 flex items-center justify-between bg-paper-50">
          <h3 className="font-serif font-semibold text-ink-900">Notifications</h3>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold bg-rust-100 text-rust-500 px-1.5 py-0.5 rounded">
              {unreadCount} UNREAD
            </span>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {isError ? (
            <ErrorState
              title="Couldn’t load notifications"
              description="We hit a snag fetching your activity feed."
              onRetry={() => refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title="You’re all caught up"
              description="New replies, approvals, and run alerts will show up here."
            />
          ) : (
            <motion.div
              className="divide-y divide-paper-100"
              variants={reduce ? undefined : staggerContainer}
              initial={reduce ? undefined : "hidden"}
              animate={reduce ? undefined : "visible"}
            >
              {items.map((n) => {
                const navigable = Boolean(n.link);
                return (
                  <motion.button
                    key={n.id}
                    type="button"
                    variants={reduce ? undefined : staggerItem}
                    whileHover={reduce || !navigable ? undefined : { y: -1 }}
                    whileTap={reduce || !navigable ? undefined : { scale: 0.99 }}
                    disabled={!navigable}
                    onClick={() => handleRowClick(n.link)}
                    className={`w-full text-left p-4 transition-colors ${
                      navigable
                        ? "hover:bg-paper-50 cursor-pointer"
                        : "cursor-default"
                    } ${n.read ? "opacity-70" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && (
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rust-500" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-ink-900 dark:text-paper-50 leading-snug font-medium">{n.title}</p>
                        <p className="text-xs text-ink-500 dark:text-ink-300 leading-snug mt-0.5">{n.body}</p>
                        <p className="text-[10px] text-ink-400 mt-1 uppercase font-tabular tracking-wider">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </ScrollArea>
        <div className="p-2 border-t border-paper-200 bg-paper-50 text-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0 || markRead.isPending}
            onClick={() => markRead.mutate()}
            className="text-xs text-ink-400 hover:text-ink-900 w-full hover-elevate active-elevate-2 disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            {markRead.isPending ? "Marking…" : "Mark all as read"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
