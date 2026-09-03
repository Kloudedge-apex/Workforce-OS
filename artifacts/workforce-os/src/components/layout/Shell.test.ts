import { describe, expect, it } from "vitest";
import { MOBILE_NAV_ITEMS } from "./Shell";

describe("mobile navigation", () => {
  it("provides a real Runs destination and labels Settings honestly", () => {
    expect(
      MOBILE_NAV_ITEMS.map(({ href, label }) => ({ href, label })),
    ).toEqual([
      { href: "/today", label: "Today" },
      { href: "/pipeline", label: "Pipeline" },
      { href: "/outbound", label: "Outbound" },
      { href: "/runs", label: "Runs" },
      { href: "/conversations", label: "Conversations" },
      { href: "/settings", label: "Settings" },
    ]);
  });
});
