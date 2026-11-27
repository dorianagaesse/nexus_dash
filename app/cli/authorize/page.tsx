import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers3 } from "lucide-react";

import { AgentCliAuthorizeCard } from "@/components/agent-cli-authorize-card";
import { Button } from "@/components/ui/button";
import { getSessionUserIdFromServer } from "@/lib/auth/session-user";
import { isLiveProductionDeployment } from "@/lib/env.server";
import { appendQueryToPath } from "@/lib/navigation/return-to";
import {
  inspectAgentCliPairingForUser,
  normalizeCliUserCode,
} from "@/lib/services/agent-cli-pairing-service";
import { isEmailVerifiedForUser } from "@/lib/services/email-verification-service";

type SearchParams = Record<string, string | string[] | undefined>;

function readQueryValue(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function CliAuthorizePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const rawCode = readQueryValue(resolvedSearchParams?.code);
  const normalizedCode = normalizeCliUserCode(rawCode);
  const returnToPath = appendQueryToPath("/cli/authorize", {
    code: normalizedCode ?? rawCode?.trim() ?? undefined,
  });

  const actorUserId = await getSessionUserIdFromServer();
  if (actorUserId && isLiveProductionDeployment()) {
    const emailVerified = await isEmailVerifiedForUser(actorUserId);
    if (!emailVerified) {
      redirect(
        appendQueryToPath("/verify-email", {
          returnTo: returnToPath,
        })
      );
    }
  }

  const signInHref = appendQueryToPath("/", {
    form: "signin",
    returnTo: returnToPath,
  });

  const initialView = actorUserId
    ? await inspectAgentCliPairingForUser({
        actorUserId,
        rawCode,
      })
    : null;

  return (
    <main className="min-h-dvh bg-background px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href={actorUserId ? "/projects" : "/"}
            className="inline-flex min-h-11 items-center gap-2.5 rounded-lg text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className="grid size-8 place-items-center rounded-lg bg-blue-600 text-white dark:bg-blue-500"
              aria-hidden="true"
            >
              <Layers3 className="size-4" strokeWidth={2.2} />
            </span>
            <span>NexusDash</span>
          </Link>
          {actorUserId ? (
            <Link
              href="/projects"
              className="inline-flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Projects
            </Link>
          ) : null}
        </header>

        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Approve CLI installation
          </h1>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            Connect the standalone <code>nd</code> CLI on your machine to an
            existing NexusDash project agent identity.
          </p>
        </div>

        {!actorUserId ? (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-7">
            {normalizedCode ? (
              <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Pending confirmation code
                </p>
                <code className="mt-0.5 block font-mono text-lg font-semibold tracking-wider">
                  {normalizedCode}
                </code>
              </div>
            ) : null}
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              Sign in as the project owner to choose an existing agent identity
              and approve this CLI installation.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="min-h-11">
                <Link href={signInHref}>Sign in to continue</Link>
              </Button>
            </div>
          </div>
        ) : (
          <AgentCliAuthorizeCard initialView={initialView!} />
        )}
      </div>
    </main>
  );
}
