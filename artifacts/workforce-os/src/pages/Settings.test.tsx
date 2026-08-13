// @vitest-environment jsdom

import React, { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";

const mocks = vi.hoisted(() => ({
  integrationStatus: "available" as "available" | "connected",
  mailboxCapability: true as boolean | null,
  disconnectOptions: undefined as
    | { mutation?: { onSuccess?: () => unknown } }
    | undefined,
  disconnect: vi.fn(),
  refetchIntegrations: vi.fn(),
  fetchGmailAuthUrl: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/settings/integrations", mocks.navigate],
}));

vi.mock("@/lib/motion", () => ({
  fadeSlideUp: {},
  useReducedMotionSafe: () => true,
}));

vi.mock("@/lib/oauthConnect", () => ({
  fetchGmailAuthUrl: mocks.fetchGmailAuthUrl,
}));

vi.mock("@/components/brand/IntegrationLogo", () => ({
  IntegrationLogo: () => <span aria-hidden="true" />,
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  }),
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@workspace/api-client-react")>();

  return {
    ...actual,
    useGetOrgHealth: () => ({
      data: {
        liveSendEnabled: false,
        postalAddressConfigured: true,
        unsubscribeConfigured: true,
        suppressionCount: 0,
        blockers: [],
      },
      isLoading: false,
      isError: false,
    }),
    useListIntegrations: () => ({
      data: [
        {
          id: "gmail",
          provider: "gmail",
          status: mocks.integrationStatus,
          accountEmail: null,
          connectedAt: null,
          errorMessage: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: mocks.refetchIntegrations,
    }),
    useGetOrgSettings: () => ({
      data: { canReviewArtifacts: mocks.mailboxCapability },
      isLoading: false,
      isError: false,
    }),
    useDisconnectIntegration: (options: unknown) => {
      mocks.disconnectOptions = options as typeof mocks.disconnectOptions;
      return { mutate: mocks.disconnect, isPending: false };
    },
  };
});

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function settingsTree() {
  return (
    <QueryClientProvider client={queryClient}>
      <Settings />
    </QueryClientProvider>
  );
}

async function renderSettings() {
  await act(async () => {
    root.render(settingsTree());
  });
}

function getButton(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Could not find button: ${label}`);
  }
  return button;
}

describe("Settings Gmail readiness refresh", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.integrationStatus = "available";
    mocks.mailboxCapability = true;
    mocks.disconnectOptions = undefined;
    mocks.disconnect.mockReset();
    mocks.refetchIntegrations.mockReset();
    mocks.fetchGmailAuthUrl.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.navigate.mockReset();

    mocks.fetchGmailAuthUrl.mockResolvedValue(
      "https://accounts.google.com/o/oauth2/auth",
    );
    mocks.disconnect.mockImplementation(() => {
      mocks.disconnectOptions?.mutation?.onSuccess?.();
    });
    vi.spyOn(window, "open").mockReturnValue({} as Window);

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("refreshes readiness with neutral copy when polling confirms Gmail connected", async () => {
    await renderSettings();

    await act(async () => {
      getButton("Connect with Google").click();
    });

    expect(mocks.fetchGmailAuthUrl).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/auth",
      "_blank",
      "noopener,noreferrer",
    );

    mocks.integrationStatus = "connected";
    await renderSettings();

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ["getWelcomeStatus"],
      exact: true,
      refetchType: "all",
    });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ["getOrgSettings"],
      exact: true,
      refetchType: "all",
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Gmail connected.");
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith(
      expect.stringContaining("can now send"),
    );
  });

  it("refreshes readiness after Gmail disconnect succeeds", async () => {
    mocks.integrationStatus = "connected";
    await renderSettings();

    await act(async () => {
      getButton("Disconnect").click();
    });

    expect(mocks.disconnect).toHaveBeenCalledWith({ provider: "gmail" });
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ["getWelcomeStatus"],
      exact: true,
      refetchType: "all",
    });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ["getOrgSettings"],
      exact: true,
      refetchType: "all",
    });
    expect(mocks.refetchIntegrations).toHaveBeenCalledTimes(1);
  });

  it("renders known non-admin capability as read-only without OAuth controls", async () => {
    mocks.mailboxCapability = false;
    mocks.integrationStatus = "connected";
    await renderSettings();

    expect(container.textContent).toContain(
      "Connecting or disconnecting Gmail requires an administrator or manager.",
    );
    expect(container.textContent).not.toContain("Disconnect");
    expect(mocks.fetchGmailAuthUrl).not.toHaveBeenCalled();
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("fails closed when mailbox management capability is unknown", async () => {
    mocks.mailboxCapability = null;
    await renderSettings();

    expect(container.textContent).toContain(
      "Mailbox management permissions could not be verified.",
    );
    expect(container.textContent).not.toContain("Connect with Google");
    expect(mocks.fetchGmailAuthUrl).not.toHaveBeenCalled();
  });
});
