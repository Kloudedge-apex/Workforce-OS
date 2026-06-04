import React from "react";
import { Link, useLocation } from "wouter";
import { Activity, Inbox, Settings, Users, LayoutDashboard, Target } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/today", label: "Today", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: Target },
  { href: "/outbound", label: "Outbound", icon: Activity },
  { href: "/conversations", label: "Conversations", icon: Inbox },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-paper-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[220px] flex-col border-r border-paper-200 bg-paper-100 flex-shrink-0">
        <div className="p-4 border-b border-paper-200">
          <h1 className="font-serif font-semibold text-ink-900 text-lg tracking-tight">Acme Corp</h1>
          <p className="text-xs text-ink-400 font-mono">WORKSPACE</p>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = location.startsWith(item.href);
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  active 
                    ? "bg-rust-500 text-white shadow-sm" 
                    : "text-ink-700 hover:bg-paper-200 hover:text-ink-900"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-paper-200 flex items-center gap-3">
          <Avatar className="h-8 w-8 bg-paper-200 border border-paper-200 text-ink-900">
            <AvatarFallback className="font-serif bg-transparent text-ink-900">JD</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900 truncate">Jane Doe</p>
            <p className="text-xs text-ink-400 truncate">RevOps</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-[100dvh] overflow-hidden">
        {/* Topbar */}
        <header className="h-12 border-b border-paper-200 bg-paper-50 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="md:hidden font-serif font-semibold text-ink-900">Acme</span>
            <div className="hidden md:flex items-center text-xs text-ink-400">
              <span>{NAV_ITEMS.find(i => location.startsWith(i.href))?.label || "Workspace"}</span>
            </div>
          </div>
          <button className="hidden md:flex items-center gap-2 px-2 py-1 text-xs text-ink-400 bg-paper-100 border border-paper-200 rounded shadow-sm hover:bg-paper-200 transition-colors">
            <span>Search</span>
            <kbd className="font-mono bg-paper-200 px-1 rounded text-[10px]">⌘K</kbd>
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>

      <CommandPalette />

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden flex items-center justify-around border-t border-paper-200 bg-paper-100 flex-shrink-0 pb-safe">
        {NAV_ITEMS.map((item) => {
          const active = location.startsWith(item.href);
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 p-3 text-[10px] font-medium flex-1 transition-colors",
                active ? "text-rust-500" : "text-ink-400"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="truncate w-full text-center">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
