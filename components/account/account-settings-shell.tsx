import Link from "next/link";
import { BookOpenText, CalendarDays } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { appendQueryToPath } from "@/lib/navigation/return-to";
import { normalizeAuthenticatedReturnToPath } from "@/lib/navigation/authenticated-shell";

type AccountSettingsTab = "calendar" | "developers";

interface AccountSettingsShellProps {
  activeTab: AccountSettingsTab;
  title: string;
  description: string;
  children: ReactNode;
  returnTo?: string | null;
}

export function AccountSettingsShell({
  activeTab,
  title,
  description,
  children,
  returnTo,
}: AccountSettingsShellProps) {
  const preservedReturnTo = normalizeAuthenticatedReturnToPath(
    returnTo,
    "/projects"
  );
  const calendarHref = appendQueryToPath("/account/settings", {
    returnTo: preservedReturnTo,
  });
  const developersHref = appendQueryToPath("/account/settings/developers", {
    returnTo: preservedReturnTo,
  });

  return (
    <section aria-labelledby="account-settings-heading">
      <div className="flex w-full flex-col gap-6">
        <div className="space-y-2">
          <h1 id="account-settings-heading" className="text-3xl font-semibold tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage calendar and developer preferences for your account.
          </p>
        </div>

        <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
          <Button
            asChild
            variant={activeTab === "calendar" ? "secondary" : "outline"}
            className="min-h-11 rounded-full px-4"
          >
            <Link href={calendarHref} aria-current={activeTab === "calendar" ? "page" : undefined}>
              <CalendarDays className="h-4 w-4" />
              Calendar
            </Link>
          </Button>
          <Button
            asChild
            variant={activeTab === "developers" ? "secondary" : "outline"}
            className="min-h-11 rounded-full px-4"
          >
            <Link href={developersHref} aria-current={activeTab === "developers" ? "page" : undefined}>
              <BookOpenText className="h-4 w-4" />
              Developers
            </Link>
          </Button>
        </nav>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {children}

        <div className="border-t border-border/60 pt-4">
          <Link
            href="/privacy"
            className="inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Privacy policy
          </Link>
        </div>
      </div>
    </section>
  );
}
