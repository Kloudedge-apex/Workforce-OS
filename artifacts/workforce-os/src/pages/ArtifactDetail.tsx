import React from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetArtifact,
  useApproveArtifact,
  useRejectArtifact,
  useSuppressArtifact,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2, XCircle, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? "bg-green-500" : pct >= 70 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink-600 w-32 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-paper-200 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-ink-700 w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function ArtifactDetail() {
  const [, params] = useRoute("/outbound/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");

  const { data, isLoading, refetch } = useGetArtifact(id, {
    query: { queryKey: ["getArtifact", id], enabled: !!id },
  });

  const { mutate: approve } = useApproveArtifact({
    mutation: { onSuccess: () => { toast.success("Approved"); refetch(); } },
  });
  const { mutate: reject } = useRejectArtifact({
    mutation: { onSuccess: () => { toast.success("Rejected"); setRejectOpen(false); refetch(); } },
  });
  const { mutate: suppress } = useSuppressArtifact({
    mutation: { onSuccess: () => { toast.success("Suppressed"); refetch(); } },
  });

  if (isLoading) return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!data) return <div className="p-6 text-ink-400">Artifact not found</div>;

  const scores = data.evaluatorScores as { pii: number; hallucination: number; citationCoverage: number; toxicity: number };
  const isPending = data.status === "PENDING_REVIEW";

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-paper-50">
      <div className="sticky top-0 z-10 bg-paper-100 border-b border-paper-200 px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/outbound")} className="text-ink-600 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4 mr-1" /> Outbound
        </Button>
        <span className="text-ink-300">/</span>
        <span className="text-sm font-medium text-ink-900 truncate">{data.subject}</span>
        <div className="ml-auto flex items-center gap-2">
          <Badge className={cn("text-xs", {
            "bg-amber-100 text-amber-800 border-amber-200": data.status === "PENDING_REVIEW",
            "bg-green-100 text-green-800 border-green-200": data.status === "APPROVED",
            "bg-blue-100 text-blue-800 border-blue-200": data.status === "SENT",
            "bg-red-100 text-red-800 border-red-200": data.status === "REJECTED",
            "bg-paper-200 text-ink-600": data.status === "SUPPRESSED",
          })}>
            {data.status?.replace(/_/g, " ")}
          </Badge>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email preview */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-paper-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-paper-100 bg-paper-50">
              <p className="text-xs text-ink-400 uppercase tracking-wide mb-1">Subject</p>
              <p className="text-sm font-medium text-ink-900">{data.subject}</p>
            </div>
            <div className="px-5 py-4">
              <div
                className="text-sm text-ink-800 leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: data.bodyHtml }}
              />
            </div>
          </div>

          {/* Citations */}
          {(data.citations ?? []).length > 0 && (
            <div className="bg-white border border-paper-200 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Citations</h3>
              <div className="space-y-2">
                {(data.citations as { factId: string; claim: string; source: string }[]).map((c) => (
                  <div key={c.factId} className="text-sm">
                    <p className="text-ink-800">{c.claim}</p>
                    <p className="text-xs text-ink-400 mt-0.5 font-mono truncate">{c.source}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
          {isPending && (
            <div className="bg-white border border-paper-200 rounded-lg p-4 space-y-2">
              <Button
                className="w-full bg-rust-500 hover:bg-rust-600 text-white"
                onClick={() => approve({ id })}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
              </Button>
              <Button
                variant="outline"
                className="w-full border-paper-300"
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="h-4 w-4 mr-2" /> Reject
              </Button>
              <Button
                variant="ghost"
                className="w-full text-ink-500"
                onClick={() => suppress({ id })}
              >
                <ShieldOff className="h-4 w-4 mr-2" /> Suppress
              </Button>
            </div>
          )}

          {/* Recipient */}
          <div className="bg-white border border-paper-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Recipient</h3>
            <p className="text-sm font-medium text-ink-900">{data.recipient.name}</p>
            <p className="text-xs text-ink-500">{data.recipient.title}</p>
            <p className="text-xs text-ink-500">{data.recipient.company}</p>
            <p className="text-xs text-ink-400 mt-1 font-mono">{data.recipient.email}</p>
          </div>

          {/* Evaluator scores */}
          {scores && (
            <div className="bg-white border border-paper-200 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Quality Scores</h3>
              <div className="space-y-2">
                <ScoreBar label="PII check" value={scores.pii} />
                <ScoreBar label="Hallucination" value={scores.hallucination} />
                <ScoreBar label="Citation coverage" value={scores.citationCoverage} />
                {scores.toxicity != null && <ScoreBar label="Toxicity" value={scores.toxicity} />}
              </div>
            </div>
          )}

          {/* Send policy */}
          <div className="bg-white border border-paper-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Send Policy</h3>
            {([
              { key: "liveSendEnabled", label: "Live send enabled" },
              { key: "postalAddressSet", label: "Postal address set" },
              { key: "unsubscribeConfigured", label: "Unsubscribe configured" },
              { key: "recipientSuppressed", label: "Recipient not suppressed" },
            ] as const).map(({ key, label }) => {
              const ok = key === "recipientSuppressed" ? !data.sendPolicy[key] : data.sendPolicy[key];
              return (
                <div key={key} className="flex items-center gap-2 py-1">
                  <div className={cn("w-1.5 h-1.5 rounded-full", ok ? "bg-green-500" : "bg-red-400")} />
                  <span className="text-xs text-ink-600">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Reject artifact</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-sm text-ink-700">Reason</Label>
            <Input
              className="mt-1.5"
              placeholder="e.g. Tone too pushy, needs rewrite"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              className="bg-rust-500 hover:bg-rust-600 text-white"
              onClick={() => reject({ id, data: { reason: rejectReason } })}
              disabled={!rejectReason.trim()}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
