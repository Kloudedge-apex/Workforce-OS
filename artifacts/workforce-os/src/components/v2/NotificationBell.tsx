import React from "react";
import { useListNotifications } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";

export function NotificationBell() {
  const { data: notifications } = useListNotifications({ 
    query: { refetchInterval: 30000, queryKey: ["listNotifications"] } 
  });

  const unreadCount = notifications?.items.filter(n => !n.read).length || 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-ink-400 hover:text-ink-900">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rust-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rust-500 border-2 border-paper-50"></span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 border-paper-200" align="end">
        <div className="p-4 border-b border-paper-200 flex items-center justify-between bg-paper-50">
          <h3 className="font-serif font-semibold text-ink-900">Notifications</h3>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold bg-rust-100 text-rust-500 px-1.5 py-0.5 rounded">
              {unreadCount} UNREAD
            </span>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {notifications?.items.length === 0 ? (
            <div className="p-8 text-center text-ink-400 text-sm">
              No notifications yet.
            </div>
          ) : (
            <div className="divide-y divide-paper-100">
              {notifications?.items.map((n) => (
                <div key={n.id} className="p-4 hover:bg-paper-50 transition-colors cursor-pointer">
                  <p className="text-sm text-ink-900 leading-snug">{n.message}</p>
                  <p className="text-[10px] text-ink-400 mt-1 uppercase font-tabular tracking-wider">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="p-2 border-t border-paper-200 bg-paper-50 text-center">
          <Button variant="ghost" size="sm" className="text-xs text-ink-400 hover:text-ink-900 w-full">
            Mark all as read
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
