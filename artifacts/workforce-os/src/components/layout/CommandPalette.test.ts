import { describe, expect, it } from "vitest";
import { canTriggerPipelineFromCommand } from "./CommandPalette";

const completeStatus = {
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
  currentStep: "complete",
  complete: true,
  readyForLiveSend: false,
};

describe("command palette pipeline trigger", () => {
  it("enables the trigger only after the persisted setup contract is complete", () => {
    expect(canTriggerPipelineFromCommand(completeStatus)).toBe(true);
    expect(
      canTriggerPipelineFromCommand({
        ...completeStatus,
        mailbox: { connected: false, complete: false },
        currentStep: "mailbox",
        complete: false,
      }),
    ).toBe(false);
  });

  it("fails closed for absent or malformed setup state", () => {
    expect(canTriggerPipelineFromCommand(undefined)).toBe(false);
    expect(canTriggerPipelineFromCommand({ complete: true })).toBe(false);
  });
});
