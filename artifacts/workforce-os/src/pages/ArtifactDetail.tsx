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
import { ArrowLeft, CheckCircle2, XCircle, ShieldOff, FileX2 } from "lucide-react";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isUnavailable } from "@/lib/unavailable";
import { motion } from "framer-motion";
import { sanitizeHtml } from "@/lib/sanitize";
import { springHover, useReducedMotionSafe } from "@/lib/motion";
import { CountUp } from "@/components/motion/CountUp";

function ScoreBar({ label, value }: { label: string; value: number }) {
  const reduced = useReducedMotionSafe();
  const pct = Math.round(value * 100);
  // Brand thresholds: signal-positive (pass) / ember (caution) / rust (fail).
  const fill =
    pct >= 85
      ? "bg-signal-positive"
      : pct >= 70
        ? "bg-ember-400"
        : "bg-rust-500";
  const text =
    pct >= 85
      ? "text-signal-positive"
      : pct >= 70
        ? "text-ember-500"
        : "text-rust-500";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-ink-600 w-32 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-paper-200 rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(20,12,8,0.08)]">
        <motion.div
          className={cn("h-full rounded-full", fill)}
          initial={reduced ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <CountUp
        value={pct}
        suffix="%"
        className={cn("text-xs font-mono w-9 text-right font-tabular", text)}
      />
    </div>
  );
}

export default function ArtifactDetail() {
  const [, params] = useRoute("/outbound/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const reduced = useReducedMotionSafe();

  const { data, isLoading, isError, refetch } = useGetArtifact(id, {
    query: { queryKey: ["getArtifact", id], enabled: !!id },
  });

  const { mutate: approve } = useApproveArtifact({
    mutation: { onSuccess: () => { toast.success("Approved"); refetch(); } },
  });
  const { mutate: reject } = useRejectArtifact({
    mutation: { onSuccess: () => { toast.success("Rejected"); setRejectOpen(false); refetch(); } },
  });
  const { mutate: suppress } = useSuppressArtifact({
    mutation: {
      onSuccess: (res) => {
        if (isUnavailable(res)) { toast("Not available yet — coming soon"); return; }
        toast.success("Suppressed"); refetch();
      },
    },
  });

  if (isLoading) return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (isError) return (
    <div className="flex h-full items-center justify-center bg-paper-50">
      <ErrorState
        title="Couldn't load this draft"
        description="The artifact failed to load. Check your connection and try again."
        onRetry={() => refetch()}
      />
    </div>
  );

  if (!data) return (
    <div className="flex h-full items-center justify-center bg-paper-50">
      <EmptyState
        icon={FileX2}
        title="Artifact not found"
        description="This draft may have been deleted or never existed."
        action={
          <Button
            variant="outline"
            size="sm"
            className="border-paper-300 hover-elevate active-elevate-2"
            onClick={() => navigate("/outbound")}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Outbound
          </Button>
        }
      />
    </div>
  );

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

      <Stagger className="max-w-5xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email preview */}
        <StaggerItem className="lg:col-span-2 space-y-4">
          <motion.div
            className="bg-white border border-paper-200 rounded-xl overflow-hidden shadow-md transition-shadow hover:shadow-lg"
            variants={reduced ? undefined : springHover}
            initial="rest"
            whileHover="hover"
          >
            <div className="px-5 py-4 border-b border-paper-100 bg-paper-50">
              <p className="text-xs text-ink-400 uppercase tracking-wide mb-1">Subject</p>
              <p className="text-sm font-medium text-ink-900">{data.subject}</p>
            </div>
            <div className="px-5 py-4">
              <div
                className="text-sm text-ink-800 leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.bodyHtml) }}
              />
            </div>
          </motion.div>

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
        </StaggerItem>

        {/* Sidebar */}
        <StaggerItem className="space-y-4">
          {/* Actions */}
          {isPending && (
            <div className="bg-white border border-paper-200 rounded-xl p-4 space-y-2 shadow-sm">
              <Button
                className="w-full bg-rust-500 hover:bg-rust-600 text-white shadow-sm active-elevate-2"
                onClick={() => approve({ id })}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
              </Button>
              <Button
                variant="outline"
                className="w-full border-paper-300 hover-elevate active-elevate-2"
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="h-4 w-4 mr-2" /> Reject
              </Button>
              <Button
                variant="ghost"
                className="w-full text-ink-500 hover-elevate active-elevate-2"
                onClick={() => suppress({ id })}
              >
                <ShieldOff className="h-4 w-4 mr-2" /> Suppress
              </Button>
            </div>
          )}

          {/* Recipient */}
          <div className="bg-white border border-paper-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Recipient</h3>
            <p className="text-sm font-medium text-ink-900">{data.recipient.name}</p>
            <p className="text-xs text-ink-500">{data.recipient.title}</p>
            <p className="text-xs text-ink-500">{data.recipient.company}</p>
            <p className="text-xs text-ink-400 mt-1 font-mono">{data.recipient.email}</p>
          </div>

          {/* Evaluator scores */}
          {scores && (
            <div className="bg-white border border-paper-200 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Quality Scores</h3>
              <div className="space-y-2.5">
                <ScoreBar label="PII check" value={scores.pii} />
                <ScoreBar label="Hallucination" value={scores.hallucination} />
                <ScoreBar label="Citation coverage" value={scores.citationCoverage} />
                {scores.toxicity != null && <ScoreBar label="Toxicity" value={scores.toxicity} />}
              </div>
            </div>
          )}

          {/* Send policy */}
          <div className="bg-white border border-paper-200 rounded-xl p-4 shadow-sm">
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
                  <div className={cn("w-1.5 h-1.5 rounded-full", ok ? "bg-signal-positive" : "bg-rust-500")} />
                  <span className="text-xs text-ink-600">{label}</span>
                </div>
              );
            })}
          </div>
        </StaggerItem>
      </Stagger>

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
