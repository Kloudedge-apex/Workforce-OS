import { describe, expect, it } from "vitest";
import {
  defaultLocalDateTime,
  futureLocalDateTimeToIso,
  replySubject,
} from "./conversationActions";

describe("conversation action helpers", () => {
  it("formats a stable local datetime input value", () => {
    const now = new Date(2026, 7, 12, 9, 5, 42);
    expect(defaultLocalDateTime(90, now)).toBe("2026-08-12T10:35");
  });

  it("rejects missing, invalid, and non-future reminders", () => {
    const now = new Date("2026-08-12T09:00:00.000Z");
    expect(futureLocalDateTimeToIso("", now)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(futureLocalDateTimeToIso("not-a-date", now)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(futureLocalDateTimeToIso("2026-08-12T08:59:59.000Z", now)).toEqual({
      ok: false,
      reason: "past",
    });
  });

  it("returns the UTC ISO value for a future local datetime", () => {
    const now = new Date("2026-08-12T09:00:00.000Z");
    const result = futureLocalDateTimeToIso("2026-08-13T12:30", now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.iso).toBe(new Date("2026-08-13T12:30").toISOString());
    }
  });

  it("adds Re: exactly once", () => {
    expect(replySubject("Workflow review")).toBe("Re: Workflow review");
    expect(replySubject(" re: Workflow review ")).toBe("re: Workflow review");
  });
});
