import React from "react";
import type { BillingInfo } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

type BillingUsage = Pick<
  BillingInfo,
  | "creditsRemaining"
  | "creditsTotal"
  | "sendsThisMonth"
  | "sendsLimit"
  | "seats"
  | "seatsLimit"
>;

function UsageBar({
  label,
  used,
  total,
}: {
  label: string;
  used: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const color =
    pct >= 90 ? "bg-rust-500" : pct >= 70 ? "bg-amber-400" : "bg-ink-700";
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-ink-600">{label}</span>
        <span className="font-mono text-ink-900 dark:text-paper-50">
          {used.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>
      <div
        className="h-2 bg-paper-200 rounded-full overflow-hidden"
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={used}
      >
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-ink-400 mt-1 text-right">{pct}% used</p>
    </div>
  );
}

/** Render only accounting values the backend actually recorded. */
export function BillingUsageSummary({ billing }: { billing: BillingUsage }) {
  const creditsRemaining = billing.creditsRemaining;
  const creditsTotal = billing.creditsTotal;
  const sendsThisMonth = billing.sendsThisMonth;
  const sendsLimit = billing.sendsLimit;

  return (
    <div className="space-y-4" data-testid="billing-usage-summary">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-600">Credits remaining</span>
        <span className="font-mono text-ink-900 dark:text-paper-50">
          {creditsRemaining === null
            ? "Not recorded"
            : creditsRemaining.toLocaleString()}
        </span>
      </div>
      {creditsRemaining !== null && creditsTotal !== null && (
        <UsageBar
          label="Credits"
          used={creditsTotal - creditsRemaining}
          total={creditsTotal}
        />
      )}

      {sendsThisMonth !== null && sendsLimit !== null ? (
        <UsageBar
          label="Sends this month"
          used={sendsThisMonth}
          total={sendsLimit}
        />
      ) : (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-600">Sends this month</span>
          <span className="font-mono text-ink-900 dark:text-paper-50">
            Not recorded
          </span>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-600">Seats</span>
        <span className="font-mono text-ink-900 dark:text-paper-50">
          {billing.seats.toLocaleString()} used
          {billing.seatsLimit === null ? (
            <span className="text-ink-400"> · Limit: Not recorded</span>
          ) : (
            <> / {billing.seatsLimit.toLocaleString()}</>
          )}
        </span>
      </div>
    </div>
  );
}
