// Single source of truth for workspace + current-user identity.
//
// Phase 1 (now):  workspace = live `GET /settings/org`; user = static Nikxius constant.
// Phase 2 (later): swap the *source* to Clerk (`useOrganization` / `useUser`) WITHOUT
//                  changing these return signatures or any consumer.
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
 * Static Nikxius app context. Used as the workspace fallback (loading/error) and
 * as the sole source for the current user until a `/me` endpoint or Clerk lands.
 */
const NIKXIUS_APP_CONTEXT = {
  workspace: {
    name: "Nikxius",
    plan: "Growth",
  } satisfies Workspace,
  user: {
    name: "Nikhil Sood",
    role: "Owner",
    initials: "NS",
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
  if (!plan) return NIKXIUS_APP_CONTEXT.workspace.plan;
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

/**
 * Active workspace identity. Sourced from `GET /settings/org`; falls back to the
 * static Nikxius context while loading or on error so the chrome never flashes
 * blank or a stale tenant name.
 */
export function useWorkspace(): Workspace {
  const { data } = useGetOrgSettings({
    query: { queryKey: ["getOrgSettings"] },
  });

  if (!data) return NIKXIUS_APP_CONTEXT.workspace;

  return {
    name: data.orgName || NIKXIUS_APP_CONTEXT.workspace.name,
    plan: formatPlan(data.plan ?? ""),
    logoUrl: data.logoUrl ?? undefined,
  };
}

/**
 * The signed-in user. Static Nikxius constant for now — no current-user endpoint
 * exists. Phase 2 swaps the body to Clerk's `useUser()` with no signature change.
 */
export function useCurrentUser(): CurrentUser {
  const { name, role } = NIKXIUS_APP_CONTEXT.user;
  return {
    name,
    role,
    initials: deriveInitials(name),
  };
}
