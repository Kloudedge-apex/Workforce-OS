// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONVERSATION_REFRESH_INTERVAL_MS } from "@/lib/conversationRefresh";
import Conversations from "./Conversations";

const mocks = vi.hoisted(() => ({
  detailData: undefined as any,
  detailError: true,
  detailRefetch: vi.fn(),
  detailQueryOptions: undefined as
    | { query?: { refetchInterval?: number } }
    | undefined,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/conversations", vi.fn()],
}));

vi.mock("@/lib/motion", () => ({
  cardEnter: {},
  useReducedMotionSafe: () => true,
}));

vi.mock("@/components/motion/Stagger", () => ({
  Stagger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  StaggerItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/v2/ConversationThread", () => ({
  ConversationThread: ({
    mode,
    conversation,
    detail,
    onSelect,
  }: {
    mode: "preview" | "full";
    conversation?: { id: string };
    detail?: { conversation: { subject: string } };
    onSelect?: (id: string) => void;
  }) =>
    mode === "full" ? (
      <div>{detail?.conversation.subject}</div>
    ) : (
      <button
        type="button"
        onClick={() => conversation && onSelect?.(conversation.id)}
      >
        Open conversation
      </button>
    ),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListConversations: () => ({
    data: {
      items: [{ id: "conv_1" }],
      total: 1,
      page: 1,
      limit: 20,
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useGetConversation: (
    _id: string,
    options: { query?: { refetchInterval?: number } },
  ) => {
    mocks.detailQueryOptions = options;
    return {
      data: mocks.detailData,
      isLoading: false,
      isError: mocks.detailError,
      refetch: mocks.detailRefetch,
    };
  },
}));

let container: HTMLDivElement;
let root: Root;

describe("Conversations observation loop", () => {
  beforeEach(() => {
    Object.assign(globalThis, {
      IS_REACT_ACT_ENVIRONMENT: true,
      React,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    mocks.detailError = true;
    mocks.detailData = undefined;
    mocks.detailRefetch.mockReset();
    mocks.detailQueryOptions = undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("polls an open thread and gives detail failures a retry path", async () => {
    await act(async () => root.render(<Conversations />));

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Open conversation",
    );
    expect(openButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => (openButton as HTMLButtonElement).click());

    expect(mocks.detailQueryOptions?.query?.refetchInterval).toBe(
      CONVERSATION_REFRESH_INTERVAL_MS,
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't load this conversation",
    );

    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again",
    );
    expect(retry).toBeInstanceOf(HTMLButtonElement);
    await act(async () => (retry as HTMLButtonElement).click());
    expect(mocks.detailRefetch).toHaveBeenCalledTimes(1);
  });

  it("uses native pressed buttons for inbox filters", async () => {
    await act(async () => root.render(<Conversations />));
    const filters = container.querySelectorAll("button[aria-pressed]");
    expect(filters).toHaveLength(4);
    expect(filters[0]?.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps cached detail visible when a polling refresh fails", async () => {
    mocks.detailData = {
      conversation: { subject: "Cached desktop conversation" },
      messages: [],
      followUps: [],
      meetings: [],
    };
    mocks.detailError = true;
    await act(async () => root.render(<Conversations />));

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Open conversation",
    );
    await act(async () => (openButton as HTMLButtonElement).click());

    expect(container.textContent).toContain("Cached desktop conversation");
    expect(container.textContent).not.toContain(
      "Couldn't load this conversation",
    );
  });
});
