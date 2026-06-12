import React, { useState } from "react";
import { 
  useListArtifacts, 
  useBulkApproveArtifacts, 
  useGetOrgSettings,
  OutreachArtifactStatus 
} from "@workspace/api-client-react";
import { ApprovalCard, ApprovalCardSkeleton } from "@/components/v2/ApprovalCard";
import { AgentActivityStream } from "@/components/v2/AgentActivityStream";
import { PolicyBadge } from "@/components/v2/PolicyBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { CheckCircle2, ShieldAlert, Check, XCircle, Ban, History, Inbox, Send, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isUnavailable } from "@/lib/unavailable";
import { artifactStatusBadge } from "@/lib/artifactStatus";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { fadeIn, springHover, useReducedMotionSafe } from "@/lib/motion";

export default function Outbound() {
  const [activeTab, setActiveTab] = useState<OutreachArtifactStatus | "ALL">("PENDING_REVIEW");
  const [, setLocation] = useLocation();

  const { data: orgSettings } = useGetOrgSettings({
    query: { queryKey: ["getOrgSettings"] }
  });

  const bulkApproveMut = useBulkApproveArtifacts();

  const handleBulkApprove = async () => {
    toast("Running evaluators for bulk approval...");
    try {
      const res = await bulkApproveMut.mutateAsync();
      if (isUnavailable(res)) { toast("Not available yet — coming soon"); return; }
      toast.success(`Approved ${res.approved} drafts. Skipped ${res.skipped}.`);
    } catch (e) {
      toast.error("Bulk approval failed");
    }
  };

  return (
    <div className="flex h-full bg-paper-50">
      <div className="flex-1 flex flex-col min-w-0 border-r border-paper-200">
        
        {/* Header Strip */}
        <div className="bg-white border-b border-paper-200 p-6 md:px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
          <div>
            <h1 className="font-serif text-3xl font-semibold text-ink-900">Outbound Campaigns</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-ink-700">Workspace Policy:</span>
              <PolicyBadge 
                policy={orgSettings ? {
                  liveSendEnabled: orgSettings.liveSendEnabled,
                  postalAddressSet: !!orgSettings.postalAddress,
                  unsubscribeConfigured: !!orgSettings.unsubscribeUrl,
                  recipientSuppressed: false
                } : undefined} 
              />
            </div>
          </div>
          {activeTab === "PENDING_REVIEW" && (
            <Button 
              onClick={handleBulkApprove}
              disabled={bulkApproveMut.isPending}
              className="bg-rust-500 text-white hover:bg-rust-600 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Approve High-Confidence
            </Button>
          )}
        </div>

        {/* Tabs & Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="flex-1 flex flex-col">
            <div className="px-6 md:px-8 pt-4 border-b border-paper-200 bg-paper-50 shrink-0 overflow-x-auto no-scrollbar">
              <TabsList className="bg-paper-100 mb-[-1px]">
                <TabsTrigger value="ALL" className="data-[state=active]:bg-white data-[state=active]:text-ink-900">All</TabsTrigger>
                <TabsTrigger value="PENDING_REVIEW" className="data-[state=active]:bg-white data-[state=active]:text-rust-500">Pending</TabsTrigger>
                <TabsTrigger value="APPROVED" className="data-[state=active]:bg-white data-[state=active]:text-signal-positive">Approved</TabsTrigger>
                <TabsTrigger value="SENT" className="data-[state=active]:bg-white data-[state=active]:text-signal-info">Sent</TabsTrigger>
                <TabsTrigger value="REJECTED" className="data-[state=active]:bg-white data-[state=active]:text-rust-500">Rejected</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeTab}
                  variants={fadeIn}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <ArtifactList status={activeTab === "ALL" ? undefined : activeTab} />
                </motion.div>
              </AnimatePresence>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Right Rail */}
      <div className="hidden lg:flex flex-col w-[320px] bg-paper-100 flex-shrink-0">
        <div className="p-4 border-b border-paper-200 bg-paper-50 sticky top-0 z-10 flex items-center gap-2">
          <History className="h-4 w-4 text-ink-400" />
          <h3 className="text-xs font-bold text-ink-400 tracking-wider uppercase">Outbound Pulse</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AgentActivityStream filter="outbound" />
        </div>
      </div>
    </div>
  );
}

function ArtifactList({ status }: { status?: OutreachArtifactStatus }) {
  const [, setLocation] = useLocation();
  const reduced = useReducedMotionSafe();
  const { data: draftsData, isLoading, isError, refetch } = useListArtifacts(
    { status, limit: 20 },
    { query: { refetchInterval: 8000, queryKey: ["listArtifacts", status] } }
  );

  const items = draftsData?.items || [];

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <ApprovalCardSkeleton />
        <ApprovalCardSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Couldn't load the outbound queue"
        description="The drafts service didn't respond. Your data is safe — try again."
        onRetry={() => refetch()}
      />
    );
  }

  if (items.length === 0) {
    const empty: Partial<Record<OutreachArtifactStatus, { icon: typeof Inbox; title: string; description: string }>> = {
      PENDING_REVIEW: {
        icon: CheckCircle2,
        title: "Queue clear",
        description: "No drafts are waiting on your review. New drafts land here as agents finish them.",
      },
      APPROVED: {
        icon: Check,
        title: "Nothing approved yet",
        description: "Approved drafts queue here before they send. Approve a pending draft to get started.",
      },
      SENT: {
        icon: Send,
        title: "No sends yet",
        description: "Once approved drafts go out, they'll show up here with delivery status.",
      },
      REJECTED: {
        icon: ThumbsDown,
        title: "No rejections",
        description: "Drafts you reject — and the reason why — collect here to tune future agent output.",
      },
    };
    const e = (status && empty[status]) || {
      icon: Inbox,
      title: "Nothing outbound",
      description: "No outbound drafts across any status yet. Agents will populate this queue as they run.",
    };
    return <EmptyState icon={e.icon} title={e.title} description={e.description} />;
  }

  if (status === "SENT") {
    return (
      <Card className="border border-paper-200 overflow-hidden bg-white shadow-sm max-w-5xl mx-auto">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-ink-400 uppercase bg-paper-50 border-b border-paper-200 font-mono">
              <tr>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Recipient</th>
                <th className="px-6 py-4 font-semibold">Subject</th>
                <th className="px-6 py-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-100">
              {items.map((item) => {
                // HONESTY: render the server status verbatim — SENDING/SIMULATED
                // rows must never read as "Sent" just because they're on this tab.
                const badge = artifactStatusBadge(item.status);
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-paper-50 cursor-pointer transition-colors group"
                    onClick={() => setLocation(`/outbound/${item.id}`)}
                  >
                    <td className="px-6 py-4 font-tabular text-ink-700 whitespace-nowrap">
                      {item.sentAt ? format(new Date(item.sentAt), "MMM d, h:mm a") : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-ink-900 group-hover:text-rust-500 transition-colors">{item.recipient.name}</div>
                      <div className="text-xs text-ink-400">{item.recipient.company}</div>
                    </td>
                    <td className="px-6 py-4 text-ink-700 max-w-[300px] truncate" title={item.subject}>
                      {item.subject}
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-bold uppercase whitespace-nowrap", badge.className)}>
                        {item.status === "SENT" && <Check className="w-3 h-3" />}
                        {badge.label}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  return (
    <Stagger className="max-w-3xl mx-auto space-y-6 pb-12">
      {items.map((item) => (
        <StaggerItem key={item.id}>
          <motion.div
            className="cursor-pointer"
            variants={reduced ? undefined : springHover}
            initial="rest"
            whileHover="hover"
            whileTap="tap"
            onClick={() => setLocation(`/outbound/${item.id}`)}
          >
            <ApprovalCard artifact={item} />
          </motion.div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
