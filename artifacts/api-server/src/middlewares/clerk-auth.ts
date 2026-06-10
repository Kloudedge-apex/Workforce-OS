import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// Augment Express Request with the authenticated context the BFF routes read.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      orgId?: string;
      clerkUserId?: string;
      /** Raw bearer token, forwarded upstream to apex-gtm-api. */
      clerkToken?: string;
    }
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    const url = process.env["CLERK_JWKS_URL"];
    if (!url) throw new Error("CLERK_JWKS_URL is not set");
    jwks = createRemoteJWKSet(new URL(url));
  }
  return jwks;
}

/** Verify a Clerk RS256 session JWT against the instance JWKS. Mirrors apex-gtm-api. */
export async function verifyClerkToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getJwks());
  return payload;
}

interface RequireClerkAuthDeps {
  /** Injectable verifier (tests). Defaults to JWKS verification. */
  verify?: (token: string) => Promise<JWTPayload>;
}

/**
 * Express middleware: deny-by-default Clerk auth. On success sets
 * `req.orgId` (from the `org_id` claim), `req.clerkUserId`, `req.clerkToken`.
 *
 * Local-dev escape hatch: when `DEV_TRUST_X_ORG_ID=true` it trusts the
 * `x-org-id` header without verifying a JWT. MUST be false in production.
 */
export function requireClerkAuth(deps: RequireClerkAuthDeps = {}) {
  const verify = deps.verify ?? verifyClerkToken;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (process.env["DEV_TRUST_X_ORG_ID"] === "true") {
      const orgId = req.header("x-org-id");
      if (!orgId) {
        res.status(401).json({ error: "x-org-id header required (dev)" });
        return;
      }
      req.orgId = orgId;
      req.clerkUserId = req.header("x-clerk-user-id") ?? "dev-user";
      next();
      return;
    }

    const auth = req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!token) {
      res.status(401).json({ error: "missing bearer token" });
      return;
    }

    try {
      const payload = await verify(token);
      const orgId = typeof payload["org_id"] === "string" ? (payload["org_id"] as string) : undefined;
      if (!orgId) {
        res.status(403).json({ error: "no org context in token" });
        return;
      }
      req.orgId = orgId;
      req.clerkUserId = typeof payload.sub === "string" ? payload.sub : undefined;
      req.clerkToken = token;
      next();
    } catch {
      res.status(401).json({ error: "invalid token" });
    }
  };
}
