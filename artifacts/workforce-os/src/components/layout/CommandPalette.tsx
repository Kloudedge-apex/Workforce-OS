import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import {
  useGetWelcomeStatus,
  useTriggerRun,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LayoutDashboard, Target, Activity, Inbox, Settings, PlayCircle, History } from "lucide-react";
import { staggerContainer, staggerItem, cardEnter, useReducedMotionSafe } from "@/lib/motion";
import { isCompleteWelcomeStatus } from "@/lib/onboarding";
import { showTriggerError } from "@/lib/runTrigger";

export function canTriggerPipelineFromCommand(status: unknown): boolean {
  return isCompleteWelcomeStatus(status);
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const reduce = useReducedMotionSafe();
  const { data: welcomeStatus } = useGetWelcomeStatus({
    query: { queryKey: ["getWelcomeStatus"] },
  });
  const setupComplete = canTriggerPipelineFromCommand(welcomeStatus);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        // Synthetic events from openCommandPalette() are not trusted → open-only.
        setOpen((prev) => (e.isTrusted ? !prev : true));
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { mutate: triggerRun, isPending: triggering } = useTriggerRun({
    mutation: {
      onSuccess: (d) => {
        if (d.queued) {
          toast.success(`Run started — ${d.runId}`);
          setLocation("/runs");
        } else {
          toast.error("Run not started", { description: d.message });
        }
      },
      onError: (err) => showTriggerError(err, [], setLocation),
    },
  });

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <motion.div
        variants={reduce ? undefined : cardEnter}
        initial={reduce ? undefined : "hidden"}
        animate={reduce ? undefined : "visible"}
        className="shadow-md"
      >
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <motion.div
              variants={reduce ? undefined : staggerContainer}
              initial={reduce ? undefined : "hidden"}
              animate={reduce ? undefined : "visible"}
            >
              <motion.div variants={reduce ? undefined : staggerItem}>
                <CommandItem
                  className="hover-elevate active-elevate-2"
                  onSelect={() => runCommand(() => setLocation("/today"))}
                >
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  <span>Today</span>
                </CommandItem>
              </motion.div>
              <motion.div variants={reduce ? undefined : staggerItem}>
                <CommandItem
                  className="hover-elevate active-elevate-2"
                  onSelect={() => runCommand(() => setLocation("/pipeline"))}
                >
                  <Target className="mr-2 h-4 w-4" />
                  <span>Pipeline</span>
                </CommandItem>
              </motion.div>
              <motion.div variants={reduce ? undefined : staggerItem}>
                <CommandItem
                  className="hover-elevate active-elevate-2"
                  onSelect={() => runCommand(() => setLocation("/outbound"))}
                >
                  <Activity className="mr-2 h-4 w-4" />
                  <span>Outbound</span>
                </CommandItem>
              </motion.div>
              <motion.div variants={reduce ? undefined : staggerItem}>
                <CommandItem
                  className="hover-elevate active-elevate-2"
                  onSelect={() => runCommand(() => setLocation("/conversations"))}
                >
                  <Inbox className="mr-2 h-4 w-4" />
                  <span>Conversations</span>
                </CommandItem>
              </motion.div>
              <motion.div variants={reduce ? undefined : staggerItem}>
                <CommandItem
                  className="hover-elevate active-elevate-2"
                  onSelect={() => runCommand(() => setLocation("/runs"))}
                >
                  <History className="mr-2 h-4 w-4" />
                  <span>Runs</span>
                </CommandItem>
              </motion.div>
              <motion.div variants={reduce ? undefined : staggerItem}>
                <CommandItem
                  className="hover-elevate active-elevate-2"
                  onSelect={() => runCommand(() => setLocation("/settings"))}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </CommandItem>
              </motion.div>
            </motion.div>
          </CommandGroup>
          <CommandGroup heading="Actions">
            <motion.div
              variants={reduce ? undefined : staggerContainer}
              initial={reduce ? undefined : "hidden"}
              animate={reduce ? undefined : "visible"}
            >
              <motion.div variants={reduce ? undefined : staggerItem}>
                <CommandItem
                  className="hover-elevate active-elevate-2"
                  disabled={triggering || !setupComplete}
                  onSelect={() => {
                    if (setupComplete) runCommand(() => triggerRun());
                  }}
                >
                  <PlayCircle className="mr-2 h-4 w-4 text-rust-500" />
                  <span>{setupComplete ? "Trigger Pipeline" : "Complete setup to trigger"}</span>
                  {triggering && <span className="ml-auto text-xs text-ink-400">Starting…</span>}
                </CommandItem>
              </motion.div>
            </motion.div>
          </CommandGroup>
        </CommandList>
      </motion.div>
    </CommandDialog>
  );
}
