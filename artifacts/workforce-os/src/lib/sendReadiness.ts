/**
 * Runtime-tolerant accessors for the GL5 `sendReadiness` envelope the backend
 * now attaches to the org read (forwarded by the BFF on OrgSettings). The
 * generated `@workspace/api-client-react` types don't include it yet (client
 * regen pending — same situation as `artifactContract.ts`), so all helpers
 * accept `unknown` and verify shapes at runtime.
 *
 * HONESTY CONTRACT (mirrors api-server/src/routes/settings.ts):
 *  - `sendReadiness` absent/malformed → null = live state UNKNOWN. The UI must
 *    treat unknown as dry-run and SAY it doesn't know — never fabricate a
 *    "live" or a confident per-precondition verdict.
 *  - `liveSendAllowed === true` is the ONLY value that means real emails go
 *    out for this workspace.
 *  - `dailyCapRemaining` is null when the backend reports no cap.
 */

export interface SendReadiness {
  liveSendAllowed: boolean;
  physicalAddressSet: boolean;
  senderNameSet: boolean;
  mailboxConnected: boolean;
  dailyCapRemaining: number | null;
}

/**
 * Tolerant guard for the raw envelope. Returns null when absent or malformed
 * (e.g. a backend that predates GL5). A missing/non-finite `dailyCapRemaining`
 * degrades to null without discarding the rest of the envelope.
 */
export function parseSendReadiness(raw: unknown): SendReadiness | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r["liveSendAllowed"] !== "boolean" ||
    typeof r["physicalAddressSet"] !== "boolean" ||
    typeof r["senderNameSet"] !== "boolean" ||
    typeof r["mailboxConnected"] !== "boolean"
  ) {
    return null;
  }
  const cap = r["dailyCapRemaining"];
  return {
    liveSendAllowed: r["liveSendAllowed"],
    physicalAddressSet: r["physicalAddressSet"],
    senderNameSet: r["senderNameSet"],
    mailboxConnected: r["mailboxConnected"],
    dailyCapRemaining: typeof cap === "number" && Number.isFinite(cap) ? cap : null,
  };
}

/**
 * Read `sendReadiness` off an OrgSettings payload (typed `unknown` because the
 * generated client type lags the wire contract).
 */
export function getSendReadiness(settings: unknown): SendReadiness | null {
  const rec =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : null;
  return parseSendReadiness(rec?.["sendReadiness"]);
}

/**
 * Tri-state workspace live flag: true/false when the backend reported
 * readiness, null when unknown (treat as dry-run, but render "unknown").
 */
export function workspaceLiveState(settings: unknown): boolean | null {
  const readiness = getSendReadiness(settings);
  return readiness ? readiness.liveSendAllowed : null;
}
