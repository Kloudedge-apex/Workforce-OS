import React, { useState } from "react";
import { useListArtifacts, useBulkApproveArtifacts, useGetOrgSettings } from "@workspace/api-client-react";
import { ApprovalCard, ApprovalCardSkeleton } from "@/components/v2/ApprovalCard";
import { AgentActivityStream } from "@/components/v2/AgentActivityStream";
import { PolicyBadge } from "@/components/v2/PolicyBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { CheckCircle2, ShieldAlert, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Outbound() {
  const [activeTab, setActiveTab] = useState("drafts");

  const { data: orgSettings } = useGetOrgSettings({
    query: { queryKey: ["getOrgSettings"] }
  });

  const bulkApproveMut = useBulkApproveArtifacts();

  const handleBulkApprove = async () => {
    toast("Running evaluators for bulk approval...");
    try {
      const res = await bulkApproveMut.mutateAsync();
      toast.success(`Approved ${res.approved} drafts. Skipped ${res.skipped}.`);
    } catch (e) {
      toast.error("Bulk approval failed");
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0 border-r border-paper-200">
        
        {/* Header Strip */}
        <div className="bg-paper-100 border-b border-paper-200 p-4 md:px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-ink-900">Outbound Campaigns</h1>
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
          {activeTab === "drafts" && (
            <Button 
              onClick={handleBulkApprove}
              disabled={bulkApproveMut.isPending}
              className="bg-ink-900 text-white hover:bg-ink-700"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Approve High-Confidence Drafts
            </Button>
          )}
        </div>

        {/* Tabs & Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="px-4 md:px-8 pt-4 border-b border-paper-200 bg-paper-50 shrink-0">
              <TabsList className="bg-paper-100">
                <TabsTrigger value="drafts" className="data-[state=active]:bg-white data-[state=active]:text-rust-500">
                  Pending Drafts
                </TabsTrigger>
                <TabsTrigger value="sent" className="data-[state=active]:bg-white data-[state=active]:text-ink-900">
                  Sent Log
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-paper-50">
              <TabsContent value="drafts" className="m-0 h-full">
                <DraftsList />
              </TabsContent>
              <TabsContent value="sent" className="m-0 h-full">
                <SentLog />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Right Rail */}
      <div className="hidden lg:flex flex-col w-[320px] bg-paper-100 flex-shrink-0">
        <div className="p-4 border-b border-paper-200 bg-paper-100 sticky top-0 z-10">
          <h3 className="text-xs font-bold text-ink-400 tracking-wider uppercase">Outbound Activity</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AgentActivityStream filter="outbound" />
        </div>
      </div>
    </div>
  );
}

function DraftsList() {
  const { data: draftsData, isLoading } = useListArtifacts(
    { status: "PENDING_REVIEW", limit: 20 },
    { query: { refetchInterval: 8000, queryKey: ["listArtifacts", "PENDING_REVIEW"] } }
  );

  const drafts = draftsData?.items || [];

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <ApprovalCardSkeleton />
        <ApprovalCardSkeleton />
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
        <ShieldAlert className="w-12 h-12 text-paper-200 mb-4" />
        <h3 className="font-serif text-lg text-ink-900 mb-2">No pending drafts</h3>
        <p className="text-ink-400 text-sm">Agents have not generated any new outreach requiring your approval.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {drafts.map((d) => (
        <ApprovalCard key={d.id} artifact={d} />
      ))}
    </div>
  );
}

function SentLog() {
  const { data: sentData, isLoading } = useListArtifacts(
    { status: "SENT", limit: 50 },
    { query: { queryKey: ["listArtifacts", "SENT"] } }
  );

  const items = sentData?.items || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-ink-400 text-sm">No sent outreach yet.</p>
      </div>
    );
  }

  return (
    <Card className="border border-paper-200 overflow-hidden bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-ink-400 uppercase bg-paper-50 border-b border-paper-200">
            <tr>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Recipient</th>
              <th className="px-4 py-3 font-semibold">Subject</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-200">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-paper-50">
                <td className="px-4 py-3 font-tabular text-ink-700 whitespace-nowrap">
                  {item.sentAt ? format(new Date(item.sentAt), "MMM d, h:mm a") : "-"}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-ink-900">{item.recipient.name}</div>
                  <div className="text-xs text-ink-400">{item.recipient.company}</div>
                </td>
                <td className="px-4 py-3 text-ink-900 max-w-[300px] truncate" title={item.subject}>
                  {item.subject}
                </td>
                <td className="px-4 py-3">
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-signal-positive/10 text-signal-positive">
                    <Check className="w-3 h-3" /> Sent
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
