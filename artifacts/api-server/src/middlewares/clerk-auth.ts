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
 * Express middleware: deny-by-default Clerk auth. Verifies the Clerk user JWT and
 * sets `req.clerkUserId` (from `sub`) + `req.clerkToken` (forwarded upstream).
 *
 * IMPORTANT (verified against release/go-live OrgScopeGuard): Clerk Organizations
 * is DISABLED on this instance, so tokens carry NO `org_id` claim. apex-gtm-api
 * resolves the org server-side via `User.clerkId == sub → User.orgId`. So the BFF
 * must NOT require an org claim — it just forwards the verified user JWT. `req.orgId`
 * is populated only if a claim happens to be present (optional).
 *
 * Local-dev escape hatch: `DEV_TRUST_X_ORG_ID=true` accepts a header-identified
 * user without a JWT (`x-clerk-user-id`, optional `x-org-id`). MUST be false in prod.
 */
export function requireClerkAuth(deps: RequireClerkAuthDeps = {}) {
  const verify = deps.verify ?? verifyClerkToken;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (process.env["DEV_TRUST_X_ORG_ID"] === "true") {
      req.clerkUserId = req.header("x-clerk-user-id") ?? "dev-user";
      req.orgId = req.header("x-org-id") ?? undefined;
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
      if (typeof payload.sub !== "string" || !payload.sub) {
        res.status(401).json({ error: "invalid token (no subject)" });
        return;
      }
      req.clerkUserId = payload.sub;
      req.clerkToken = token;
      // org is resolved server-side by apex-gtm-api from the Clerk user; an
      // org_id claim is optional and absent on this Clerk instance.
      req.orgId = typeof payload["org_id"] === "string" ? (payload["org_id"] as string) : undefined;
      next();
    } catch {
      res.status(401).json({ error: "invalid token" });
    }
  };
}
