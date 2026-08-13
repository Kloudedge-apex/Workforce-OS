// @vitest-environment jsdom

import React, { act } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authCacheScope, ScopedQueryClientProvider } from "./queryClientScope";

const fetchRegistry = vi.fn(async () => ({
  recipientRef: "owner-private@example.com",
}));

const registryQueryKey = ["/api/settings/suppressions", { limit: 50 }] as const;

function SeedOwnerRegistryCache() {
  const queryClient = useQueryClient();
  React.useEffect(() => {
    queryClient.setQueryData(registryQueryKey, {
      recipientRef: "owner-private@example.com",
    });
  }, [queryClient]);
  return null;
}

function RegistryProbe({ enabled }: { enabled: boolean }) {
  const { data } = useQuery({
    queryKey: registryQueryKey,
    queryFn: fetchRegistry,
    enabled,
  });

  return <div>{data?.recipientRef ?? "Registry hidden"}</div>;
}

let container: HTMLDivElement;
let root: Root;

describe("principal-scoped query cache", () => {
  beforeEach(() => {
    Object.assign(globalThis, {
      IS_REACT_ACT_ENVIRONMENT: true,
      React,
    });
    fetchRegistry.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("changes scope for a user, session, or organization transition", () => {
    const owner = {
      isLoaded: true,
      userId: "user_owner",
      sessionId: "session_1",
      orgId: "org_1",
    };

    expect(authCacheScope(owner)).not.toBe(
      authCacheScope({ ...owner, userId: "user_member" }),
    );
    expect(authCacheScope(owner)).not.toBe(
      authCacheScope({ ...owner, sessionId: "session_2" }),
    );
    expect(authCacheScope(owner)).not.toBe(
      authCacheScope({ ...owner, orgId: "org_2" }),
    );
  });

  it("does not expose an owner's cached registry to a denied principal", async () => {
    await act(async () => {
      root.render(
        <ScopedQueryClientProvider scope="owner-session-org">
          <SeedOwnerRegistryCache />
          <RegistryProbe enabled />
        </ScopedQueryClientProvider>,
      );
    });
    expect(container.textContent).toContain("owner-private@example.com");

    await act(async () => {
      root.render(
        <ScopedQueryClientProvider scope="denied-session-org">
          <RegistryProbe enabled={false} />
        </ScopedQueryClientProvider>,
      );
    });

    expect(container.textContent).toBe("Registry hidden");
    expect(container.textContent).not.toContain("owner-private@example.com");
    expect(fetchRegistry).not.toHaveBeenCalled();
  });
});
