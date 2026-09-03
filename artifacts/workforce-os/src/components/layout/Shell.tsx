import React from "react";
import { UserButton } from "@clerk/clerk-react";
import { useHealthCheck } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import {
  BarChart3,
  Bot,
  FileText,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Settings,
  UsersRound,
} from "lucide-react";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Logo } from "@/components/brand/Logo";
import { useWorkspace, useCurrentUser } from "@/lib/workspace";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/today", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline", label: "Leads", icon: UsersRound },
  { href: "/runs", label: "Campaigns", icon: Megaphone },
  { href: "/conversations", label: "Inbox", icon: Inbox },
  { href: "/outbound", label: "Content", icon: FileText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export const MOBILE_NAV_ITEMS = NAV_ITEMS;

function isActive(location: string, href: string) {
  return location === href || location.startsWith(`${href}/`);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const workspace = useWorkspace();
  const user = useCurrentUser();
  const { data: health, isError: healthError } = useHealthCheck({
    query: { queryKey: ["healthCheck"], refetchInterval: 30000, retry: 1 },
  });
  const operational = health?.status === "ok";
  const currentPage =
    NAV_ITEMS.find((item) => isActive(location, item.href))?.label ??
    (location.startsWith("/settings") ? "Settings" : "Workspace");

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-100 md:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-300 md:flex">
        <div className="border-b border-slate-800 px-5 py-5">
          <div className="flex items-center gap-3">
            <Logo size={30} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold tracking-tight text-white">
                WorkforceOS
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-lime-400" />6
                agents online
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(location, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-slate-900 text-white before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-lime-400"
                    : "text-slate-400 hover:bg-slate-900/70 hover:text-white",
                )}
              >
                <item.icon
                  aria-hidden="true"
                  className={cn("h-4 w-4", active && "text-lime-400")}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center gap-3 rounded-sm px-2 py-2">
            <UserButton
              afterSignOutUrl="/sign-in"
              appearance={{ elements: { avatarBox: "h-8 w-8" } }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">
                {user.name}
              </p>
              <p className="truncate text-[10px] text-slate-500">
                {workspace.name} · {workspace.plan}
              </p>
            </div>
            <Link
              href="/settings"
              aria-label="Open settings"
              title="Settings"
              className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <Settings aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </aside>

      <main className="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size={24} className="md:hidden" />
            <h1 className="truncate text-sm font-semibold text-slate-950">
              {currentPage}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="hidden items-center gap-2 text-xs font-medium text-slate-500 sm:flex"
              title={
                operational
                  ? "All monitored services are responding"
                  : "Waiting for the health service"
              }
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  operational
                    ? "bg-emerald-500"
                    : healthError
                      ? "bg-amber-400"
                      : "bg-slate-300",
                )}
              />
              {operational
                ? "System operational"
                : healthError
                  ? "Status unavailable"
                  : "Checking system"}
            </div>
            <Link
              href="/runs"
              className="inline-flex h-8 items-center gap-2 rounded border border-blue-500 bg-white px-3 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
            >
              <Bot aria-hidden="true" className="h-3.5 w-3.5" />
              Run agents
            </Link>
            <div className="hidden text-slate-500 lg:block">
              <ThemeToggle />
            </div>
            <div className="md:hidden">
              <UserButton
                afterSignOutUrl="/sign-in"
                appearance={{ elements: { avatarBox: "h-8 w-8" } }}
              />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>

      <CommandPalette />

      <nav className="flex shrink-0 items-center overflow-x-auto border-t border-slate-200 bg-white pb-safe md:hidden">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = isActive(location, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-16 flex-1 flex-col items-center gap-1 px-2 py-2 text-[10px] font-medium",
                active ? "text-blue-700" : "text-slate-500",
              )}
            >
              <item.icon aria-hidden="true" className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
