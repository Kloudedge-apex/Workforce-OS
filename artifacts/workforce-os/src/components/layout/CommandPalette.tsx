import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LayoutDashboard, Target, Activity, Inbox, Settings, PlayCircle, CheckCircle, Ban, UserPlus } from "lucide-react";

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
          <CommandItem onSelect={() => runCommand(() => setLocation("/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => console.log("Trigger Pipeline"))}>
            <PlayCircle className="mr-2 h-4 w-4 text-rust-500" />
            <span>Trigger Pipeline</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => console.log("Approve Next"))}>
            <CheckCircle className="mr-2 h-4 w-4 text-signal-positive" />
            <span>Approve Next Draft</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => console.log("Add Suppression"))}>
            <Ban className="mr-2 h-4 w-4 text-ember-400" />
            <span>Add Suppression</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => console.log("Invite Teammate"))}>
            <UserPlus className="mr-2 h-4 w-4 text-signal-info" />
            <span>Invite Teammate</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
