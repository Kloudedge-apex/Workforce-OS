import React from "react";
import {
  type GraphRun,
  useGetTodayKpis,
  useListRuns,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  ArrowRight,
  CalendarCheck2,
  FileClock,
  MailCheck,
  UsersRound,
} from "lucide-react";
import { CountUp } from "@/components/motion/CountUp";
import { cn } from "@/lib/utils";

const FUNNEL_STEPS = [
  { key: "leadsSourced", label: "Sourced" },
  { key: "verifiedEmails", label: "Verified" },
  { key: "leadsQualified", label: "Qualified" },
  { key: "artifactsPending", label: "In review" },
  { key: "qualifiedMeetingsBooked", label: "Meetings" },
] as const;

const STATUS_ORDER = [
  ["COMPLETED", "Completed", "bg-emerald-500"],
  ["RUNNING", "Running", "bg-blue-500"],
  ["AWAITING_APPROVAL", "Needs review", "bg-amber-400"],
  ["FAILED", "Failed", "bg-slate-400"],
] as const;

export function summarizeRunStatuses(runs: GraphRun[]) {
  return STATUS_ORDER.map(([status, label, color]) => ({
    status,
    label,
    color,
    count: runs.filter((run) => run.status === status).length,
  }));
}

function formatStartedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function runTask(run: GraphRun) {
  if (run.status === "AWAITING_APPROVAL") return "Review outreach drafts";
  if (run.status === "COMPLETED") return "Run completed";
  if (run.status === "FAILED") return "Needs attention";
  if (run.status === "CANCELLED") return "Run cancelled";
  const stage = run.stagesCompleted.at(-1)?.replaceAll("_", " ");
  return stage ? `Completed ${stage}` : "Researching prospects";
}

function runProgress(run: GraphRun) {
  if (run.status === "COMPLETED") return 100;
  if (run.status === "AWAITING_APPROVAL") return 88;
  return Math.min(80, Math.max(12, run.stagesCompleted.length * 16));
}

export default function Today() {
  const {
    data: kpis,
    isLoading: kpisLoading,
    isError: kpisError,
  } = useGetTodayKpis({
    query: { refetchInterval: 15000, queryKey: ["getTodayKpis"] },
  });
  const {
    data: runsData,
    isLoading: runsLoading,
    isError: runsError,
  } = useListRuns(
    { page: 1, limit: 20 },
    { query: { queryKey: ["listRuns", 1, 20], refetchInterval: 10000 } },
  );

  const runs = runsData?.items ?? [];
  const statusSummary = summarizeRunStatuses(runs);
  const maxStatusCount = Math.max(
    1,
    ...statusSummary.map((item) => item.count),
  );
  const metrics = [
    {
      label: "Leads generated",
      value: kpis?.leadsSourced,
      note: "Tenant-scoped prospects",
      icon: UsersRound,
      tone: "text-blue-700 bg-blue-50",
    },
    {
      label: "Verified emails",
      value: kpis?.verifiedEmails,
      note: "SMTP-confirmed addresses",
      icon: MailCheck,
      tone: "text-emerald-700 bg-emerald-50",
    },
    {
      label: "Drafts awaiting approval",
      value: kpis?.artifactsPending,
      note: "Human review required",
      icon: FileClock,
      tone: "text-amber-700 bg-amber-50",
      href: "/outbound",
    },
    {
      label: "Meetings booked",
      value: kpis?.qualifiedMeetingsBooked,
      note: "Confirmed outcomes",
      icon: CalendarCheck2,
      tone: "text-emerald-700 bg-emerald-50",
    },
  ];

  return (
    <div className="min-h-full bg-slate-100 px-4 py-6 text-slate-950 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
              Operations control room
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Outbound performance
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Live prospecting, verification, drafting, and meeting outcomes.
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Auto-refreshes every 10 seconds
          </p>
        </header>

        <section
          aria-label="Key performance indicators"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {metrics.map((metric) => {
            const content = (
              <div className="flex h-full flex-col justify-between border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-medium text-slate-500">
                    {metric.label}
                  </p>
                  <span
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded",
                      metric.tone,
                    )}
                    title={metric.label}
                  >
                    <metric.icon aria-hidden="true" className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-5">
                  <p className="font-tabular text-3xl font-semibold tracking-tight">
                    {kpisLoading || metric.value === undefined ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <CountUp value={metric.value} />
                    )}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {kpisError ? "Data unavailable" : metric.note}
                  </p>
                </div>
              </div>
            );

            return metric.href ? (
              <Link
                key={metric.label}
                href={metric.href}
                className="block transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                {content}
              </Link>
            ) : (
              <div key={metric.label}>{content}</div>
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.7fr)]">
          <div className="border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold">Lead funnel</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Verified progress across the outbound workflow
                </p>
              </div>
              <Link
                href="/pipeline"
                className="flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
              >
                View leads{" "}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-5 sm:gap-0">
              {FUNNEL_STEPS.map((step, index) => (
                <div
                  key={step.key}
                  className="relative min-w-0 sm:px-4 sm:first:pl-0 sm:last:pr-0"
                >
                  {index > 0 && (
                    <div className="absolute left-0 top-4 hidden h-px w-full -translate-x-1/2 bg-slate-200 sm:block" />
                  )}
                  <div className="relative z-10 flex items-center gap-3 sm:block">
                    <span
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center border text-xs font-semibold",
                        index === FUNNEL_STEPS.length - 1
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-blue-200 bg-blue-50 text-blue-700",
                      )}
                    >
                      {index + 1}
                    </span>
                    <div className="sm:mt-3">
                      <p className="font-tabular text-xl font-semibold">
                        {kpisLoading || !kpis ? (
                          "—"
                        ) : (
                          <CountUp value={kpis[step.key]} />
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {step.label}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
            <h3 className="text-sm font-semibold">Task status</h3>
            <p className="mt-1 text-xs text-slate-500">
              Last {runs.length} agent runs
            </p>
            <div className="mt-6 space-y-4">
              {runsError ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  Run data unavailable.
                </p>
              ) : (
                statusSummary.map((item) => (
                  <div key={item.status}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-slate-600">{item.label}</span>
                      <span className="font-tabular font-semibold text-slate-900">
                        {item.count}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100">
                      <div
                        className={cn(
                          "h-full transition-[width] duration-500",
                          item.color,
                        )}
                        style={{
                          width: `${(item.count / maxStatusCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="overflow-hidden border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <h3 className="text-sm font-semibold">Active agent runs</h3>
              <p className="mt-1 text-xs text-slate-500">
                Autonomous SDR work and recent outcomes
              </p>
            </div>
            <Link
              href="/runs"
              className="flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
            >
              View all <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">Agent</th>
                  <th className="px-6 py-3 font-semibold">Current task</th>
                  <th className="px-6 py-3 font-semibold">Progress</th>
                  <th className="px-6 py-3 font-semibold">Leads</th>
                  <th className="px-6 py-3 font-semibold">Drafts</th>
                  <th className="px-6 py-3 font-semibold">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runsLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-8 text-center text-slate-400"
                    >
                      Loading agent runs…
                    </td>
                  </tr>
                ) : runsError ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-10 text-center text-slate-500"
                    >
                      Run data unavailable.
                    </td>
                  </tr>
                ) : runs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-10 text-center text-slate-500"
                    >
                      No agent runs yet.
                    </td>
                  </tr>
                ) : (
                  runs.slice(0, 8).map((run) => {
                    const progress = runProgress(run);
                    return (
                      <tr
                        key={run.id}
                        className="group transition-colors hover:bg-slate-50"
                      >
                        <td className="px-6 py-4">
                          <Link
                            href={`/runs/${encodeURIComponent(run.id)}`}
                            className="flex items-center gap-3 font-medium text-slate-900"
                          >
                            <span
                              className="grid h-7 w-7 place-items-center rounded bg-slate-900 text-white"
                              title="Autonomous SDR agent"
                            >
                              <span className="h-2 w-2 rounded-full bg-lime-400" />
                            </span>
                            SDR Agent
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {runTask(run)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 w-24 bg-slate-100">
                              <div
                                className={cn(
                                  "h-full",
                                  run.status === "AWAITING_APPROVAL"
                                    ? "bg-amber-400"
                                    : run.status === "COMPLETED"
                                      ? "bg-emerald-500"
                                      : "bg-blue-500",
                                )}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <StatusBadge status={run.status} />
                          </div>
                        </td>
                        <td className="px-6 py-4 font-tabular text-slate-700">
                          {run.leadsScored ?? "—"}
                        </td>
                        <td className="px-6 py-4 font-tabular text-slate-700">
                          {run.artifactsGenerated ?? "—"}
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {formatStartedAt(run.startedAt)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: GraphRun["status"] }) {
  const label =
    status === "AWAITING_APPROVAL"
      ? "Needs review"
      : status.toLowerCase().replaceAll("_", " ");
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
        status === "COMPLETED" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700",
        status === "RUNNING" && "border-blue-200 bg-blue-50 text-blue-700",
        status === "AWAITING_APPROVAL" &&
          "border-amber-200 bg-amber-50 text-amber-700",
        (status === "FAILED" || status === "CANCELLED") &&
          "border-slate-200 bg-slate-50 text-slate-600",
      )}
    >
      {label}
    </span>
  );
}
