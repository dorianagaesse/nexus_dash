import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Layers3, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy | NexusDash",
  description:
    "How NexusDash collects, uses, stores, and protects personal information, including Google user data.",
  alternates: {
    canonical: "https://nexus-dash.app/privacy",
  },
};

const sections = [
  ["information-we-collect", "Information we collect"],
  ["how-we-use-information", "How we use information"],
  ["google-user-data", "Google user data"],
  ["sharing", "How information is shared"],
  ["retention", "Retention and deletion"],
  ["security", "Security"],
  ["your-choices", "Your choices"],
  ["other-information", "Other information"],
  ["contact", "Contact"],
] as const;

const sectionClassName =
  "scroll-mt-24 border-t border-border/70 pt-8 first:border-t-0 first:pt-0";
const headingClassName =
  "text-xl font-semibold tracking-[-0.02em] text-foreground sm:text-2xl";
const bodyClassName = "mt-3 space-y-3 text-sm leading-7 text-muted-foreground sm:text-base";
const linkClassName =
  "rounded-sm font-medium text-blue-700 underline decoration-blue-700/30 underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-300";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="border-b border-border/70 bg-card/65">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className="grid size-10 place-items-center rounded-xl bg-blue-600 text-white dark:bg-blue-500"
              aria-hidden="true"
            >
              <Layers3 className="size-5" strokeWidth={2.2} />
            </span>
            <span className="grid leading-none">
              <span className="text-base font-semibold tracking-tight">NexusDash</span>
              <span className="mt-1 text-xs text-muted-foreground">Privacy policy</span>
            </span>
          </Link>

          <Link
            href="/"
            className="hidden min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:inline-flex"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to NexusDash
          </Link>
        </header>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,1fr)_240px] lg:px-10 lg:py-20">
        <article className="min-w-0 max-w-3xl">
          <div className="mb-12">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/[0.08] px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-200">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Your data, explained clearly
            </div>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Privacy Policy
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              This policy explains how NexusDash handles personal information when you
              use the project workspace, sign in with a connected provider, or connect
              Google Calendar.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Effective date: August 30, 2026
            </p>
          </div>

          <div className="space-y-10">
            <section id="information-we-collect" className={sectionClassName}>
              <h2 className={headingClassName}>Information we collect</h2>
              <div className={bodyClassName}>
                <p>We handle information you provide or create in NexusDash, including:</p>
                <ul className="list-disc space-y-2 pl-5 marker:text-blue-600 dark:marker:text-blue-300">
                  <li>
                    Account details such as your name, username, email address, profile
                    image, authentication provider, and password hash when you use
                    email-and-password authentication. We do not store your plain-text
                    password.
                  </li>
                  <li>
                    Workspace content such as projects, tasks, comments, meeting notes,
                    roadmap items, invitations, notification preferences, and files or
                    links you attach.
                  </li>
                  <li>
                    Technical and security information such as session records, request
                    IDs, timestamps, requested routes, and diagnostic information.
                    Hosting and security providers may also process IP address and
                    browser or device information when serving requests.
                  </li>
                  <li>
                    Information from Google or GitHub when you choose social sign-in,
                    such as your provider account identifier, name, email address, and
                    profile image made available by that provider.
                  </li>
                </ul>
              </div>
            </section>

            <section id="how-we-use-information" className={sectionClassName}>
              <h2 className={headingClassName}>How we use information</h2>
              <div className={bodyClassName}>
                <p>We use information to:</p>
                <ul className="list-disc space-y-2 pl-5 marker:text-blue-600 dark:marker:text-blue-300">
                  <li>create and secure accounts, sessions, and project access;</li>
                  <li>provide project planning, collaboration, files, and notifications;</li>
                  <li>deliver the Google Calendar features you explicitly connect;</li>
                  <li>send service emails such as verification, recovery, invitations, and reminders;</li>
                  <li>maintain reliability, prevent abuse, troubleshoot errors, and protect the service; and</li>
                  <li>comply with legal obligations and enforce applicable agreements.</li>
                </ul>
                <p>
                  NexusDash does not sell personal information or use Google user data
                  for advertising.
                </p>
              </div>
            </section>

            <section id="google-user-data" className={sectionClassName}>
              <h2 className={headingClassName}>Google user data</h2>
              <div className={bodyClassName}>
                <p>
                  Google social sign-in and Google Calendar are separate, optional
                  connections. Social sign-in uses basic identity information to create
                  or access your NexusDash account. Connecting Calendar requests the
                  <code className="mx-1 break-all rounded bg-muted px-1.5 py-0.5 text-[0.9em] text-foreground">
                    https://www.googleapis.com/auth/calendar.events
                  </code>
                  scope.
                </p>
                <p>
                  With Calendar connected, NexusDash reads event details needed to show
                  your selected calendar in the workspace and, when you direct it to,
                  creates, updates, or deletes calendar events. Event details can include
                  titles, dates and times, descriptions, locations, status, and Google
                  event links. NexusDash processes these event details on demand and does
                  not create a separate permanent copy of your Google Calendar event list.
                </p>
                <p>
                  We store the selected calendar ID, granted scope, token metadata, and
                  OAuth access and refresh tokens needed to maintain the connection.
                  OAuth tokens are encrypted before they are stored in the database and
                  are only decrypted by the server when it needs to call Google on your
                  behalf.
                </p>
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.07] p-4 text-foreground">
                  <p className="font-medium">Google Limited Use disclosure</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
                    NexusDash&apos;s use and transfer to any other app of information
                    received from Google APIs will adhere to the Google API Services User
                    Data Policy, including the Limited Use requirements.
                  </p>
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noreferrer"
                    className={`${linkClassName} mt-3 inline-flex items-center gap-1.5`}
                  >
                    Read the Google API Services User Data Policy
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </section>

            <section id="sharing" className={sectionClassName}>
              <h2 className={headingClassName}>How information is shared</h2>
              <div className={bodyClassName}>
                <p>
                  Project content is shared with the people you invite according to their
                  project role. Information is also processed by service providers that
                  help operate NexusDash, including Vercel for application hosting,
                  Supabase for managed database infrastructure, Cloudflare R2 for file
                  storage, Resend for service email, and Google or GitHub for features you
                  choose to connect. These providers process information under their own
                  terms and privacy commitments.
                </p>
                <p>
                  We may disclose information when required by law, to protect users or
                  the service, or as part of a business transfer. We do not allow service
                  providers to use Google user data for advertising, data brokerage, or
                  training general-purpose artificial intelligence models.
                </p>
              </div>
            </section>

            <section id="retention" className={sectionClassName}>
              <h2 className={headingClassName}>Retention and deletion</h2>
              <div className={bodyClassName}>
                <p>
                  We retain account and workspace information while your account is
                  active and as needed to provide the service. Security, audit, delivery,
                  and backup records may remain for a limited period after they are no
                  longer active where needed for reliability, fraud prevention, dispute
                  resolution, or legal obligations.
                </p>
                <p>
                  Google OAuth credentials are retained while the Calendar connection is
                  active. Removing NexusDash access in your Google Account stops future
                  Google API access, but it does not automatically erase information
                  already stored by NexusDash. To request deletion of your stored Google
                  credentials, account, or other personal information, email the address
                  in the Contact section. We will verify the request and delete or
                  de-identify information unless retention is legally required.
                </p>
              </div>
            </section>

            <section id="security" className={sectionClassName}>
              <h2 className={headingClassName}>Security</h2>
              <div className={bodyClassName}>
                <p>
                  We use administrative and technical safeguards designed to protect
                  information, including access controls, tenant isolation, hashed
                  passwords and session tokens, encrypted Google OAuth tokens, and HTTPS
                  in hosted environments. No storage or transmission method can be
                  guaranteed completely secure.
                </p>
              </div>
            </section>

            <section id="your-choices" className={sectionClassName}>
              <h2 className={headingClassName}>Your choices</h2>
              <div className={bodyClassName}>
                <ul className="list-disc space-y-2 pl-5 marker:text-blue-600 dark:marker:text-blue-300">
                  <li>You can update supported profile and Calendar settings in NexusDash.</li>
                  <li>
                    You can review or remove NexusDash&apos;s Google access at any time on
                    your Google Account&apos;s connected-apps page. Removing access disables
                    Calendar features until you authorize them again.
                  </li>
                  <li>
                    You can ask to access, correct, export, or delete personal information
                    by contacting us. Applicable law may provide additional rights.
                  </li>
                </ul>
                <a
                  href="https://myaccount.google.com/connections"
                  target="_blank"
                  rel="noreferrer"
                  className={`${linkClassName} inline-flex items-center gap-1.5`}
                >
                  Manage connected apps in your Google Account
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </div>
            </section>

            <section id="other-information" className={sectionClassName}>
              <h2 className={headingClassName}>Other information</h2>
              <div className={bodyClassName}>
                <p>
                  Service providers may process information in countries other than your
                  own. NexusDash is not directed to children under 13, and we do not
                  knowingly collect their personal information.
                </p>
                <p>
                  We may update this policy when the service or legal requirements
                  change. Material changes will be identified by a new effective date and,
                  when appropriate, an additional in-product notice.
                </p>
              </div>
            </section>

            <section id="contact" className={sectionClassName}>
              <h2 className={headingClassName}>Contact</h2>
              <div className={bodyClassName}>
                <p>
                  NexusDash is operated by Dorian Agaesse. For privacy questions or data
                  requests, contact{" "}
                  <a href="mailto:dorian.agaesse@gmail.com" className={linkClassName}>
                    dorian.agaesse@gmail.com
                  </a>
                  .
                </p>
              </div>
            </section>
          </div>
        </article>

        <aside className="hidden lg:block">
          <nav
            aria-label="Privacy policy sections"
            className="rounded-2xl border border-border/70 bg-card p-5 lg:sticky lg:top-8"
          >
            <p className="text-sm font-semibold">On this page</p>
            <ul className="mt-3 grid gap-1">
              {sections.map(([id, label]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="block min-h-10 rounded-lg px-3 py-2 text-sm leading-6 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </main>
  );
}
