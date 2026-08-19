import React, { useState, useEffect, useRef } from "react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  useGetOrgSettings, useUpdateOrgSettings, useGetOrgHealth,
  useGetIcpProfile, useUpdateIcpProfile,
  useListIntegrations, useDisconnectGmailIntegration, useFinalizeGmailIntegration, useVerifyGmailMailbox,
  useGetWelcomeStatus,
  useListSuppressions, useCreateSuppression,
  getListSuppressionsQueryKey,
  type OrgSettings,
  type CreateSuppressionInputReason,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Building, Shield, Link as LinkIcon, Map, AlertCircle, CheckCircle2,
  X, Plug, ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { IntegrationLogo } from "@/components/brand/IntegrationLogo";
import { fadeSlideUp, useReducedMotionSafe } from "@/lib/motion";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { getSendReadiness, workspaceLiveState } from "@/lib/sendReadiness";
import { fetchGmailAuthUrl } from "@/lib/oauthConnect";
import { cn } from "@/lib/utils";

// ─── Tab config ─────────────────────────────────────────────────────────────
const TABS = [
  { id: "setup",         label: "Guided Setup",   icon: CheckCircle2 },
  { id: "org",           label: "General",       icon: Building },
  { id: "icp",           label: "ICP",            icon: Map },
  { id: "integrations",  label: "Integrations",   icon: LinkIcon },
  { id: "suppressions",  label: "Suppressions",   icon: Shield },
] as const;

type TabId = typeof TABS[number]["id"];

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Settings() {
  const [location, navigate] = useLocation();
  const settingsPath = location.split("?", 1)[0] ?? location;
  const sub = settingsPath.replace(/^\/settings\/?/, "") || "setup";
  const activeTab = (TABS.find(t => t.id === sub)?.id ?? "setup") as TabId;

  const setTab = (id: TabId) => navigate(`/settings/${id}`);

  return (
    <div className="flex flex-col h-full bg-paper-50 overflow-hidden">
      {/* Health bar */}
      <HealthBar />

      <div
        className="flex flex-1 min-h-0 flex-col md:flex-row"
        data-testid="settings-layout"
      >
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-44 shrink-0 flex-col border-r border-paper-200 bg-paper-100 p-2 gap-0.5 overflow-y-auto">
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest px-3 pt-2 pb-1">Settings</p>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 text-sm rounded-md font-medium transition-colors text-left",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                activeTab === id
                  ? "bg-white text-ink-900 shadow-sm border border-paper-200"
                  : "text-ink-600 hover:bg-paper-200 hover:text-ink-900"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </aside>

        {/* Mobile horizontal tabs */}
        <div
          className="md:hidden w-full overflow-x-auto flex border-b border-paper-200 bg-paper-100 no-scrollbar shrink-0"
          data-testid="settings-mobile-tabs"
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
                activeTab === id
                  ? "border-rust-500 text-rust-600"
                  : "border-transparent text-ink-500"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <TabPanel tabId={activeTab} />
        </main>
      </div>
    </div>
  );
}

// ─── Health Bar ───────────────────────────────────────────────────────────────
function HealthBar() {
  const { data: health, isLoading, isError } = useGetOrgHealth({ query: { queryKey: ["getOrgHealth"] } });
  if (isLoading) return <div className="h-10 bg-ink-900 animate-pulse" />;
  if (isError || !health)
    return (
      <div className="shrink-0 px-6 py-2.5 flex items-center gap-3 bg-ember-500">
        <AlertCircle className="h-4 w-4 text-white shrink-0" />
        <span className="text-sm text-white font-medium">Health status unavailable — could not reach the workspace health check.</span>
      </div>
    );
  const ok = health.blockers.length === 0;
  return (
    <div className={cn("shrink-0 px-6 py-2.5 flex items-center gap-4 flex-wrap", ok ? "bg-ink-900" : "bg-ember-500")}>
      {ok
        ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
        : <AlertCircle className="h-4 w-4 text-white shrink-0" />}
      <span className="text-sm text-white font-medium">
        {ok ? "Workspace healthy" : `${health.blockers.length} blocker${health.blockers.length !== 1 ? "s" : ""}: ${health.blockers.join(", ")}`}
      </span>
      {health && (
        <div className="flex items-center gap-4 ml-auto text-xs">
          <HealthDot label="Live Send" ok={health.liveSendEnabled} />
          <HealthDot label="Postal Address" ok={health.postalAddressConfigured} />
          <HealthDot label="Unsubscribe" ok={health.unsubscribeConfigured} />
          <span className="text-paper-300">{health.suppressionCount} suppressed</span>
        </div>
      )}
    </div>
  );
}
function HealthDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("w-1.5 h-1.5 rounded-full", ok ? "bg-green-400" : "bg-ember-300")} />
      <span className={cn("text-xs", ok ? "text-paper-300" : "text-white font-semibold")}>{label}</span>
    </div>
  );
}

// ─── Guided setup ────────────────────────────────────────────────────────────
function SetupTab() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, refetch } = useGetWelcomeStatus({
    query: { queryKey: ["getWelcomeStatus"], refetchOnMount: false },
  });

  if (isLoading) return <FormSkeleton rows={5} />;
  if (isError || !data) {
    return (
      <ErrorState
        title="Couldn't verify setup status"
        description="Setup stays incomplete until the backend can verify every persisted step."
        onRetry={() => refetch()}
      />
    );
  }

  const steps = [
    {
      key: "organization",
      title: "Organization identity",
      description: data.organization.complete
        ? "Organization name and HTTPS website are stored."
        : `Add ${[
            !data.organization.nameSet ? "an organization name" : null,
            !data.organization.websiteSet ? "an HTTPS website" : null,
          ].filter(Boolean).join(" and ")}.`,
      complete: data.organization.complete,
      href: "/settings/org",
      action: "Edit organization",
    },
    {
      key: "sender_identity",
      title: "Sender identity",
      description: data.senderIdentity.complete
        ? "Sender name, ISO country, and physical address are stored."
        : "Add the sender name, ISO country, and physical address used in compliant email footers.",
      complete: data.senderIdentity.complete,
      href: "/settings/org",
      action: "Set sender identity",
    },
    {
      key: "icp",
      title: "Ideal customer profile",
      description: data.icp.complete
        ? "A usable targeting profile is stored."
        : "Define at least one target title, industry, geography, technology, intent signal, or seed domain.",
      complete: data.icp.complete,
      href: "/settings/icp",
      action: "Define ICP",
    },
    {
      key: "mailbox",
      title: "Gmail mailbox",
      description: data.mailbox.complete
        ? "The backend confirms a connected mailbox."
        : "Connect Gmail through Google OAuth; setup advances only after the backend reports CONNECTED.",
      complete: data.mailbox.complete,
      href: "/settings/integrations",
      action: "Connect Gmail",
    },
  ] as const;

  const readinessRows = [
    ["Workspace allowlisted", data.sendReadiness.liveSendAllowed],
    ["Mailbox connected", data.sendReadiness.mailboxConnected],
    ["Sender name set", data.sendReadiness.senderNameSet],
    ["Country set", data.sendReadiness.countrySet],
    ["Physical address set", data.sendReadiness.physicalAddressSet],
    [
      "Daily capacity available",
      data.sendReadiness.dailyCapRemaining !== null && data.sendReadiness.dailyCapRemaining > 0,
    ],
  ] as const;
  const readyForLiveSend =
    data.readyForLiveSend &&
    workspaceLiveState({ sendReadiness: data.sendReadiness }) === true;

  return (
    <>
      <SectionHeader
        title="Guided Setup"
        description="Complete each persisted step. There is no manual completion switch."
      />

      <SettingsCard className={cn("p-5 border-l-4", data.complete ? "border-l-signal-positive" : "border-l-ember-400")}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-ink-900">
              {data.complete ? "Customer setup complete" : "Setup still required"}
            </p>
            <p className="text-sm text-ink-500 mt-1">
              {readyForLiveSend
                ? "The backend confirms every setup and live-send gate."
                : data.complete
                  ? "Customer setup is complete, but server policy or send capacity still keeps live delivery off."
                  : `Next required step: ${data.currentStep.replace(/_/g, " ")}.`}
            </p>
          </div>
          <Badge
            data-testid="setup-status"
            className={cn(
              "border",
              readyForLiveSend
                ? "bg-signal-positive/10 text-signal-positive border-signal-positive/30"
                : "bg-paper-100 text-ink-600 border-paper-300",
            )}
          >
            {readyForLiveSend ? "Ready for live send" : "Live send off"}
          </Badge>
        </div>
      </SettingsCard>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <SettingsCard key={step.key} className="p-4 flex items-start gap-4">
            <div
              className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold",
                step.complete
                  ? "bg-signal-positive/10 text-signal-positive"
                  : "bg-paper-100 text-ink-500",
              )}
            >
              {step.complete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-ink-900">{step.title}</p>
              <p className="text-sm text-ink-500 mt-0.5">{step.description}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate(step.href)}>
              {step.action}
              <ArrowUpRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </SettingsCard>
        ))}
      </div>

      <SettingsCard className="p-5 space-y-3">
        <div>
          <p className="font-medium text-ink-900">Backend send readiness</p>
          <p className="text-xs text-ink-500 mt-0.5">Read-only; approval never overrides these gates.</p>
        </div>
        {readinessRows.map(([label, ok]) => (
          <div key={label} className="flex items-center gap-2 text-sm">
            {ok
              ? <CheckCircle2 className="h-4 w-4 text-signal-positive" />
              : <X className="h-4 w-4 text-ember-500" />}
            <span className="text-ink-700">{label}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-paper-100 pt-3 text-sm">
          <span className="text-ink-600">Daily send capacity remaining</span>
          <span className="font-mono text-ink-900">
            {data.sendReadiness.dailyCapRemaining ?? "not reported"}
          </span>
        </div>
      </SettingsCard>
    </>
  );
}

// ─── Org Tab ──────────────────────────────────────────────────────────────────
function OrgTab() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useGetOrgSettings({ query: { queryKey: ["getOrgSettings"] } });
  const { mutate: update, isPending } = useUpdateOrgSettings({
    mutation: {
      onSuccess: (updated) => {
        void refreshSetupQueries(queryClient, updated);
        toast.success("Settings saved");
      },
      onError: (err) => toast.error(saveErrorMessage(err)),
    },
  });

  const [form, setForm] = useState({
    name: "", website: "",
  });
  const initialized = useRef(false);
  useEffect(() => {
    if (data && !initialized.current) {
      setForm({
        name: data.orgName,
        website: data.website ?? "",
      });
      initialized.current = true;
    }
  }, [data]);
  const orgManagementCapability = data?.canManageOrg ?? null;
  const orgReadOnly = orgManagementCapability !== true;

  return (
    <TabBoundary isLoading={isLoading} isError={isError} onRetry={() => refetch()} skeleton={<FormSkeleton rows={6} />}>
      <SectionHeader title="Organization" description="Persisted workspace identity and sender compliance settings." />
      {orgReadOnly && (
        <div
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-xs text-ink-600"
          data-testid="org-management-read-only"
          role="status"
        >
          {orgManagementCapability === false
            ? "Organization and compliance settings are read-only. Editing requires an owner or administrator."
            : "Organization management permissions could not be verified. Editing is disabled."}
        </div>
      )}
      <SettingsCard className="p-5 space-y-4">
        <TwoCol>
          <Field label="Organization Name">
            <Input disabled={orgReadOnly} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Company Website (HTTPS)">
            <Input disabled={orgReadOnly} value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://example.com" />
          </Field>
        </TwoCol>
      </SettingsCard>

      {data && <ComplianceCard settings={data} />}

      {data && <LiveStatusCard settings={data} />}

      <div className="flex justify-end">
        <Button
          className="bg-rust-500 hover:bg-rust-600 text-white"
          disabled={orgReadOnly || isPending}
          onClick={() => {
            if (orgManagementCapability === true) {
              update({ data: { name: form.name, website: form.website } });
            }
          }}
        >
          {isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </TabBoundary>
  );
}

// ─── Live Status (read-only, GL5) ────────────────────────────────────────────
/**
 * Replaces the old "Live Send Enabled" toggle, which was a decoy: the BFF
 * silently dropped the flag while the UI toasted success. Live sending is
 * controlled server-side; this panel only REPORTS the backend's
 * `sendReadiness` (runtime-guarded — see lib/sendReadiness.ts). When the
 * backend doesn't report readiness we say "unknown" and treat the workspace
 * as dry-run; we never fabricate a verdict.
 */
function LiveStatusCard({ settings }: { settings: OrgSettings }) {
  const readiness = getSendReadiness(settings);
  const live = workspaceLiveState(settings) === true;

  const rows: { label: string; ok: boolean | null }[] = [
    { label: "Workspace allowlisted", ok: readiness ? readiness.liveSendAllowed : null },
    { label: "Mailbox connected", ok: readiness ? readiness.mailboxConnected : null },
    { label: "Sender name set", ok: readiness ? readiness.senderNameSet : null },
    { label: "Country set", ok: readiness ? readiness.countrySet : null },
    { label: "Physical address set", ok: readiness ? readiness.physicalAddressSet : null },
  ];

  return (
    <SettingsCard className={cn("p-5 space-y-4 border-l-4", live ? "border-l-signal-positive" : "border-l-ember-400")}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-medium text-ink-900 dark:text-paper-50">Live Status</p>
          <p className="text-sm text-ink-500 mt-0.5">
            {live
              ? "Every reported dispatch gate is open; approved emails can be sent by the worker."
              : "At least one reported dispatch gate is closed; approval does not guarantee a real send."}
          </p>
        </div>
        <Badge
          data-testid="live-status-overall"
          className={cn(
            "text-[11px] border shrink-0",
            live
              ? "bg-signal-positive/10 text-signal-positive border-signal-positive"
              : "bg-paper-100 text-ink-600 border-paper-300",
          )}
        >
          {live ? "Ready for live send" : readiness ? "Live send blocked" : "Readiness unknown"}
        </Badge>
      </div>

      {!readiness && (
        <p className="text-xs text-ink-500 bg-paper-100 border border-paper-200 rounded-md px-3 py-2">
          The backend did not report send readiness, so live status is unknown — this workspace is
          treated as dry-run until the backend confirms otherwise.
        </p>
      )}

      <div className="space-y-2">
        {rows.map(({ label, ok }) => (
          <div key={label} className="flex items-center gap-2.5 text-sm">
            {ok === true ? (
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            ) : ok === false ? (
              <X className="h-4 w-4 text-ember-500 shrink-0" />
            ) : (
              <span className="h-4 w-4 text-center text-ink-300 leading-4 shrink-0">–</span>
            )}
            <span className={cn(ok === null ? "text-ink-400" : "text-ink-700 dark:text-paper-200")}>
              {label}
              {ok === null && <span className="text-ink-300"> (unknown)</span>}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between text-sm pt-1 border-t border-paper-100">
          <span className="text-ink-600">Daily send cap remaining</span>
          <span className="font-mono text-ink-900 dark:text-paper-50">
            {readiness?.dailyCapRemaining != null ? readiness.dailyCapRemaining : "not reported"}
          </span>
        </div>
      </div>
    </SettingsCard>
  );
}

// ─── Compliance Card (CAN-SPAM sender identity) ──────────────────────────────
/**
 * Sender-identity fields the backend actually persists (Org.senderName /
 * Org.physicalAddress / Org.country via the BFF → PATCH /api/orgs/:id). Saved
 * independently from the general card so a compliance fix is one focused
 * action, with the upstream validation error (e.g. non-ISO-2 country) surfaced
 * verbatim instead of a generic "Save failed".
 */
function ComplianceCard({ settings }: { settings: OrgSettings }) {
  const queryClient = useQueryClient();
  const orgReadOnly = settings.canManageOrg !== true;
  const { mutate: save, isPending } = useUpdateOrgSettings({
    mutation: {
      onSuccess: (updated) => {
        void refreshSetupQueries(queryClient, updated);
        toast.success("Compliance settings saved");
      },
      onError: (err) => toast.error(saveErrorMessage(err)),
    },
  });
  const [form, setForm] = useState({
    senderName: settings.senderName ?? "",
    physicalAddress: settings.postalAddress ?? "",
    country: settings.country,
  });
  const normalizedSenderName = form.senderName.trim();
  const normalizedAddress = form.physicalAddress.trim();
  const normalizedCountry = form.country.trim().toUpperCase();
  const complianceError = normalizedSenderName.length === 0
    ? "Enter the sender name recipients should see."
    : !/^[A-Z]{2}$/u.test(normalizedCountry)
      ? "Use a two-letter country code such as US or IN."
      : normalizedAddress.length < 5
        ? "Enter the full physical address (at least 5 characters)."
        : null;

  return (
    <SettingsCard className="p-5 space-y-4">
      <div className="flex items-start gap-2.5">
        <Shield className="h-4 w-4 text-rust-500 mt-1 shrink-0" />
        <div>
          <p className="font-medium text-ink-900 dark:text-paper-50">Compliance</p>
          <p className="text-sm text-ink-500 mt-0.5">Required by CAN-SPAM before live sending.</p>
        </div>
      </div>
      <TwoCol>
        <Field label="Sender Name (visible to recipients)">
          <Input disabled={orgReadOnly} value={form.senderName} onChange={e => setForm(f => ({ ...f, senderName: e.target.value }))} />
        </Field>
        <Field label="Country (ISO-2)">
          <Input disabled={orgReadOnly} value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="US" className="font-mono uppercase" maxLength={2} autoCapitalize="characters" aria-invalid={!/^[A-Z]{2}$/u.test(normalizedCountry)} />
        </Field>
      </TwoCol>
      <Field label="Physical Address">
        <Textarea disabled={orgReadOnly} value={form.physicalAddress} onChange={e => setForm(f => ({ ...f, physicalAddress: e.target.value }))} rows={2} className="resize-none" placeholder="Street, city, state, ZIP — appears in every email footer" />
      </Field>
      <div className="flex justify-end">
        {complianceError && !orgReadOnly && <p className="mr-auto self-center text-xs text-ember-700" role="status">{complianceError}</p>}
        <Button
          className="bg-rust-500 hover:bg-rust-600 text-white"
          disabled={orgReadOnly || isPending || complianceError !== null}
          onClick={() => {
            if (!orgReadOnly) {
              save({ data: { senderName: normalizedSenderName, postalAddress: normalizedAddress, country: normalizedCountry } });
            }
          }}
        >
          {isPending ? "Saving…" : "Save Compliance"}
        </Button>
      </div>
    </SettingsCard>
  );
}

// ─── ICP Tab ──────────────────────────────────────────────────────────────────
function IcpTab() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useGetIcpProfile({ query: { queryKey: ["getIcpProfile"] } });
  const { mutate: update, isPending } = useUpdateIcpProfile({
    mutation: {
      onSuccess: () => {
        void refreshSetupQueries(queryClient);
        toast.success("Current ICP saved");
      },
      // Surface the upstream validation message verbatim.
      onError: (err) => toast.error(saveErrorMessage(err)),
    },
  });
  const [profile, setProfile] = useState({ industries: [] as string[], titles: [] as string[], geos: [] as string[], sizeBand: "", techStackSignals: [] as string[], intentSignals: [] as string[], seedDomains: [] as string[], exclusionDomains: [] as string[] });
  const initialized = useRef(false);

  useEffect(() => {
    if (data && !initialized.current) { setProfile({ ...data }); initialized.current = true; }
  }, [data]);

  return (
    <TabBoundary isLoading={isLoading} isError={isError} onRetry={() => refetch()} skeleton={<FormSkeleton rows={5} />}>
      <SectionHeader title="Ideal Customer Profile" description="Define which leads the SDR agent should source and target." />
      <SettingsCard className="p-5 space-y-5">
        <ChipField label="Industries" chips={profile.industries} onChange={v => setProfile(p => ({ ...p, industries: v }))} placeholder="e.g. SaaS, Fintech" />
        <ChipField label="Target Titles" chips={profile.titles} onChange={v => setProfile(p => ({ ...p, titles: v }))} placeholder="e.g. Head of Growth" />
        <ChipField label="Target Geographies" chips={profile.geos} onChange={v => setProfile(p => ({ ...p, geos: v }))} placeholder="e.g. India, USA, UAE" />
        <Field label="Company Size Band">
          <Input value={profile.sizeBand} onChange={e => setProfile(p => ({ ...p, sizeBand: e.target.value }))} placeholder="e.g. 50-500" />
        </Field>
        <ChipField label="Technology Signals" chips={profile.techStackSignals} onChange={v => setProfile(p => ({ ...p, techStackSignals: v }))} placeholder="e.g. Salesforce, HubSpot" />
        <ChipField label="Intent Signals" chips={profile.intentSignals} onChange={v => setProfile(p => ({ ...p, intentSignals: v }))} placeholder="e.g. hiring engineers" />
        <Separator />
        <ChipField label="Seed Domains" chips={profile.seedDomains} onChange={v => setProfile(p => ({ ...p, seedDomains: v }))} placeholder="e.g. acme.com" />
      </SettingsCard>
      <div className="flex justify-end">
        <Button className="bg-rust-500 hover:bg-rust-600 text-white" disabled={isPending} onClick={() => update({ data: profile })}>
          {isPending ? "Saving…" : "Save ICP"}
        </Button>
      </div>
    </TabBoundary>
  );
}

// ─── Integrations Tab ─────────────────────────────────────────────────────────
const PROVIDER_META: Record<string, { name: string; description: string }> = {
  gmail:       { name: "Gmail", description: "Send outreach and receive replies via Google Workspace." },
  outlook:     { name: "Outlook", description: "Microsoft 365 email sending and inbox sync." },
  linkedin:    { name: "LinkedIn", description: "Connect for profile enrichment and InMail sequences." },
  hubspot:     { name: "HubSpot", description: "Sync leads, contacts, and deal stages bidirectionally." },
  salesforce:  { name: "Salesforce", description: "Push qualified leads and activities to your CRM." },
  slack:       { name: "Slack", description: "Get approval alerts and notifications in Slack." },
  clay:        { name: "Clay", description: "Pull enriched lead data from Clay tables." },
  apollo:      { name: "Apollo", description: "Source leads from Apollo.io company and contact database." },
  hunter:      { name: "Hunter.io", description: "Verify email addresses before sending." },
  fullenrich:  { name: "Fullenrich", description: "Waterfall email enrichment for harder-to-find contacts." },
  webhooks:    { name: "Webhooks", description: "Send events to any external endpoint via HTTP POST." },
};

/** How often to refetch integration status while a Gmail OAuth tab is open. */
const GMAIL_POLL_INTERVAL_MS = 3_000;
/** Stop polling after this long without a CONNECTED/ERROR resolution. */
const GMAIL_POLL_TIMEOUT_MS = 180_000;

/** Extract only the callback shape issued by the backend. */
export function gmailOAuthAttemptFromLocation(location: string): string | null {
  const queryStart = location.indexOf("?");
  if (queryStart < 0) return null;
  const params = new URLSearchParams(location.slice(queryStart + 1));
  if (params.get("provider") !== "gmail") return null;
  const attemptId = params.get("oauth_attempt");
  return attemptId && attemptId.trim() !== "" ? attemptId.trim() : null;
}

/** Extract the bounded public callback error contract issued by the backend. */
export function gmailOAuthErrorFromLocation(location: string): string | null {
  const queryStart = location.indexOf("?");
  if (queryStart < 0) return null;
  const params = new URLSearchParams(location.slice(queryStart + 1));
  if (params.get("provider") !== "gmail") return null;
  const error = params.get("error");
  return error === "gmail_denied" || error === "gmail_oauth" ? error : null;
}

export function refreshSetupQueries(
  queryClient: QueryClient,
  orgSettings?: OrgSettings,
) {
  if (orgSettings) {
    queryClient.setQueryData(["getOrgSettings"], orgSettings);
  }
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["getWelcomeStatus"],
      exact: true,
      refetchType: "all",
    }),
    queryClient.invalidateQueries({
      queryKey: ["getOrgSettings"],
      exact: true,
      refetchType: "all",
    }),
  ]);
}

function IntegrationsTab() {
  // Gmail consent happens in a new tab. The backend callback redirects that
  // tab here with a one-time attempt ID; this signed-in page finalizes it while
  // the opener polls integration status. The card reflects CONNECTED/errored
  // only when the server says so.
  const [gmailWaiting, setGmailWaiting] = useState(false);
  const [gmailLaunching, setGmailLaunching] = useState(false);
  const [gmailWatchExpiresAt, setGmailWatchExpiresAt] = useState<string | null>(null);
  const gmailDeadline = useRef<number | null>(null);
  const gmailReadinessRefreshRequested = useRef(false);
  const finalizedAttempt = useRef<string | null>(null);
  const handledCallbackError = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();
  // Wouter's browser location hook returns pathname only. Reattach the real
  // query string so the provider callback's one-time attempt is not dropped.
  // Tests may supply a query-bearing mocked location, so preserve that form.
  const callbackLocation = location.includes("?")
    ? location
    : `${location}${typeof window === "undefined" ? "" : window.location.search}`;
  const oauthAttemptId = gmailOAuthAttemptFromLocation(callbackLocation);
  const oauthCallbackError = gmailOAuthErrorFromLocation(callbackLocation);

  const { data, isLoading, isError, refetch } = useListIntegrations({
    query: {
      queryKey: ["listIntegrations"],
      refetchInterval: gmailWaiting ? GMAIL_POLL_INTERVAL_MS : false,
    },
  });
  // Only an explicit granular allow enables OAuth or disconnect controls;
  // denial and unavailable capability state remain read-only.
  const { data: orgSettings } = useGetOrgSettings({
    query: { queryKey: ["getOrgSettings"] },
  });
  const mailboxManagementCapability = orgSettings?.canManageMailbox ?? null;
  const mailboxReadiness = getSendReadiness(orgSettings)?.mailboxConnected ?? null;
  const { mutate: disconnect, isPending: disconnecting } = useDisconnectGmailIntegration({
    mutation: {
      onSuccess: () => {
        setGmailWatchExpiresAt(null);
        toast.success("Disconnected");
        void refreshSetupQueries(queryClient);
        refetch();
      },
      onError: () => toast.error("Disconnect failed"),
    },
  });
  const { mutate: verifyGmail, isPending: verifyingGmail } = useVerifyGmailMailbox({
    mutation: {
      onSuccess: (verification) => {
        setGmailWatchExpiresAt(verification.watchExpiresAt);
        toast.success("Gmail connection and reply watch verified.");
      },
      onError: (err) => toast.error(saveErrorMessage(err)),
    },
  });
  const { mutate: finalizeGmail, isPending: finalizingGmail } =
    useFinalizeGmailIntegration({
      mutation: {
        onSuccess: (integration) => {
          queryClient.setQueryData<
            Awaited<ReturnType<typeof refetch>>["data"]
          >(["listIntegrations"], (current) => {
            if (!current) return current;
            return current.map((item) =>
              item.provider === "gmail" ? integration : item,
            );
          });
          void refreshSetupQueries(queryClient);
          void refetch();
          toast.success("Gmail connected.");
        },
        onError: async (err) => {
          const [, refreshedIntegrations] = await Promise.allSettled([
            refreshSetupQueries(queryClient),
            refetch(),
          ]);
          const connectedAfterRefresh =
            refreshedIntegrations.status === "fulfilled" &&
            refreshedIntegrations.value.data?.some(
              (item) => item.provider === "gmail" && item.status === "connected",
            );
          if (connectedAfterRefresh) {
            toast.success("Gmail connected.");
          } else {
            toast.error(saveErrorMessage(err));
          }
        },
      },
    });

  const visibleIntegrations = (data ?? []).filter((integration) => integration.provider === "gmail");
  const gmailRow = visibleIntegrations.find(i => i.provider === "gmail");
  useEffect(() => {
    if (!oauthAttemptId || finalizedAttempt.current === oauthAttemptId) return;
    finalizedAttempt.current = oauthAttemptId;
    // Remove the one-time opaque ID from browser history before network work.
    navigate("/settings/integrations", { replace: true });
    finalizeGmail({ data: { attemptId: oauthAttemptId } });
  }, [finalizeGmail, navigate, oauthAttemptId]);

  useEffect(() => {
    if (
      !oauthCallbackError ||
      handledCallbackError.current === oauthCallbackError
    ) {
      return;
    }
    handledCallbackError.current = oauthCallbackError;
    navigate("/settings/integrations", { replace: true });
    void Promise.allSettled([
      refreshSetupQueries(queryClient),
      refetch(),
    ]).then(() => {
      toast.error(
        oauthCallbackError === "gmail_denied"
          ? "Google authorization was canceled. Gmail was not changed."
          : "Google authorization could not be completed. Try connecting again.",
      );
    });
  }, [navigate, oauthCallbackError, queryClient, refetch]);

  useEffect(() => {
    if (!gmailWaiting) return;
    if (gmailRow?.status === "connected" && mailboxReadiness === true) {
      setGmailWaiting(false);
      void refreshSetupQueries(queryClient);
      toast.success("Gmail connected.");
    } else if (
      gmailRow?.status === "connected" &&
      !gmailReadinessRefreshRequested.current
    ) {
      // A provider row alone is insufficient: refresh the backend's stronger
      // mailbox-readiness verdict before reporting connection success.
      gmailReadinessRefreshRequested.current = true;
      void refreshSetupQueries(queryClient);
    } else if (gmailRow?.status === "errored") {
      setGmailWaiting(false);
      toast.error(gmailRow.errorMessage ?? "Gmail connection failed.");
    } else if (gmailDeadline.current !== null && Date.now() > gmailDeadline.current) {
      setGmailWaiting(false);
      toast("Gmail still isn't connected — finish the Google consent screen, then check back here.");
    }
  }, [gmailWaiting, gmailRow, mailboxReadiness, queryClient]);

  const handleConnectGmail = async () => {
    // Open synchronously inside the click gesture so browser popup blockers do
    // not race the authenticated auth-url request. Navigating an about:blank
    // handle after severing `opener` preserves reverse-tabnabbing protection
    // without relying on `noopener`, whose specified return value is null.
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      toast.error("Your browser blocked the Google sign-in window — allow popups and try again.");
      return;
    }
    popup.opener = null;
    gmailReadinessRefreshRequested.current = false;
    setGmailLaunching(true);
    try {
      const url = await fetchGmailAuthUrl();
      popup.location.replace(url);
      gmailDeadline.current = Date.now() + GMAIL_POLL_TIMEOUT_MS;
      setGmailWaiting(true);
    } catch (err) {
      popup.close();
      // Surface the BFF/upstream failure verbatim — never a fake success.
      toast.error(saveErrorMessage(err));
    } finally {
      setGmailLaunching(false);
    }
  };

  if (isLoading) return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>;
  if (isError) return <ErrorState description="We couldn't load your integrations just now. Please try again." onRetry={() => refetch()} />;
  if (visibleIntegrations.length === 0) return <EmptyState icon={Plug} title="Gmail unavailable" description="This release supports Gmail only, and the backend did not expose the Gmail connector." />;

  return (
    <>
      <SectionHeader title="Mailbox" description="Connect Gmail for reviewed outreach and monitored replies." />
      {finalizingGmail && (
        <div
          className="mb-3 rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-xs text-ink-600"
          role="status"
          data-testid="gmail-oauth-finalizing"
        >
          Finishing the Google authorization with your signed-in workspace…
        </div>
      )}
      {mailboxManagementCapability !== true && (
        <div
          className="mb-3 rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-xs text-ink-600"
          data-testid="mailbox-management-read-only"
          role="status"
        >
          {mailboxManagementCapability === false
            ? "Mailbox status is read-only. Connecting or disconnecting Gmail requires an administrator or manager."
            : "Mailbox management permissions could not be verified. Connecting and disconnecting are disabled."}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visibleIntegrations.map(int => {
          const meta = PROVIDER_META[int.provider] ?? { name: int.provider, description: "" };
          const isGmail = int.provider === "gmail";
          const hasConnectedRow = int.status === "connected";
          const isConnected = hasConnectedRow && (!isGmail || mailboxReadiness === true);
          const displayedStatus = isConnected
            ? "connected"
            : hasConnectedRow
              ? mailboxReadiness === false
                ? "needs attention"
                : "unverified"
              : int.status;
          const gmailBusy = isGmail && (gmailLaunching || gmailWaiting || finalizingGmail);
          return (
            <SettingsCard key={int.id} className="p-4 flex gap-3 hover-elevate">
              <IntegrationLogo provider={int.provider} size={28} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-ink-900 dark:text-paper-50">{meta.name}</span>
                  <Badge
                    data-testid={isGmail ? "gmail-integration-status" : undefined}
                    className={cn("text-[10px] h-4 px-1.5 border", isConnected ? "bg-green-50 text-green-700 border-green-200" : int.status === "errored" ? "bg-red-50 text-red-600 border-red-200" : hasConnectedRow ? "bg-ember-400/10 text-ember-700 border-ember-400/30" : "bg-paper-100 text-ink-500 border-paper-200")}
                  >
                    {displayedStatus}
                  </Badge>
                </div>
                <p className="text-xs text-ink-500 leading-relaxed mb-2">{meta.description}</p>
                {int.accountEmail && <p className="text-xs font-mono text-ink-400 mb-2 truncate">{int.accountEmail}</p>}
                {int.errorMessage && <p className="text-xs text-red-500 mb-2">{int.errorMessage}</p>}
                {isGmail && hasConnectedRow && mailboxReadiness !== true && (
                  <p className="text-xs text-ember-700 mb-2" role="status">
                    {mailboxReadiness === false
                      ? "Google authorization exists, but the backend reports that this mailbox is not operational. Disconnect and reconnect Gmail before sending."
                      : "Google authorization exists, but mailbox readiness could not be verified. Sending remains unavailable."}
                  </p>
                )}
                {isGmail && gmailWaiting && !isConnected && (
                  <p className="text-xs text-ink-500 mb-2">
                    Waiting for Google authorization — complete the consent screen in the other tab.
                    This card updates when the mailbox is actually connected.
                  </p>
                )}
                {isGmail && gmailWatchExpiresAt && (
                  <p className="text-xs text-green-700 mb-2" role="status">
                    Google confirmed an active reply watch through {new Date(gmailWatchExpiresAt).toLocaleString()}.
                  </p>
                )}
                {mailboxManagementCapability === true && (
                  <div className="flex flex-wrap gap-2">
                    {isGmail && hasConnectedRow && (
                      <Button size="sm" className="h-7 bg-rust-500 text-xs text-white hover:bg-rust-600" disabled={disconnecting || gmailBusy || verifyingGmail} onClick={() => verifyGmail()}>
                        {verifyingGmail ? "Verifying…" : "Verify reply sync"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={hasConnectedRow ? "outline" : "default"}
                      className={cn("h-7 text-xs", hasConnectedRow ? "border-paper-300 text-ink-600" : "bg-rust-500 hover:bg-rust-600 text-white")}
                      disabled={disconnecting || gmailBusy || verifyingGmail}
                      onClick={() =>
                        hasConnectedRow
                          ? disconnect()
                          : handleConnectGmail()
                      }
                    >
                      {hasConnectedRow
                        ? "Disconnect"
                        : isGmail
                          ? (gmailWaiting ? "Waiting for Google…" : gmailLaunching ? "Opening Google…" : "Connect with Google")
                          : "Connect"}
                    </Button>
                  </div>
                )}
              </div>
            </SettingsCard>
          );
        })}
      </div>
    </>
  );
}

// ─── Suppressions Tab ────────────────────────────────────────────────────────
const SUPPRESSION_REASON_LABELS: Record<string, string> = {
  USER_UNSUBSCRIBED: "Unsubscribed",
  BOUNCED: "Bounced",
  COMPLAINED: "Complaint",
  MANUAL: "Manual suppression",
};

function SuppressionsTab() {
  const queryClient = useQueryClient();
  const [recipientRef, setRecipientRef] = useState("");
  const [reason, setReason] = useState<CreateSuppressionInputReason>("MANUAL");
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const cursor = cursorStack[cursorStack.length - 1];

  const orgQuery = useGetOrgSettings({
    query: { queryKey: ["getOrgSettings", "suppression-capability"] },
  });
  const canManage = orgQuery.data?.canManageSuppressions;
  const suppressionParams = { limit: 50, ...(cursor ? { cursor } : {}) };
  const listQuery = useListSuppressions(suppressionParams, {
    query: {
      queryKey: getListSuppressionsQueryKey(suppressionParams),
      enabled: canManage === true,
      refetchInterval: 30_000,
    },
  });

  const createMutation = useCreateSuppression({
    mutation: {
      onSuccess: async (result) => {
        toast.success(
          result.created
            ? "Recipient added to the suppression registry"
            : "Recipient was already protected",
        );
        setRecipientRef("");
        setCursorStack([undefined]);
        await queryClient.invalidateQueries({
          queryKey: ["/api/settings/suppressions"],
        });
      },
      onError: (error) => toast.error(saveErrorMessage(error)),
    },
  });

  if (orgQuery.isLoading) return <FormSkeleton rows={3} />;
  if (orgQuery.isError || !orgQuery.data) {
    return (
      <ErrorState
        title="Couldn't verify suppression access"
        description="The registry stays hidden until your workspace role can be verified."
        onRetry={() => orgQuery.refetch()}
      />
    );
  }
  if (canManage !== true) {
    return (
      <SettingsCard className="p-6">
        <div className="flex gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-ink-500" />
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink-900">
              Suppression registry restricted
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              {canManage === false
                ? "Only a workspace owner or administrator can view recipient opt-outs and complaints."
                : "Your suppression-management permission could not be verified, so the registry remains hidden."}
            </p>
          </div>
        </div>
      </SettingsCard>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = recipientRef.trim();
    if (!normalized) return;
    createMutation.mutate({ data: { recipientRef: normalized, reason } });
  };

  return (
    <>
      <SectionHeader
        title="Suppression registry"
        description="Authoritative recipient stops enforced before every outbound provider attempt."
      />

      <SettingsCard className="p-5">
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <h3 className="text-sm font-semibold text-ink-900">
              Record an out-of-band stop
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Use this only when a recipient opted out or complained through a
              channel that Workforce OS could not ingest automatically.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end">
            <Field label="Recipient email">
              <Input
                type="email"
                autoComplete="off"
                value={recipientRef}
                onChange={(event) => setRecipientRef(event.target.value)}
                placeholder="recipient@example.com"
                maxLength={512}
              />
            </Field>
            <Field label="Observed stop reason">
              <select
                value={reason}
                onChange={(event) =>
                  setReason(event.target.value as CreateSuppressionInputReason)
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="MANUAL">Manual opt-out</option>
                <option value="COMPLAINED">Complaint received elsewhere</option>
              </select>
            </Field>
            <Button
              type="submit"
              disabled={!recipientRef.trim() || createMutation.isPending}
              className="bg-rust-500 text-white hover:bg-rust-600"
            >
              {createMutation.isPending ? "Recording…" : "Record stop"}
            </Button>
          </div>
          {reason === "COMPLAINED" ? (
            <p className="rounded-md border border-ember-300 bg-ember-50 px-3 py-2 text-xs text-ember-700">
              This records an operator-observed complaint. It does not claim
              that Gmail supplied a complaint event.
            </p>
          ) : null}
        </form>
      </SettingsCard>

      <SettingsCard className="overflow-hidden">
        <div className="border-b border-paper-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-ink-900">
            Protected recipients
          </h3>
          <p className="mt-0.5 text-xs text-ink-500">
            No total is estimated; pages show only rows confirmed by the
            backend.
          </p>
        </div>
        {listQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : listQuery.isError || !listQuery.data ? (
          <ErrorState
            title="Couldn't load protected recipients"
            description="The registry could not be verified. No recipient state has been inferred."
            onRetry={() => listQuery.refetch()}
          />
        ) : listQuery.data.rows.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="No suppression rows on this page"
            description="Recorded opt-outs, bounces, and complaints will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-paper-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Recipient</th>
                  <th className="px-5 py-3 font-semibold">Reason</th>
                  <th className="px-5 py-3 font-semibold">Source</th>
                  <th className="px-5 py-3 font-semibold">Recorded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-100">
                {listQuery.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 font-mono text-xs text-ink-800">
                      {row.recipientRef}
                    </td>
                    <td className="px-5 py-3 text-ink-700">
                      {SUPPRESSION_REASON_LABELS[row.reason] ?? row.reason}
                    </td>
                    <td className="px-5 py-3 text-ink-500">
                      {row.source ?? "Not recorded"}
                    </td>
                    <td className="px-5 py-3 text-xs text-ink-500">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!listQuery.isLoading && !listQuery.isError && listQuery.data ? (
          <div className="flex items-center justify-between border-t border-paper-200 px-5 py-3">
            <span className="text-xs text-ink-500">
              Page {cursorStack.length}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={cursorStack.length === 1 || listQuery.isFetching}
                onClick={() =>
                  setCursorStack((current) => current.slice(0, -1))
                }
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!listQuery.data.nextCursor || listQuery.isFetching}
                onClick={() => {
                  if (listQuery.data?.nextCursor) {
                    setCursorStack((current) => [
                      ...current,
                      listQuery.data!.nextCursor!,
                    ]);
                  }
                }}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </SettingsCard>
    </>
  );
}

// ─── Tab panel (per-tab crossfade) ─────────────────────────────────────────────
/**
 * Renders the active tab inside an AnimatePresence keyed on `tabId`, so switching
 * tabs crossfades only the content column while the persistent rail + health bar stay
 * fixed. The router-level PageTransition keys on the full `/settings/<tab>` location,
 * which would otherwise crossfade the whole shell on every tab click; keeping the shell
 * markup identical across tabs makes that outer crossfade a no-op and lets this inner
 * AnimatePresence own the motion at the correct granularity.
 */
function TabPanel({ tabId }: { tabId: TabId }) {
  const reduced = useReducedMotionSafe();
  const body = (
    <div className="max-w-3xl mx-auto space-y-6">
      {tabId === "setup"         && <SetupTab />}
      {tabId === "org"           && <OrgTab />}
      {tabId === "icp"           && <IcpTab />}
      {tabId === "integrations"  && <IntegrationsTab />}
      {tabId === "suppressions"  && <SuppressionsTab />}
    </div>
  );

  if (reduced) return body;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tabId}
        variants={fadeSlideUp}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {body}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
/**
 * Honest save-error copy: surface the BFF/upstream validation message (the
 * ApiError body's `message`, e.g. "country must be ISO-2") when one exists,
 * falling back to the error's own message, then a generic line. Never claims
 * success and never hides the real reason behind "Save failed".
 */
function saveErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim() !== "") return message;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "Save failed — your changes were not stored.";
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="font-serif text-xl font-semibold text-ink-900">{title}</h2>
      <p className="text-sm text-ink-500 mt-0.5">{description}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-ink-700 dark:text-ink-300">{label}</Label>
      {children}
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

/**
 * Shared settings surface: warm depth (shadow-sm → shadow-md on hover) on a
 * dark-mode-safe bg-ink-0 panel. Replaces the flat `bg-white border border-paper-200
 * rounded-lg` boxes repeated across all nine tabs so the depth language is applied once.
 */
function SettingsCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "bg-ink-0 border border-paper-200 rounded-lg shadow-sm hover:shadow-md transition-shadow",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Shared loading/error gate for a settings tab. Renders the skeleton while loading, an
 * <ErrorState> with retry on query failure, and the tab body otherwise. Centralizes the
 * error handling that every tab previously omitted (no tab read `isError`).
 */
function TabBoundary({
  isLoading,
  isError,
  onRetry,
  skeleton,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}) {
  if (isLoading) return <>{skeleton}</>;
  if (isError)
    return (
      <ErrorState
        description="We couldn't load these settings just now. Please try again."
        onRetry={onRetry}
      />
    );
  return <>{children}</>;
}

function FormSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-6">
      <div><Skeleton className="h-7 w-40 mb-1" /><Skeleton className="h-4 w-64" /></div>
      <div className="bg-white border border-paper-200 rounded-lg p-5 space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChipField({ label, chips, onChange, placeholder }: { label: string; chips: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");

  const add = () => {
    const val = input.trim();
    if (val && !chips.includes(val)) { onChange([...chips, val]); }
    setInput("");
  };

  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5 p-2 border border-paper-200 rounded-lg min-h-[40px] bg-paper-50">
        {chips.map(c => (
          <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-paper-300 rounded text-xs text-ink-800">
            {c}
            <button aria-label={`Remove ${c}`} onClick={() => onChange(chips.filter(x => x !== c))} className="text-ink-300 hover:text-red-400 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          className="flex-1 min-w-[120px] text-xs bg-transparent outline-none placeholder:text-ink-300 text-ink-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
          placeholder={placeholder}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        />
      </div>
      <p className="text-[10px] text-ink-400 mt-1">Press Enter or comma to add</p>
    </Field>
  );
}
