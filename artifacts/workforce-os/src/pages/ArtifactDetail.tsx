import React from "react";
import { useRoute, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  type OutreachArtifact,
  useGetArtifact,
  useApproveArtifact,
  useRejectArtifact,
  useSuppressArtifact,
  useGetOrgSettings,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  ShieldOff,
  FileX2,
  ShieldAlert,
  Send,
} from "lucide-react";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { springHover, useReducedMotionSafe } from "@/lib/motion";
import { CountUp } from "@/components/motion/CountUp";
import { artifactStatusBadge } from "@/lib/artifactStatus";
import { getArtifactRefusal, uiCitations } from "@/lib/artifactContract";
import {
  artifactApprovalEligibility,
  artifactReviewAccess,
} from "@/lib/artifactApproval";
import {
  approvalSavedFromError,
  decisionErrorMessage,
} from "@/lib/decisionError";
import { workspaceLiveAuthorization } from "@/lib/sendReadiness";
import { suppressionAccess } from "@/lib/capabilities";

/**
 * Quality score row. `null`/`undefined`/non-finite means the score is NOT
 * AVAILABLE (the BFF sends null when nothing is persisted) — render the same
 * muted "not available" treatment as ApprovalCard's ScorePill, never a fake
 * 0% red bar.
 */
function ScoreBar({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  const reduced = useReducedMotionSafe();
  if (value == null || !Number.isFinite(value)) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-ink-600 w-32 shrink-0">{label}</span>
        <span className="text-xs text-ink-400">not available</span>
      </div>
    );
  }
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
  const queryClient = useQueryClient();
  const [, params] = useRoute("/outbound/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const reduced = useReducedMotionSafe();

  const { data, isLoading, isError, refetch } = useGetArtifact(id, {
    query: {
      queryKey: ["getArtifact", id],
      enabled: !!id,
      refetchInterval: 5000,
    },
  });
  const { data: orgSettings } = useGetOrgSettings({
    query: { queryKey: ["getOrgSettings"] },
  });
  const reviewAccess = artifactReviewAccess(orgSettings?.canReviewArtifacts);
  const suppression = suppressionAccess(orgSettings?.canManageSuppressions);

  const canReject = reviewAccess.allowed && data?.status === "PENDING_REVIEW";

  React.useEffect(() => {
    if (!canReject) setRejectOpen(false);
  }, [canReject]);

  const { mutate: approve, isPending: isApproving } = useApproveArtifact({
    mutation: {
      retry: false,
      onSuccess: () => {
        toast.success("Approved");
        void queryClient.invalidateQueries({
          queryKey: ["listPendingArtifacts"],
        });
        void refetch();
      },
      onError: (error) => {
        if (approvalSavedFromError(error)) {
          queryClient.setQueryData<OutreachArtifact>(
            ["getArtifact", id],
            (current) =>
              current ? { ...current, status: "APPROVED" } : current,
          );
          void queryClient.invalidateQueries({
            queryKey: ["listPendingArtifacts"],
          });
          void refetch();
          toast.warning(decisionErrorMessage(error));
          return;
        }
        toast.error(decisionErrorMessage(error));
      },
    },
  });
  const { mutate: reject, isPending: isRejecting } = useRejectArtifact({
    mutation: {
      retry: false,
      onSuccess: () => {
        toast.success("Rejected");
        setRejectOpen(false);
        refetch();
      },
      onError: (error) => toast.error(decisionErrorMessage(error)),
    },
  });
  const { mutateAsync: suppress, isPending: isSuppressing } =
    useSuppressArtifact();

  const handleSuppress = async () => {
    if (!suppression.allowed) {
      toast.error(suppression.reason);
      return;
    }
    try {
      const result = await suppress({ id });
      if (result.artifact.statusChanged) {
        toast.success("Recipient suppressed; this draft will not send");
      } else if (result.suppression.created || result.suppression.upgraded) {
        toast.success(
          `Recipient suppressed for future sends; artifact remains ${result.artifact.status}`,
        );
      } else {
        toast.success("Recipient was already suppressed");
      }
      await refetch();
    } catch {
      toast.error("Could not suppress this recipient");
    }
  };

  const handleApprove = () => {
    if (!reviewAccess.allowed) {
      toast.error(reviewAccess.reason);
      return;
    }
    approve({ id });
  };

  const handleReject = () => {
    if (!canReject) {
      toast.error(
        reviewAccess.allowed
          ? "Only pending-review artifacts can be rejected."
          : reviewAccess.reason,
      );
      return;
    }
    reject({ id, data: { reason: rejectReason } });
  };

  if (isLoading)
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  if (isError)
    return (
      <div className="flex h-full items-center justify-center bg-paper-50">
        <ErrorState
          title="Couldn't load this draft"
          description="The artifact failed to load. Check your connection and try again."
          onRetry={() => refetch()}
        />
      </div>
    );

  if (!data)
    return (
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

  // The BFF sends evaluatorScores: null when nothing is persisted — never
  // invent zeros. (Generated client type lags the contract; regen pending.)
  const scores = data.evaluatorScores ?? null;
  const sendPolicy = data.sendPolicy ?? null;
  const refusal = getArtifactRefusal(data);
  const refused = refusal?.refused === true;
  const isPending = data.status === "PENDING_REVIEW";
  const approvalEligibility = artifactApprovalEligibility(data);
  const workspaceAuthorization = workspaceLiveAuthorization(orgSettings);
  const liveAuthorization = data.sendPolicy
    ? data.sendPolicy.liveSendEnabled
    : workspaceAuthorization;
  const liveAuthorized = liveAuthorization === true;
  const channelLabel =
    data.channel === "EMAIL"
      ? "Email"
      : data.channel === "LINKEDIN"
        ? "LinkedIn"
        : data.channel === "HUBSPOT_NOTE"
          ? "HubSpot note"
          : "Unknown channel";
  const isDeliveryUnknown = data.status === "DELIVERY_UNKNOWN";
  const isFailed = data.status === "FAILED";
  const isReconciliationRequired = data.status === "RECONCILIATION_REQUIRED";
  const isRejected = data.status === "REJECTED";
  const statusBadge = artifactStatusBadge(data.status);
  const citations = uiCitations(data.citations);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-paper-50">
      <div className="sticky top-0 z-10 bg-paper-100 border-b border-paper-200 px-6 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/outbound")}
          className="text-ink-600 hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Outbound
        </Button>
        <span className="text-ink-300">/</span>
        <span className="text-sm font-medium text-ink-900 truncate">
          {refused ? "Refused to draft" : data.subject}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="text-xs uppercase">
            {channelLabel}
          </Badge>
          <Badge
            variant="outline"
            className={cn("text-xs border", statusBadge.className)}
          >
            {statusBadge.label}
          </Badge>
        </div>
      </div>

      <Stagger className="max-w-5xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email preview — a refusal renders a banner, never an (empty) draft */}
        <StaggerItem className="lg:col-span-2 space-y-4">
          {data.recipientWarning && (
            <div
              role="alert"
              className="rounded-xl border border-ember-400/50 bg-ember-400/10 p-4"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 shrink-0 text-ember-500" />
                <h2 className="font-serif text-base text-ink-900">
                  Recipient needs operator review
                </h2>
              </div>
              <p className="mt-2 text-sm text-ink-700">
                {data.recipientWarning}
              </p>
            </div>
          )}
          {isDeliveryUnknown && (
            <div
              role="alert"
              className="rounded-xl border border-ember-400/50 bg-ember-400/10 p-5 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-ember-500 shrink-0" />
                <h2 className="font-serif text-lg text-ink-900">
                  Delivery could not be confirmed
                </h2>
              </div>
              <p className="text-sm text-ink-700 mt-2">
                Do not resend this artifact. Reconcile the provider Sent folder
                or message receipt before creating a separately reviewed
                replacement.
              </p>
              <dl className="mt-3 grid gap-1 text-xs text-ink-600">
                <div>
                  <dt className="inline font-semibold">Attempt updated: </dt>
                  <dd className="inline">
                    {new Date(data.updatedAt).toLocaleString()}
                  </dd>
                </div>
                {data.statusReason && (
                  <div>
                    <dt className="inline font-semibold">Recorded reason: </dt>
                    <dd className="inline break-words">{data.statusReason}</dd>
                  </div>
                )}
                {data.sendReceiptId && (
                  <div>
                    <dt className="inline font-semibold">Provider receipt: </dt>
                    <dd className="inline font-mono break-all">
                      {data.sendReceiptId}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
          {isFailed && (
            <div
              role="alert"
              className="rounded-xl border border-rust-500/40 bg-rust-500/5 p-5 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-rust-500 shrink-0" />
                <h2 className="font-serif text-lg text-ink-900">
                  Send failed — no delivery
                </h2>
              </div>
              <p className="text-sm text-ink-700 mt-2">
                No provider acceptance occurred. Automatic retries are
                exhausted, and this artifact will not be retried. Create a
                separate, newly reviewed draft to try again.
              </p>
              <dl className="mt-3 grid gap-1 text-xs text-ink-600">
                {data.failedAt && (
                  <div>
                    <dt className="inline font-semibold">Failed at: </dt>
                    <dd className="inline">
                      {new Date(data.failedAt).toLocaleString()}
                    </dd>
                  </div>
                )}
                {data.failureReason && (
                  <div>
                    <dt className="inline font-semibold">Recorded reason: </dt>
                    <dd className="inline break-words">{data.failureReason}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
          {isReconciliationRequired && (
            <div
              role="alert"
              className="rounded-xl border border-ember-400/50 bg-ember-400/10 p-5 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-ember-500 shrink-0" />
                <h2 className="font-serif text-lg text-ink-900">
                  Historical outcome needs reconciliation
                </h2>
              </div>
              <p className="text-sm text-ink-700 mt-2">
                This record has an old system marker without enough provenance
                to classify it as either a reviewer rejection or a send failure.
                Reconcile the original provider and review history before acting
                on it.
              </p>
              {data.statusReason && (
                <p className="mt-3 text-xs text-ink-600">
                  <span className="font-semibold">
                    Why it is unclassified:{" "}
                  </span>
                  {data.statusReason}
                </p>
              )}
            </div>
          )}
          {isRejected && data.rejectionReason && (
            <div className="rounded-xl border border-paper-300 bg-paper-100 p-4">
              <h2 className="font-serif text-base text-ink-900">
                Draft rejected by reviewer
              </h2>
              <p className="mt-2 text-sm text-ink-700">
                {data.rejectionReason}
              </p>
            </div>
          )}
          {refused ? (
            <div
              role="alert"
              data-testid="refusal-banner"
              className="rounded-xl border border-rust-500/30 bg-rust-500/5 p-5 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rust-500 shrink-0" />
                <h2 className="font-serif text-lg text-ink-900">
                  Refused to draft — no grounded evidence
                </h2>
              </div>
              <p className="text-sm text-ink-700 mt-2">
                {refusal?.reason ??
                  "The agent declined to write this artifact because it couldn't ground it in real, dated evidence."}
              </p>
            </div>
          ) : (
            <motion.div
              className="bg-white border border-paper-200 rounded-xl overflow-hidden shadow-md transition-shadow hover:shadow-lg"
              variants={reduced ? undefined : springHover}
              initial="rest"
              whileHover="hover"
            >
              <div className="px-5 py-4 border-b border-paper-100 bg-paper-50">
                <p className="text-xs text-ink-400 uppercase tracking-wide mb-1">
                  Subject
                </p>
                <p className="text-sm font-medium text-ink-900">
                  {data.subject}
                </p>
              </div>
              <div className="px-5 py-4">
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">
                  {data.bodyText}
                </div>
              </div>
            </motion.div>
          )}

          {/* Citations — `cited` rows are the facts the drafter actually used */}
          {citations.length > 0 && (
            <div className="bg-white border border-paper-200 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">
                Citations
              </h3>
              <div className="space-y-2">
                {citations.map((c) => (
                  <div
                    key={c.factId}
                    className={cn(
                      "text-sm rounded-md border p-2",
                      c.cited
                        ? "bg-signal-positive/5 border-signal-positive/30"
                        : "border-transparent",
                    )}
                  >
                    <p className="text-ink-800">{c.claim}</p>
                    <p className="text-xs text-ink-400 mt-0.5 font-mono truncate">
                      {c.source}
                      {c.date ? ` · ${c.date}` : ""}
                    </p>
                    {c.cited && (
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-signal-positive mt-1">
                        Cited in draft
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </StaggerItem>

        {/* Sidebar */}
        <StaggerItem className="space-y-4">
          {/* Review actions use the shared fail-closed eligibility contract. */}
          {isPending && (
            <div className="bg-white border border-paper-200 rounded-xl p-4 space-y-2 shadow-sm">
              {!reviewAccess.allowed ? (
                <p
                  className="text-xs text-ink-500 rounded-md border border-paper-200 bg-paper-100 px-3 py-2"
                  data-testid="artifact-review-read-only"
                >
                  {reviewAccess.reason}
                </p>
              ) : (
                <>
                  {approvalEligibility.eligible && liveAuthorized && (
                    <div
                      className="flex items-start gap-2 rounded-md border border-rust-500/30 bg-rust-500/10 p-3"
                      role="alert"
                    >
                      <Send className="h-4 w-4 text-rust-500 shrink-0 mt-0.5" />
                      <p className="text-xs font-medium text-rust-600">
                        Live delivery is authorized. Approval may deliver this{" "}
                        {channelLabel.toLowerCase()} now or later after
                        temporary policy gates clear.
                      </p>
                    </div>
                  )}
                  {approvalEligibility.eligible &&
                    liveAuthorization === null && (
                      <div
                        className="flex items-start gap-2 rounded-md border border-paper-300 bg-paper-100 p-3"
                        role="alert"
                      >
                        <ShieldAlert className="h-4 w-4 text-ink-500 shrink-0 mt-0.5" />
                        <p className="text-xs font-medium text-ink-600">
                          Approval is disabled until live-delivery authorization
                          can be verified.
                        </p>
                      </div>
                    )}
                  {!approvalEligibility.eligible ? (
                    <p
                      className="text-xs text-ink-500 px-1 py-2"
                      data-testid="approval-unavailable-reason"
                    >
                      {approvalEligibility.reason}
                    </p>
                  ) : (
                    <Button
                      className="w-full bg-rust-500 hover:bg-rust-600 text-white shadow-sm active-elevate-2"
                      onClick={handleApprove}
                      disabled={liveAuthorization === null || isApproving}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {isApproving ? "Approving…" : "Approve"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="w-full border-paper-300 hover-elevate active-elevate-2"
                    onClick={() => setRejectOpen(true)}
                  >
                    <XCircle className="h-4 w-4 mr-2" /> Reject
                  </Button>
                </>
              )}
              {data.channel === "EMAIL" &&
                (suppression.allowed ? (
                  <Button
                    variant="ghost"
                    className="w-full text-ink-500 hover-elevate active-elevate-2"
                    onClick={handleSuppress}
                    disabled={isSuppressing}
                  >
                    <ShieldOff className="h-4 w-4 mr-2" />{" "}
                    {isSuppressing ? "Suppressing…" : "Suppress"}
                  </Button>
                ) : (
                  <p
                    className="rounded-md border border-paper-200 bg-paper-100 px-3 py-2 text-xs text-ink-500"
                    data-testid="artifact-suppression-read-only"
                  >
                    {suppression.reason}
                  </p>
                ))}
            </div>
          )}

          {!isPending &&
            data.channel === "EMAIL" &&
            data.status !== "SUPPRESSED" && (
              <div className="bg-white border border-paper-200 rounded-xl p-4 space-y-2 shadow-sm">
                <p className="text-xs text-ink-500">
                  Block this recipient from all future outreach. This does not
                  alter an in-flight or historical delivery record.
                </p>
                {suppression.allowed ? (
                  <Button
                    variant="outline"
                    className="w-full border-paper-300"
                    onClick={handleSuppress}
                    disabled={isSuppressing}
                  >
                    <ShieldOff className="h-4 w-4 mr-2" />
                    {isSuppressing ? "Suppressing…" : "Suppress future sends"}
                  </Button>
                ) : (
                  <p
                    className="rounded-md border border-paper-200 bg-paper-100 px-3 py-2 text-xs text-ink-500"
                    data-testid="artifact-suppression-read-only"
                  >
                    {suppression.reason}
                  </p>
                )}
              </div>
            )}

          {/* Recipient */}
          <div className="bg-white border border-paper-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">
              Recipient
            </h3>
            <p className="text-sm font-medium text-ink-900">
              {data.recipient.name}
            </p>
            <p className="text-xs text-ink-500">{data.recipient.title}</p>
            <p className="text-xs text-ink-500">{data.recipient.company}</p>
            <p className="text-xs text-ink-400 mt-1 font-mono">
              {data.recipient.email}
            </p>
          </div>

          {/* Evaluator scores — null from the BFF means "not persisted":
              show the muted not-available treatment, never fake 0% bars. */}
          <div className="bg-white border border-paper-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">
              Quality Scores
            </h3>
            {scores ? (
              <div className="space-y-2.5">
                <ScoreBar label="PII check" value={scores.pii} />
                <ScoreBar label="Hallucination" value={scores.hallucination} />
                <ScoreBar
                  label="Citation coverage"
                  value={scores.citationCoverage}
                />
                {scores.toxicity != null && (
                  <ScoreBar label="Toxicity" value={scores.toxicity} />
                )}
              </div>
            ) : (
              <Badge
                variant="outline"
                className="text-xs bg-paper-100 text-ink-400 border-paper-200"
              >
                Evaluator scores not available
              </Badge>
            )}
          </div>

          {/* Send policy — the BFF sends null when no real verdicts exist;
              never render invented all-false rows (and never crash). */}
          <div className="bg-white border border-paper-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">
              Send Policy
            </h3>
            {data.channel !== "EMAIL" ? (
              <Badge
                variant="outline"
                className="text-xs bg-paper-100 text-ink-400 border-paper-200"
              >
                Email send policy does not apply
              </Badge>
            ) : sendPolicy ? (
              (
                [
                  { key: "liveSendEnabled", label: "Live send enabled" },
                  { key: "postalAddressSet", label: "Postal address set" },
                  {
                    key: "unsubscribeConfigured",
                    label: "Unsubscribe configured",
                  },
                  {
                    key: "recipientSuppressed",
                    label: "Recipient not suppressed",
                  },
                ] as const
              ).map(({ key, label }) => {
                const ok =
                  key === "recipientSuppressed"
                    ? !sendPolicy[key]
                    : sendPolicy[key];
                return (
                  <div key={key} className="flex items-center gap-2 py-1">
                    <div
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        ok ? "bg-signal-positive" : "bg-rust-500",
                      )}
                    />
                    <span className="text-xs text-ink-600">{label}</span>
                  </div>
                );
              })
            ) : (
              <Badge
                variant="outline"
                className="text-xs bg-paper-100 text-ink-400 border-paper-200"
              >
                Send policy not available
              </Badge>
            )}
          </div>
        </StaggerItem>
      </Stagger>

      {/* Reject dialog */}
      <Dialog
        open={rejectOpen && canReject}
        onOpenChange={(open) => setRejectOpen(open && canReject)}
      >
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
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-rust-500 hover:bg-rust-600 text-white"
              onClick={handleReject}
              disabled={!rejectReason.trim() || isRejecting}
            >
              {isRejecting ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
