import type { FactCitation } from "@workspace/api-client-react";

/**
 * Runtime-tolerant accessors for OutreachArtifact fields the BFF now sends
 * and runtime-guards for older or malformed responses.
 *
 * HONESTY CONTRACT (mirrors api-server/src/routes/artifacts.ts):
 *  - `refusal`  → `{ refused, reason }`. When `refused` is true the drafter
 *    deliberately declined to write (no grounded evidence); the artifact's
 *    subject/body may be empty and must never present as a normal draft.
 *  - citations  → may carry `cited: boolean` (the drafter declared the fact
 *    in its groundedness self-check) and an optional ISO `date` for dated
 *    signals.
 *  - `evaluatorScores` → `null` whenever nothing was persisted; the UI must
 *    render "not available", never fake zeros.
 *
 * All helpers accept `unknown` and verify shapes at runtime so a lagging or
 * malformed payload degrades to "field absent" instead of crashing.
 */

export interface ArtifactRefusal {
  refused: boolean;
  reason: string | null;
}

/** Citation row as the BFF sends it; retained as a semantic UI alias. */
export type UiFactCitation = FactCitation;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Extract the refusal envelope from an artifact. Returns null when the field
 * is absent or malformed — callers treat that as "not refused".
 */
export function getArtifactRefusal(artifact: unknown): ArtifactRefusal | null {
  const refusal = asRecord(asRecord(artifact)?.["refusal"]);
  if (!refusal || typeof refusal["refused"] !== "boolean") return null;
  const rawReason = refusal["reason"];
  const reason =
    typeof rawReason === "string" && rawReason.trim().length > 0 ? rawReason : null;
  return { refused: refusal["refused"], reason };
}

/** True only when the drafter explicitly refused to draft this artifact. */
export function isRefusedArtifact(artifact: unknown): boolean {
  return getArtifactRefusal(artifact)?.refused === true;
}

/**
 * Normalize nullable citation arrays while preserving the generated wire type.
 */
export function uiCitations(citations: FactCitation[] | null | undefined): UiFactCitation[] {
  return citations ?? [];
}

/** Count of citations the drafter actually declared in its self-check. */
export function citedCount(citations: FactCitation[] | null | undefined): number {
  return uiCitations(citations).filter((c) => c.cited === true).length;
}
