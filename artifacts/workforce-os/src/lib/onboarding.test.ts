import { describe, expect, it } from "vitest";
import { homePathForWelcome } from "./onboarding";

describe("homePathForWelcome", () => {
  const complete = {
    organization: { nameSet: true, websiteSet: true, complete: true },
    senderIdentity: {
      senderNameSet: true,
      countrySet: true,
      physicalAddressSet: true,
      complete: true,
    },
    icp: { usable: true, complete: true },
    mailbox: { connected: true, complete: true },
    sendReadiness: {
      liveSendAllowed: false,
      physicalAddressSet: true,
      senderNameSet: true,
      countrySet: true,
      mailboxConnected: true,
      dailyCapRemaining: 10,
    },
    complete: true,
    currentStep: "complete",
    readyForLiveSend: false,
  };

  it("opens the product only for an explicit backend completion verdict", () => {
    expect(homePathForWelcome(complete)).toBe("/today");
  });

  it("fails closed into guided setup for incomplete or malformed state", () => {
    expect(homePathForWelcome({ complete: false })).toBe("/settings/setup");
    expect(homePathForWelcome({ complete: "true" })).toBe("/settings/setup");
    expect(homePathForWelcome({ complete: true })).toBe("/settings/setup");
    const { countrySet: _omitted, ...readinessWithoutCountry } = complete.sendReadiness;
    expect(
      homePathForWelcome({ ...complete, sendReadiness: readinessWithoutCountry }),
    ).toBe("/settings/setup");
    expect(
      homePathForWelcome({ ...complete, organization: { ...complete.organization, websiteSet: false } }),
    ).toBe("/settings/setup");
    expect(homePathForWelcome(null)).toBe("/settings/setup");
    expect(homePathForWelcome(undefined)).toBe("/settings/setup");
  });
});
