import { useState, type ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface AuthCacheIdentity {
  isLoaded: boolean;
  userId: string | null | undefined;
  sessionId: string | null | undefined;
  orgId: string | null | undefined;
}

/**
 * Every private query belongs to the active Clerk principal and organization.
 * JSON encoding avoids ambiguous concatenated keys if an identifier contains a
 * delimiter.
 */
export function authCacheScope(identity: AuthCacheIdentity): string {
  return JSON.stringify([
    identity.isLoaded ? "loaded" : "loading",
    identity.userId ?? null,
    identity.sessionId ?? null,
    identity.orgId ?? null,
  ]);
}

function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 5000,
      },
    },
  });
}

function QueryClientInstance({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createAppQueryClient);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/**
 * A new scope remounts the provider with an empty cache before children render.
 * Exported independently so the cross-principal cache boundary can be tested
 * without emulating Clerk internals.
 */
export function ScopedQueryClientProvider({
  scope,
  children,
}: {
  scope: string;
  children: ReactNode;
}) {
  return <QueryClientInstance key={scope}>{children}</QueryClientInstance>;
}

export function ClerkQueryClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { isLoaded, userId, sessionId, orgId } = useAuth();
  const scope = authCacheScope({ isLoaded, userId, sessionId, orgId });

  return (
    <ScopedQueryClientProvider scope={scope}>
      {children}
    </ScopedQueryClientProvider>
  );
}
