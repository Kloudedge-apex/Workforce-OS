import { toast } from "sonner";

export interface TriggerErrorToast {
  title: string;
  description?: string;
  goToRunId: string | null;
}

export interface RunRowLike {
  id: string;
  status: string;
}

/** Map the BFF's single-flight conflict into a useful next action. */
export function describeTriggerError(
  err: unknown,
  items: readonly RunRowLike[],
): TriggerErrorToast {
  const rec = err && typeof err === "object" ? (err as Record<string, unknown>) : null;
  const status = rec && typeof rec["status"] === "number" ? (rec["status"] as number) : null;
  const data =
    rec && typeof rec["data"] === "object" && rec["data"] !== null
      ? (rec["data"] as Record<string, unknown>)
      : null;
  const message =
    data && typeof data["message"] === "string" && (data["message"] as string).trim() !== ""
      ? (data["message"] as string)
      : null;

  if (status === 409) {
    const runIdMatch = message ? /runId=([A-Za-z0-9_-]+)/.exec(message) : null;
    const awaitingRow = items.find((row) => row.status === "AWAITING_APPROVAL");
    const awaiting =
      (message?.includes("awaiting_approval") ?? false) ||
      (!(message?.includes("running") ?? false) && awaitingRow != null);
    if (awaiting) {
      return {
        title: "A run is awaiting your approval",
        description: "Approve or reject the pending run before starting a new one.",
        goToRunId: runIdMatch?.[1] ?? awaitingRow?.id ?? null,
      };
    }
    return {
      title: "A run is already in progress",
      description:
        message ?? "Wait for the current run to finish before starting another.",
      goToRunId: runIdMatch?.[1] ?? null,
    };
  }

  return {
    title: "Failed to start run",
    description: err instanceof Error && err.message ? err.message : undefined,
    goToRunId: null,
  };
}

/** Shared presentation used by Runs, Today, and the command palette. */
export function showTriggerError(
  err: unknown,
  items: readonly RunRowLike[],
  navigate: (path: string) => void,
): void {
  const result = describeTriggerError(err, items);
  toast.error(result.title, {
    ...(result.description ? { description: result.description } : {}),
    ...(result.goToRunId
      ? {
          action: {
            label: "Review run",
            onClick: () => navigate(`/runs/${result.goToRunId}`),
          },
        }
      : {}),
  });
}
