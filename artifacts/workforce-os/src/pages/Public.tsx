import React, { useEffect, type ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";

export type PublicSurface = "home" | "privacy" | "terms" | "sign-in";

export function publicSurfaceForLocation(
  location: string,
): PublicSurface | null {
  const pathname = location.split(/[?#]/u, 1)[0]?.replace(/\/+$/u, "") || "/";
  if (pathname === "/") return "home";
  if (pathname === "/privacy") return "privacy";
  if (pathname === "/terms") return "terms";
  if (pathname === "/sign-in") return "sign-in";
  return null;
}

function PublicDocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}

function PublicShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-paper-50 text-ink-900">
      <PublicDocumentTitle title={title} />
      <header className="border-b border-ink-900/10 bg-paper-50/95">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <a
            href="/"
            className="flex items-center gap-3"
            aria-label="Workforce OS home"
          >
            <Logo size={32} />
            <span className="font-serif text-xl font-semibold tracking-tight">
              Workforce OS
            </span>
          </a>
          <nav
            className="flex items-center gap-4 text-sm font-medium"
            aria-label="Public navigation"
          >
            <a
              className="text-ink-600 transition-colors hover:text-ink-900"
              href="/privacy"
            >
              Privacy
            </a>
            <a
              className="text-ink-600 transition-colors hover:text-ink-900"
              href="/terms"
            >
              Terms
            </a>
            <a
              className="rounded-lg bg-ink-900 px-4 py-2 text-paper-50 transition-colors hover:bg-ink-800"
              href="/sign-in"
            >
              Sign in
            </a>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t border-ink-900/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>Workforce OS is operated under the Kloudedge name.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a className="hover:text-ink-900" href="/privacy">
              Privacy
            </a>
            <a className="hover:text-ink-900" href="/terms">
              Terms
            </a>
            <a className="hover:text-ink-900" href="mailto:nikhil@kloudedge.co">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PublicHome() {
  return (
    <PublicShell title="Workforce OS | Guarded AI SDR Console">
      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:py-28">
          <div className="max-w-3xl">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-rust-600">
              Guarded AI-native GTM
            </p>
            <h1 className="font-serif text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
              Research, draft, and review outbound in one accountable workspace.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-ink-600">
              Workforce OS helps GTM teams source leads, prepare evidence-backed
              drafts, route them through human review, and monitor replies. No
              message is sent until an authorized person approves it.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a
                className="inline-flex items-center gap-2 rounded-lg bg-rust-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-rust-700"
                href="/sign-in"
              >
                Open Workforce OS{" "}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                className="font-semibold text-ink-700 hover:text-ink-900"
                href="/privacy"
              >
                Read our data practices
              </a>
            </div>
          </div>

          <aside className="rounded-2xl border border-ink-900/10 bg-white p-7 shadow-sm">
            <p className="font-serif text-2xl font-semibold">
              Controls before automation
            </p>
            <ul className="mt-6 space-y-5 text-sm leading-6 text-ink-600">
              <li className="flex gap-3">
                <ShieldCheck
                  className="mt-0.5 h-5 w-5 shrink-0 text-rust-600"
                  aria-hidden="true"
                />
                Human approval is required before every external send.
              </li>
              <li className="flex gap-3">
                <LockKeyhole
                  className="mt-0.5 h-5 w-5 shrink-0 text-rust-600"
                  aria-hidden="true"
                />
                Organization boundaries, suppression rules, and sending limits
                fail closed.
              </li>
              <li className="flex gap-3">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-rust-600"
                  aria-hidden="true"
                />
                Gmail access is used only for approved sends and reply or
                delivery monitoring.
              </li>
            </ul>
          </aside>
        </section>

        <section className="border-t border-ink-900/10 bg-white">
          <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
            <h2 className="font-serif text-3xl font-semibold">
              How Gmail is used
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-ink-600">
              Drafts are created and reviewed inside Workforce OS without
              accessing Gmail drafts. If you connect Gmail, the service asks
              only for permission to send messages you approve and read the
              mailbox activity needed to detect replies or delivery failures.
              We do not use Google user data for advertising, and we do not
              sell it.
            </p>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

function PolicyPage({
  title,
  introduction,
  lastUpdated,
  children,
}: {
  title: string;
  introduction: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <PublicShell title={`${title} | Workforce OS`}>
      <main className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-rust-600">
          Last updated {lastUpdated}
        </p>
        <h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-6 text-lg leading-8 text-ink-600">{introduction}</p>
        <div className="mt-12 space-y-10 text-base leading-7 text-ink-700 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-ink-900 [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:space-y-2">
          {children}
        </div>
      </main>
    </PublicShell>
  );
}

export function PrivacyPolicy() {
  return (
    <PolicyPage
      title="Privacy Policy"
      introduction="This policy explains how Workforce OS, operated under the Kloudedge name, handles account, workspace, and connected-service data."
      lastUpdated="August 21, 2026"
    >
      <section>
        <h2>Information we handle</h2>
        <ul>
          <li>
            Account and workspace information, including identity, role, and
            organization settings.
          </li>
          <li>
            Sender identity, compliance settings, suppression records, and
            product audit events.
          </li>
          <li>
            Lead, company, research, draft, approval, campaign, and conversation
            data you provide or create.
          </li>
          <li>
            Connected-service credentials and identifiers, stored with access
            controls and encryption where applicable.
          </li>
        </ul>
      </section>

      <section>
        <h2>Google user data</h2>
        <p>
          When you connect Gmail, Workforce OS may access Gmail message and
          thread data, message metadata, send results, replies, delivery
          failures, and the mailbox identity needed to operate the integration.
          Workforce OS does not access Gmail drafts. OAuth credentials are
          stored so the service can act only within the permissions you granted.
        </p>
        <p>
          We use Google user data only to provide these user-facing features:
        </p>
        <ul>
          <li>
            Create and review drafts inside Workforce OS without accessing
            Gmail drafts.
          </li>
          <li>
            Send a message only after an authorized human approves that exact
            outbound action.
          </li>
          <li>
            Read relevant mailbox activity to show conversations, detect
            replies, stop outreach, and process delivery failures.
          </li>
          <li>Maintain the Gmail connection and reply notification watch.</li>
        </ul>
        <p>
          Workforce OS&apos;s use and transfer to any other app of information
          received from Google APIs will adhere to the Google API Services User
          Data Policy, including the Limited Use requirements.
        </p>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>
          We use information to operate, secure, support, and improve Workforce
          OS; enforce organization boundaries and sending controls; investigate
          failures; and comply with applicable legal obligations. We do not sell
          personal information or Google user data, and we do not use it for
          advertising.
        </p>
      </section>

      <section>
        <h2>Service providers and disclosure</h2>
        <p>
          We may use infrastructure, authentication, database, monitoring, and
          model providers to operate the service. They receive only the
          information needed to perform contracted services and are subject to
          appropriate confidentiality and security obligations. We may disclose
          information when required by law or to protect users, the service, or
          others.
        </p>
      </section>

      <section>
        <h2>Retention, disconnection, and deletion</h2>
        <p>
          We retain information only for as long as needed to provide the
          service, meet security and legal obligations, resolve disputes, and
          enforce agreements. Disconnecting Gmail deletes Workforce OS&apos;s
          stored OAuth credentials and mailbox synchronization state, and stops
          new Gmail access. Workforce OS retains a credential-free integration
          identifier when it is needed to preserve existing conversation
          history; that identifier cannot authorize Gmail access. Workspace
          content already created from the integration may remain until it is
          deleted or the workspace is closed, subject to required retention.
        </p>
        <p>
          To request access, correction, export, or deletion, email{" "}
          <a
            className="font-semibold text-rust-700 underline"
            href="mailto:nikhil@kloudedge.co"
          >
            nikhil@kloudedge.co
          </a>
          .
        </p>
      </section>

      <section>
        <h2>Security and changes</h2>
        <p>
          We use technical and organizational safeguards designed to protect
          information, but no system is completely secure. We may update this
          policy as the service or legal requirements change. The date above
          identifies the current version.
        </p>
      </section>
    </PolicyPage>
  );
}

export function TermsOfService() {
  return (
    <PolicyPage
      title="Terms of Service"
      introduction="These terms govern access to Workforce OS. By using the service, you agree to use it lawfully and remain accountable for every external action taken through your workspace."
      lastUpdated="August 17, 2026"
    >
      <section>
        <h2>Accounts and authority</h2>
        <p>
          You must provide accurate information, protect your account, and use
          Workforce OS only for organizations and connected services you are
          authorized to represent. Workspace administrators are responsible for
          roles, access, and connected accounts.
        </p>
      </section>

      <section>
        <h2>Human approval and outbound responsibility</h2>
        <p>
          Workforce OS prepares research and drafts, but it does not replace
          human judgment. An authorized person must review and approve an
          outbound message before it can be sent. You are responsible for the
          recipients, claims, lawful basis, sender identity, physical address,
          opt-out handling, and compliance of every approved message.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>You may not use Workforce OS to:</p>
        <ul>
          <li>
            Send unlawful, deceptive, abusive, discriminatory, or unsolicited
            communications.
          </li>
          <li>
            Ignore suppression, unsubscribe, consent, or applicable marketing
            requirements.
          </li>
          <li>
            Access mailboxes, data, systems, or recipients without
            authorization.
          </li>
          <li>
            Bypass product safeguards, quotas, approval gates, authentication,
            or tenant boundaries.
          </li>
          <li>
            Upload malware, interfere with the service, or attempt to discover
            another customer&apos;s data.
          </li>
        </ul>
      </section>

      <section>
        <h2>Connected services and generated output</h2>
        <p>
          Google, Clerk, infrastructure, data, and model services may have
          separate terms and may change or become unavailable. Generated
          research and drafts can be incomplete or wrong; you must verify them
          before use. We may suspend an integration or workspace when needed to
          protect users, providers, or the service.
        </p>
      </section>

      <section>
        <h2>Your content and service operation</h2>
        <p>
          You retain rights in content you provide. You authorize us and our
          service providers to process that content only as needed to operate,
          secure, and support Workforce OS. The service may change, and
          availability is not guaranteed unless a separate signed agreement says
          otherwise.
        </p>
      </section>

      <section>
        <h2>Disclaimers and liability</h2>
        <p>
          To the extent permitted by law, Workforce OS is provided as available
          without warranties not expressly stated in a signed agreement.
          Kloudedge is not responsible for decisions, claims, or messages you
          approve, or for failures caused by third-party services. Any liability
          is limited to the extent permitted by applicable law and any signed
          agreement.
        </p>
      </section>

      <section>
        <h2>Contact and changes</h2>
        <p>
          We may update these terms as the service changes. Continued use after
          an update means you accept the revised terms. Questions can be sent to{" "}
          <a
            className="font-semibold text-rust-700 underline"
            href="mailto:nikhil@kloudedge.co"
          >
            nikhil@kloudedge.co
          </a>
          .
        </p>
      </section>
    </PolicyPage>
  );
}
