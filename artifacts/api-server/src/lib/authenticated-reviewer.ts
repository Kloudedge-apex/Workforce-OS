import type { Request, Response } from "express";

/**
 * Return the reviewer identity established by Clerk auth, or terminate the
 * request. Decision routes must never manufacture an actor when their auth
 * middleware contract is broken or bypassed.
 */
export function requireAuthenticatedReviewer(
  req: Request,
  res: Response,
): string | null {
  const reviewerId = req.clerkUserId;
  if (typeof reviewerId !== "string" || reviewerId.trim() === "") {
    res.status(401).json({ error: "authenticated reviewer identity required" });
    return null;
  }

  return reviewerId;
}
