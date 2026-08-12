/**
 * Extract a reviewer-facing decision failure from the generated client's
 * ApiError shape. In particular, BFF 409 bodies carry the authoritative
 * compare-and-set conflict in `data.message`; never replace it with a generic
 * approval/rejection failure.
 */
export function decisionErrorMessage(
  error: unknown,
  fallback = "Request failed — please try again.",
): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const body = data as Record<string, unknown>;
      if (
        typeof body["message"] === "string" &&
        body["message"].trim() !== ""
      ) {
        return body["message"];
      }
      if (typeof body["error"] === "string" && body["error"].trim() !== "") {
        const status = (error as { status?: unknown }).status;
        return typeof status === "number"
          ? `${body["error"]} (HTTP ${status})`
          : body["error"];
      }
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** True only for the BFF's explicit durable-approval partial-success signal. */
export function approvalSavedFromError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("data" in error)) return false;
  const data = (error as { data?: unknown }).data;
  return (
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    (data as Record<string, unknown>)["approvalSaved"] === true
  );
}
