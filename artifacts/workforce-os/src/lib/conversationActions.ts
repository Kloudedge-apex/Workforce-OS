export type FutureDateTimeResult =
  | { ok: true; iso: string }
  | { ok: false; reason: "missing" | "invalid" | "past" };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Format a future local wall-clock value for an input[type=datetime-local]. */
export function defaultLocalDateTime(
  minutesFromNow: number,
  now: Date = new Date(),
): string {
  const date = new Date(now.getTime() + minutesFromNow * 60_000);
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

/** Validate a local wall-clock value and convert it to the API's UTC ISO form. */
export function futureLocalDateTimeToIso(
  value: string,
  now: Date = new Date(),
): FutureDateTimeResult {
  if (value.trim().length === 0) return { ok: false, reason: "missing" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { ok: false, reason: "invalid" };
  if (date.getTime() <= now.getTime()) return { ok: false, reason: "past" };
  return { ok: true, iso: date.toISOString() };
}

export function replySubject(subject: string): string {
  const trimmed = subject.trim();
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}
