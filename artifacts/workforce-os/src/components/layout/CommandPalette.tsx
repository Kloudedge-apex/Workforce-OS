import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useTriggerRun,
  useApproveArtifact,
  useListArtifacts,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LayoutDashboard, Target, Activity, Inbox, Settings, PlayCircle, CheckCircle, Ban, UserPlus, History, Bot } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { mutate: triggerRun, isPending: triggering } = useTriggerRun({
    mutation: {
      onSuccess: (d) => {
        toast.success(`Run started — ${d.runId}`);
        setLocation("/runs");
      },
      onError: () => toast.error("Failed to start run"),
    },
  });

  const { mutate: approveArtifact, isPending: approving } = useApproveArtifact({
    mutation: {
      onSuccess: () => toast.success("Draft approved"),
      onError: () => toast.error("Failed to approve draft"),
    },
  });

  // Lazily fetch the single oldest pending draft so "Approve Next Draft" has a target.
  const { data: pendingDrafts, refetch: refetchPending } = useListArtifacts(
    { status: "PENDING_REVIEW", limit: 1 },
    { query: { queryKey: ["listArtifacts", "PENDING_REVIEW", "cmdk"] } },
  );

  const handleApproveNext = async () => {
    const { data } = await refetchPending();
    const next = data?.items?.[0];
    if (!next) {
      toast("No drafts awaiting review");
      return;
    }
    approveArtifact({ id: next.id });
  };

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => setLocation("/today"))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Today</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/pipeline"))}>
            <Target className="mr-2 h-4 w-4" />
            <span>Pipeline</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/outbound"))}>
            <Activity className="mr-2 h-4 w-4" />
            <span>Outbound</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/conversations"))}>
            <Inbox className="mr-2 h-4 w-4" />
            <span>Conversations</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/runs"))}>
            <History className="mr-2 h-4 w-4" />
            <span>Runs</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/agents"))}>
            <Bot className="mr-2 h-4 w-4" />
            <span>Agents</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem
            disabled={triggering}
            onSelect={() => runCommand(() => triggerRun())}
          >
            <PlayCircle className="mr-2 h-4 w-4 text-rust-500" />
            <span>Trigger Pipeline</span>
            {triggering && <span className="ml-auto text-xs text-ink-400">Starting…</span>}
          </CommandItem>
          <CommandItem
            disabled={approving}
            onSelect={() => runCommand(() => { void handleApproveNext(); })}
          >
            <CheckCircle className="mr-2 h-4 w-4 text-signal-positive" />
            <span>Approve Next Draft</span>
            {(pendingDrafts?.items?.length ?? 0) > 0 && (
              <span className="ml-auto rounded-full bg-signal-positive/10 px-1.5 py-0.5 text-[10px] font-medium text-signal-positive font-tabular">
                {pendingDrafts!.items.length}
              </span>
            )}
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/settings/icp"))}>
            <Ban className="mr-2 h-4 w-4 text-ember-400" />
            <span>Add Suppression</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/settings/team"))}>
            <UserPlus className="mr-2 h-4 w-4 text-signal-info" />
            <span>Invite Teammate</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
