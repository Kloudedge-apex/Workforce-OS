// @vitest-environment jsdom

import React, { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings, {
  gmailOAuthAttemptFromLocation,
  gmailOAuthErrorFromLocation,
  refreshSetupQueries,
} from "./Settings";

const mocks = vi.hoisted(() => ({
  location: "/settings/integrations",
  integrationStatus: "available" as "available" | "connected",
  integrationProviders: ["gmail"] as string[],
  mailboxReady: true as boolean | null,
  mailboxCapability: true as boolean | null,
  workflowCapability: true as boolean | null,
  orgCapability: true as boolean | null,
  suppressionCapability: true as boolean | null,
  suppressionRows: [] as Array<Record<string, unknown>>,
  welcomeError: false,
  welcomeOptions: undefined as any,
  refetchWelcome: vi.fn(),
  listSuppressionOptions: undefined as any,
  createSuppressionOptions: undefined as any,
  createSuppression: vi.fn(),
  disconnectOptions: undefined as
    | { mutation?: { onSuccess?: () => unknown } }
    | undefined,
  disconnect: vi.fn(),
  finalize: vi.fn(),
  finalizeOptions: undefined as
    | {
        mutation?: {
          onSuccess?: (integration: any) => unknown;
          onError?: (error: unknown) => unknown;
        };
      }
    | undefined,
  verify: vi.fn(),
  verifyOptions: undefined as
    | {
        mutation?: {
          onSuccess?: (verification: any) => unknown;
          onError?: (error: unknown) => unknown;
        };
      }
    | undefined,
  updateOrg: vi.fn(),
  updateOrgOptions: undefined as any,
  icpProfile: {
    industries: ["SaaS"],
    titles: ["VP Sales"],
    geos: ["US"],
    sizeBand: "50-500",
    techStackSignals: ["Salesforce"],
    intentSignals: ["hiring"],
    seedDomains: ["target.example"],
    exclusionDomains: ["competitor.com"],
  },
  updateIcp: vi.fn(),
  updateIcpOptions: undefined as any,
  refetchIntegrations: vi.fn(),
  fetchGmailAuthUrl: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => [mocks.location, mocks.navigate],
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
      data: mocks.integrationProviders.map((provider) =>
        ({
          id: provider,
          provider,
          status: mocks.integrationStatus,
          accountEmail: null,
          connectedAt: null,
          errorMessage: null,
        }),
      ),
      isLoading: false,
      isError: false,
      refetch: mocks.refetchIntegrations,
    }),
    useGetOrgSettings: () => ({
      data: {
        orgId: "org_1",
        orgName: "Example",
        slug: "example",
        website: "https://example.com",
        logoUrl: null,
        country: "US",
        timezone: "UTC",
        senderName: "Ada",
        liveSendEnabled: false,
        postalAddress: "1 Main St",
        unsubscribeUrl: null,
        suppressionCount: null,
        allowlistedDomains: [],
        plan: null,
        creditsRemaining: null,
        welcomeComplete: true,
        canReviewArtifacts: true,
        canManageWorkflow: mocks.workflowCapability,
        canManageMailbox: mocks.mailboxCapability,
        canManageOrg: mocks.orgCapability,
        canManageSuppressions: mocks.suppressionCapability,
        sendReadiness:
          mocks.mailboxReady === null
            ? null
            : {
                liveSendAllowed: false,
                physicalAddressSet: true,
                senderNameSet: true,
                countrySet: true,
                mailboxConnected: mocks.mailboxReady,
                dailyCapRemaining: 10,
              },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useGetWelcomeStatus: (options: unknown) => {
      mocks.welcomeOptions = options;
      return {
        data: mocks.welcomeError
          ? undefined
          : {
              organization: { nameSet: false, websiteSet: false, complete: false },
              senderIdentity: {
                senderNameSet: false,
                countrySet: false,
                physicalAddressSet: false,
                complete: false,
              },
              icp: { usable: false, complete: false },
              mailbox: { connected: false, complete: false },
              sendReadiness: {
                liveSendAllowed: false,
                physicalAddressSet: false,
                senderNameSet: false,
                countrySet: false,
                mailboxConnected: false,
                dailyCapRemaining: null,
              },
              complete: false,
              currentStep: "organization",
              readyForLiveSend: false,
            },
        isLoading: false,
        isError: mocks.welcomeError,
        refetch: mocks.refetchWelcome,
      };
    },
    useUpdateOrgSettings: (options: unknown) => {
      mocks.updateOrgOptions = options;
      return { mutate: mocks.updateOrg, isPending: false };
    },
    useGetIcpProfile: () => ({
      data: mocks.icpProfile,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useUpdateIcpProfile: (options: unknown) => {
      mocks.updateIcpOptions = options;
      return { mutate: mocks.updateIcp, isPending: false };
    },
    useDisconnectGmailIntegration: (options: unknown) => {
      mocks.disconnectOptions = options as typeof mocks.disconnectOptions;
      return { mutate: mocks.disconnect, isPending: false };
    },
    useFinalizeGmailIntegration: (options: unknown) => {
      mocks.finalizeOptions = options as typeof mocks.finalizeOptions;
      return { mutate: mocks.finalize, isPending: false };
    },
    useVerifyGmailMailbox: (options: unknown) => {
      mocks.verifyOptions = options as typeof mocks.verifyOptions;
      return { mutate: mocks.verify, isPending: false };
    },
    useListSuppressions: (_params: unknown, options: unknown) => {
      mocks.listSuppressionOptions = options;
      return {
        data: { rows: mocks.suppressionRows, nextCursor: null },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      };
    },
    useCreateSuppression: (options: unknown) => {
      mocks.createSuppressionOptions = options;
      return { mutate: mocks.createSuppression, isPending: false };
    },
  };
});

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let popup: {
  opener: unknown;
  location: { replace: ReturnType<typeof vi.fn> };
  close: ReturnType<typeof vi.fn>;
};

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
    mocks.integrationProviders = ["gmail"];
    mocks.mailboxReady = true;
    mocks.location = "/settings/integrations";
    mocks.welcomeError = false;
    mocks.welcomeOptions = undefined;
    mocks.refetchWelcome.mockReset();
    mocks.mailboxCapability = true;
    mocks.orgCapability = true;
    mocks.disconnectOptions = undefined;
    mocks.disconnect.mockReset();
    mocks.finalize.mockReset();
    mocks.finalizeOptions = undefined;
    mocks.verify.mockReset();
    mocks.verifyOptions = undefined;
    mocks.refetchIntegrations.mockReset();
    mocks.refetchIntegrations.mockResolvedValue({
      data: [
        {
          id: "gmail",
          provider: "gmail",
          status: mocks.integrationStatus,
        },
      ],
    });
    mocks.fetchGmailAuthUrl.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.navigate.mockReset();
    window.history.replaceState({}, "", "/settings/integrations");

    mocks.fetchGmailAuthUrl.mockResolvedValue(
      "https://accounts.google.com/o/oauth2/auth",
    );
    mocks.disconnect.mockImplementation(() => {
      mocks.disconnectOptions?.mutation?.onSuccess?.();
    });
    popup = {
      opener: window,
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);

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

  it("stacks the mobile tabs above content while retaining the desktop row", async () => {
    await renderSettings();

    const layout = container.querySelector('[data-testid="settings-layout"]');
    const mobileTabs = container.querySelector(
      '[data-testid="settings-mobile-tabs"]',
    );

    expect(layout?.className.split(" ")).toEqual(
      expect.arrayContaining(["flex-col", "md:flex-row"]),
    );
    expect(mobileTabs?.className.split(" ")).toContain("w-full");
  });

  it("exposes only the supported Gmail connector", async () => {
    mocks.integrationProviders = ["gmail", "outlook", "hubspot"];

    await renderSettings();

    expect(container.textContent).toContain("Gmail");
    expect(container.textContent).not.toContain("Outlook");
    expect(container.textContent).not.toContain("HubSpot");
  });

  it("shows a bounded setup error without automatically refetching on remount", async () => {
    mocks.location = "/settings/setup";
    mocks.welcomeError = true;

    await renderSettings();

    expect(container.textContent).toContain("Couldn't verify setup status");
    expect(mocks.welcomeOptions?.query?.refetchOnMount).toBe(false);
    expect(mocks.refetchWelcome).not.toHaveBeenCalled();
  });

  it("refreshes readiness with neutral copy when polling confirms Gmail connected", async () => {
    await renderSettings();

    await act(async () => {
      getButton("Connect with Google").click();
    });

    expect(mocks.fetchGmailAuthUrl).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(popup.opener).toBeNull();
    expect(popup.location.replace).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/auth",
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

    expect(mocks.disconnect).toHaveBeenCalledWith();
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

  it("verifies a connected Gmail reply watch without sending email", async () => {
    mocks.integrationStatus = "connected";
    await renderSettings();

    await act(async () => {
      getButton("Verify reply sync").click();
    });
    expect(mocks.verify).toHaveBeenCalledWith();

    await act(async () => {
      await mocks.verifyOptions?.mutation?.onSuccess?.({
        verified: true,
        watchExpiresAt: "2026-08-24T00:00:00.000Z",
      });
    });

    expect(container.textContent).toContain("Google confirmed an active reply watch");
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Gmail connection and reply watch verified.",
    );
  });

  it.each([
    [false, "needs attention", "not operational"],
    [null, "unverified", "could not be verified"],
  ] as const)(
    "does not show green connected when mailbox readiness is %s",
    async (mailboxReady, status, explanation) => {
      mocks.integrationStatus = "connected";
      mocks.mailboxReady = mailboxReady;
      await renderSettings();

      const badge = container.querySelector(
        '[data-testid="gmail-integration-status"]',
      );
      expect(badge?.textContent).toBe(status);
      expect(badge?.className).not.toContain("bg-green-50");
      expect(container.textContent).toContain(explanation);
      expect(getButton("Disconnect").disabled).toBe(false);
    },
  );

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

  it("finalizes the callback attempt through the authenticated mutation", async () => {
    mocks.location = "/settings/integrations";
    window.history.replaceState(
      {},
      "",
      "/settings/integrations?oauth_attempt=attempt_123&provider=gmail",
    );
    await renderSettings();

    expect(mocks.finalize).toHaveBeenCalledWith({
      data: { attemptId: "attempt_123" },
    });

    await act(async () => {
      await mocks.finalizeOptions?.mutation?.onSuccess?.({
        id: "gmail",
        provider: "gmail",
        status: "connected",
        accountEmail: null,
        connectedAt: null,
        errorMessage: null,
      });
    });

    expect(mocks.refetchIntegrations).toHaveBeenCalledTimes(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(mocks.navigate).toHaveBeenCalledWith("/settings/integrations", {
      replace: true,
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Gmail connected.");
  });

  it("reconciles integration state before reporting a finalize error", async () => {
    mocks.location = "/settings/integrations";
    window.history.replaceState(
      {},
      "",
      "/settings/integrations?oauth_attempt=attempt_123&provider=gmail",
    );
    mocks.refetchIntegrations.mockResolvedValue({
      data: [{ id: "gmail", provider: "gmail", status: "connected" }],
    });
    await renderSettings();

    await act(async () => {
      await mocks.finalizeOptions?.mutation?.onError?.(new Error("lost response"));
    });

    expect(mocks.refetchIntegrations).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Gmail connected.");
    expect(mocks.toastError).not.toHaveBeenCalledWith("lost response");
  });

  it("reports provider denial immediately and clears the callback query", async () => {
    mocks.location = "/settings/integrations";
    window.history.replaceState(
      {},
      "",
      "/settings/integrations?error=gmail_denied&provider=gmail",
    );

    await renderSettings();
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/settings/integrations", {
      replace: true,
    });
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Google authorization was canceled. Gmail was not changed.",
    );
  });
});

describe("Settings organization capability", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.location = "/settings/org";
    mocks.orgCapability = false;
    mocks.navigate.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.updateOrg.mockReset();
    mocks.updateOrgOptions = undefined;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("renders org and compliance controls as owner/admin read-only", async () => {
    await renderSettings();
    expect(container.textContent).toContain(
      "Editing requires an owner or administrator.",
    );
    expect(getButton("Save Changes").disabled).toBe(true);
    expect(getButton("Save Compliance").disabled).toBe(true);
  });

  it("fails closed when organization management cannot be verified", async () => {
    mocks.orgCapability = null;
    await renderSettings();
    expect(container.textContent).toContain(
      "Organization management permissions could not be verified.",
    );
    expect(getButton("Save Changes").disabled).toBe(true);
  });

  it("normalizes the country and trims sender identity before saving", async () => {
    mocks.orgCapability = true;
    await renderSettings();

    const country = Array.from(container.querySelectorAll("input")).find(
      (input) => input.value === "US",
    );
    expect(country).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(country, "in");
      country?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => getButton("Save Compliance").click());

    expect(mocks.updateOrg).toHaveBeenCalledWith({
      data: {
        senderName: "Ada",
        postalAddress: "1 Main St",
        country: "IN",
      },
    });
  });
});

describe("Settings ICP exclusions", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.location = "/settings/icp";
    mocks.workflowCapability = true;
    mocks.updateIcp.mockReset();
    mocks.updateIcpOptions = undefined;
    mocks.icpProfile = {
      industries: ["SaaS"],
      titles: ["VP Sales"],
      geos: ["US"],
      sizeBand: "50-500",
      techStackSignals: ["Salesforce"],
      intentSignals: ["hiring"],
      seedDomains: ["target.example"],
      exclusionDomains: ["competitor.com"],
    };
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("shows persisted exclusions and submits newly added domains", async () => {
    await renderSettings();

    expect(container.textContent).toContain("competitor.com");
    expect(container.textContent).toContain(
      "removed before lead persistence and follow-on enrichment",
    );

    const input = container.querySelector(
      'input[aria-label="Exclusion Domains"]',
    );
    expect(input).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(input, "partner.example");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await act(async () => getButton("Save ICP").click());

    expect(mocks.updateIcp).toHaveBeenCalledWith({
      data: expect.objectContaining({
        exclusionDomains: ["competitor.com", "partner.example"],
      }),
    });
  });

  it("keeps every ICP mutation read-only when workflow authority is denied", async () => {
    mocks.workflowCapability = false;
    await renderSettings();

    expect(container.textContent).toContain(
      "Only a workspace owner, administrator, or manager can change the ICP",
    );
    expect(
      container.querySelector('input[aria-label="Exclusion Domains"]'),
    ).toHaveProperty("disabled", true);
    expect(getButton("Save ICP").disabled).toBe(true);

    await act(async () => getButton("Save ICP").click());
    expect(mocks.updateIcp).not.toHaveBeenCalled();
  });
});

describe("Settings suppression registry", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, React });
    mocks.location = "/settings/suppressions";
    mocks.suppressionCapability = true;
    mocks.suppressionRows = [
      {
        id: "sup_1",
        recipientRef: "buyer@example.com",
        reason: "USER_UNSUBSCRIBED",
        source: "list_unsubscribe",
        createdAt: "2026-08-13T12:00:00.000Z",
      },
      {
        id: "sup_legacy_reply",
        recipientRef: "legacy-reply@example.com",
        reason: "MANUAL",
        source: "gmail_reply",
        createdAt: "2026-08-13T11:00:00.000Z",
      },
      {
        id: "sup_provider_complaint",
        recipientRef: "provider-complaint@example.com",
        reason: "COMPLAINED",
        source: "provider_complaint",
        createdAt: "2026-08-13T10:00:00.000Z",
      },
    ];
    mocks.listSuppressionOptions = undefined;
    mocks.createSuppressionOptions = undefined;
    mocks.createSuppression.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("shows authoritative rows without offering an unsafe delete", async () => {
    await renderSettings();

    expect(container.textContent).toContain("buyer@example.com");
    expect(container.textContent).toContain("Unsubscribed");
    expect(container.textContent).toContain("list_unsubscribe");
    expect(container.textContent).toContain(
      "No total is estimated; pages show only rows confirmed by the backend.",
    );
    expect(container.textContent).not.toContain("Unsuppress");
    expect(mocks.listSuppressionOptions?.query?.enabled).toBe(true);
  });

  it("keeps reason labels neutral and shows source-derived provenance", async () => {
    await renderSettings();

    const rows = Array.from(container.querySelectorAll("tbody tr"));
    const legacyReply = rows.find((row) =>
      row.textContent?.includes("legacy-reply@example.com"),
    );
    const providerComplaint = rows.find((row) =>
      row.textContent?.includes("provider-complaint@example.com"),
    );

    expect(legacyReply?.textContent).toContain("Manual suppression");
    expect(legacyReply?.textContent).toContain("gmail_reply");
    expect(legacyReply?.textContent).not.toContain("Manual opt-out");
    expect(providerComplaint?.textContent).toContain("Complaint");
    expect(providerComplaint?.textContent).toContain("provider_complaint");
    expect(providerComplaint?.textContent).not.toContain("operator recorded");
  });

  it("submits only a truthful operator-observed complaint", async () => {
    await renderSettings();

    const input = container.querySelector('input[type="email"]');
    const select = container.querySelector("select");
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(select).toBeInstanceOf(HTMLSelectElement);

    await act(async () => {
      (input as HTMLInputElement).value = "  complaint@example.com  ";
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      (select as HTMLSelectElement).value = "COMPLAINED";
      select?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain(
      "It does not claim that Gmail supplied a complaint event.",
    );
    await act(async () => getButton("Record stop").click());
    expect(mocks.createSuppression).toHaveBeenCalledWith({
      data: {
        recipientRef: "complaint@example.com",
        reason: "COMPLAINED",
      },
    });
  });

  it("never requests recipient PII when suppression permission is denied", async () => {
    mocks.suppressionCapability = false;
    await renderSettings();

    expect(container.textContent).toContain("Suppression registry restricted");
    expect(container.textContent).not.toContain("buyer@example.com");
    expect(mocks.listSuppressionOptions?.query?.enabled).toBe(false);
  });
});

describe("settings setup query refresh", () => {
  it("parses only the backend Gmail callback shape", () => {
    expect(
      gmailOAuthAttemptFromLocation(
        "/settings/integrations?oauth_attempt=attempt_123&provider=gmail",
      ),
    ).toBe("attempt_123");
    expect(
      gmailOAuthAttemptFromLocation(
        "/settings/integrations?oauth_attempt=attempt_123&provider=outlook",
      ),
    ).toBeNull();
    expect(gmailOAuthAttemptFromLocation("/settings/integrations")).toBeNull();
    expect(
      gmailOAuthErrorFromLocation(
        "/settings/integrations?error=gmail_oauth&provider=gmail",
      ),
    ).toBe("gmail_oauth");
    expect(
      gmailOAuthErrorFromLocation(
        "/settings/integrations?error=gmail_oauth&provider=outlook",
      ),
    ).toBeNull();
  });

  it("seeds the saved org and refreshes both setup sources", async () => {
    const client = new QueryClient();
    const invalidate = vi
      .spyOn(client, "invalidateQueries")
      .mockResolvedValue(undefined);
    const saved = {
      orgId: "org_1",
      canManageOrg: true,
    } as any;

    await refreshSetupQueries(client, saved);

    expect(client.getQueryData(["getOrgSettings"])).toBe(saved);
    expect(invalidate).toHaveBeenNthCalledWith(1, {
      queryKey: ["getWelcomeStatus"],
      exact: true,
      refetchType: "all",
    });
    expect(invalidate).toHaveBeenNthCalledWith(2, {
      queryKey: ["getOrgSettings"],
      exact: true,
      refetchType: "all",
    });
    client.clear();
  });
});
