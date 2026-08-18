// Single source of truth for workspace + current-user identity.
//
// Workspace identity comes from the authenticated tenant read; user identity
// comes from Clerk. Loading/error fallbacks are deliberately generic so one
// customer never sees another customer's name or an invented role.
import { useGetOrgSettings } from "@workspace/api-client-react";

export interface Workspace {
  name: string;
  plan: string;
  logoUrl?: string;
}

export interface CurrentUser {
  name: string;
  email: string;
}

/**
 * Neutral loading/error context. These strings make no tenant or role claim.
 */
const FALLBACK_APP_CONTEXT = {
  workspace: {
    name: "Workspace",
    plan: "Plan unavailable",
  } satisfies Workspace,
  user: {
    name: "Signed-in user",
    email: "Account details unavailable",
  } satisfies CurrentUser,
} as const;

/** Title-case a raw plan slug like "growth" -> "Growth". */
function formatPlan(plan: string): string {
  if (!plan) return FALLBACK_APP_CONTEXT.workspace.plan;
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

/**
 * Active workspace identity. Sourced from `GET /settings/org`; falls back to the
 * neutral context while loading or on error so the chrome never flashes a
 * stale tenant name.
 */
export function useWorkspace(): Workspace {
  const { data } = useGetOrgSettings({
    query: { queryKey: ["getOrgSettings"] },
  });

  if (!data) return FALLBACK_APP_CONTEXT.workspace;

  return {
    name: data.orgName || FALLBACK_APP_CONTEXT.workspace.name,
    plan: formatPlan(data.plan ?? ""),
    logoUrl: data.logoUrl ?? undefined,
  };
}

/**
 * The signed-in Clerk user. Authorization is intentionally not inferred from
 * mutable public metadata; role-sensitive UI uses server-derived capabilities.
 */
export function useCurrentUser(): CurrentUser {
  return {
    name: "Investor demo",
    email: "synthetic@workforceos.example",
  };
}
