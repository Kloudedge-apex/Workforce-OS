// Single source of truth for workspace + current-user identity.
//
// Workspace identity comes from the authenticated tenant read; user identity
// comes from Clerk. Loading/error fallbacks are deliberately generic so one
// customer never sees another customer's name or an invented role.
import { useUser } from "@clerk/clerk-react";
import { useGetOrgSettings } from "@workspace/api-client-react";

export interface Workspace {
  name: string;
  plan: string;
  logoUrl?: string;
}

export interface CurrentUser {
  name: string;
  role: string;
  initials: string;
  avatarUrl?: string;
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
    role: "Role not reported",
    initials: "?",
  } satisfies CurrentUser,
} as const;

/** Derive 1–2 letter initials from a display name. */
function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

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
 * The signed-in Clerk user. Role is shown only when Clerk metadata supplies it.
 */
export function useCurrentUser(): CurrentUser {
  const { user } = useUser();
  if (!user) {
    const { name, role } = FALLBACK_APP_CONTEXT.user;
    return { name, role, initials: deriveInitials(name) };
  }
  const name =
    user.fullName ||
    user.primaryEmailAddress?.emailAddress ||
    FALLBACK_APP_CONTEXT.user.name;
  const role =
    typeof user.publicMetadata?.role === "string"
      ? user.publicMetadata.role
      : FALLBACK_APP_CONTEXT.user.role;
  return {
    name,
    role,
    initials: deriveInitials(name),
    avatarUrl: user.imageUrl,
  };
}
