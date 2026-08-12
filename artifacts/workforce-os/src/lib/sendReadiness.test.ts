import { describe, it, expect } from "vitest";
import { parseSendReadiness, getSendReadiness, workspaceLiveAuthorization, workspaceLiveState } from "./sendReadiness";

const FULL = {
  liveSendAllowed: true,
  physicalAddressSet: true,
  senderNameSet: true,
  mailboxConnected: true,
  dailyCapRemaining: 25,
};

describe("parseSendReadiness", () => {
  it("accepts the exact GL5 contract", () => {
    expect(parseSendReadiness(FULL)).toEqual(FULL);
  });

  it("accepts dailyCapRemaining null and degrades missing/non-finite caps to null", () => {
    expect(parseSendReadiness({ ...FULL, dailyCapRemaining: null })?.dailyCapRemaining).toBeNull();
    const { dailyCapRemaining: _omit, ...withoutCap } = FULL;
    expect(parseSendReadiness(withoutCap)?.dailyCapRemaining).toBeNull();
    expect(parseSendReadiness({ ...FULL, dailyCapRemaining: Infinity })?.dailyCapRemaining).toBeNull();
    expect(parseSendReadiness({ ...FULL, dailyCapRemaining: "25" })?.dailyCapRemaining).toBeNull();
  });

  it("returns null for absent/malformed envelopes — never fabricates a verdict", () => {
    expect(parseSendReadiness(undefined)).toBeNull();
    expect(parseSendReadiness(null)).toBeNull();
    expect(parseSendReadiness("live")).toBeNull();
    expect(parseSendReadiness([])).toBeNull();
    expect(parseSendReadiness({})).toBeNull();
    expect(parseSendReadiness({ ...FULL, liveSendAllowed: "true" })).toBeNull();
    expect(parseSendReadiness({ ...FULL, senderNameSet: undefined })).toBeNull();
  });
});

describe("getSendReadiness", () => {
  it("reads the envelope off an OrgSettings-shaped payload", () => {
    expect(getSendReadiness({ orgId: "o1", sendReadiness: FULL })).toEqual(FULL);
  });

  it("returns null when the settings payload is missing or lags the contract", () => {
    expect(getSendReadiness(undefined)).toBeNull();
    expect(getSendReadiness(null)).toBeNull();
    expect(getSendReadiness({ orgId: "o1" })).toBeNull();
    expect(getSendReadiness({ orgId: "o1", sendReadiness: { liveSendAllowed: true } })).toBeNull();
  });
});

describe("workspaceLiveState", () => {
  it("is true only when every effective live-send gate is open", () => {
    expect(workspaceLiveState({ sendReadiness: FULL })).toBe(true);
    for (const blocked of [
      { liveSendAllowed: false },
      { physicalAddressSet: false },
      { senderNameSet: false },
      { mailboxConnected: false },
      { dailyCapRemaining: 0 },
      { dailyCapRemaining: null },
    ]) {
      expect(workspaceLiveState({ sendReadiness: { ...FULL, ...blocked } })).toBe(false);
    }
  });

  it("is null (unknown) when readiness is absent — callers must not claim live OR dry-run as fact", () => {
    expect(workspaceLiveState(undefined)).toBeNull();
    expect(workspaceLiveState({ orgId: "o1" })).toBeNull();
  });
});

describe("workspaceLiveAuthorization", () => {
  it("stays true through temporary readiness blockers", () => {
    expect(
      workspaceLiveAuthorization({
        sendReadiness: { ...FULL, mailboxConnected: false, dailyCapRemaining: 0 },
      }),
    ).toBe(true);
  });

  it("is false only when the operator allowlist is explicitly off", () => {
    expect(
      workspaceLiveAuthorization({ sendReadiness: { ...FULL, liveSendAllowed: false } }),
    ).toBe(false);
    expect(workspaceLiveAuthorization(undefined)).toBeNull();
  });
});
