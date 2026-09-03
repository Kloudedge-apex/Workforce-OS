import { describe, expect, it } from "vitest";
import { MOBILE_NAV_ITEMS } from "./Shell";

describe("workspace navigation", () => {
  it("maps the control-room destinations to real application routes", () => {
    expect(
      MOBILE_NAV_ITEMS.map(({ href, label }) => ({ href, label })),
    ).toEqual([
      { href: "/today", label: "Dashboard" },
      { href: "/pipeline", label: "Leads" },
      { href: "/runs", label: "Campaigns" },
      { href: "/conversations", label: "Inbox" },
      { href: "/outbound", label: "Content" },
      { href: "/analytics", label: "Analytics" },
    ]);
  });
});
