import type { Response } from "express";

/**
 * Response for endpoints whose real backend doesn't exist yet (Phase-2b gaps).
 *
 * Returns `200 { unavailable: true, feature }` — a typed marker the premium FE
 * maps to an EmptyState ("not available yet"). We NEVER fabricate/seed data and
 * NEVER 500 for a known gap; the surface degrades honestly until its backend ships.
 */
export function gapResponse(res: Response, feature: string): void {
  res.status(200).json({ unavailable: true, feature });
}
