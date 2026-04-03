import Link from "next/link";
import { ArrowLeft, BookOpenText, CalendarDays } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AccountSettingsTab = "calendar" | "developers";

interface AccountSettingsShellProps {
  activeTab: AccountSettingsTab;
  title: string;
  description: string;
  children: ReactNode;
}

export function AccountSettingsShell({
  activeTab,
  title,
  description,
  children,
}: AccountSettingsShellProps) {
  return (
    <main className="container py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Button asChild variant="ghost" className="-ml-2 w-fit px-2 text-sm">
          <Link href="/account">
            <ArrowLeft className="h-4 w-4" />
            Back to account
          </Link>
        </Button>

        <Badge variant="secondary" className="w-fit">
          Account settings
        </Badge>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            variant={activeTab === "calendar" ? "secondary" : "outline"}
            className="rounded-full px-4"
          >
            <Link href="/account/settings">
              <CalendarDays className="h-4 w-4" />
              Calendar
            </Link>
          </Button>
          <Button
            asChild
            variant={activeTab === "developers" ? "secondary" : "outline"}
            className="rounded-full px-4"
          >
            <Link href="/account/settings/developers">
              <BookOpenText className="h-4 w-4" />
              Developers
            </Link>
          </Button>
        </div>

        {children}
      </div>
    </main>
  );
}
