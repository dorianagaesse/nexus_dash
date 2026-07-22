import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { GithubIcon } from "@/components/github-icon";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAppMetadataSummary } from "@/lib/app-metadata";

export function AppAboutCard() {
  const metadata = getAppMetadataSummary();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">About NexusDash</CardTitle>
        <CardDescription>
          Product details and the project source repository.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">App version</p>
          <p
            className="mt-1 font-mono text-sm text-muted-foreground"
            title={metadata.diagnosticLabel}
            aria-label={metadata.diagnosticLabel}
          >
            {metadata.versionLabel}
          </p>
        </div>
        <Button asChild variant="outline" className="min-h-11 sm:self-center">
          <Link
            href={metadata.repositoryUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open NexusDash repository on GitHub"
          >
            <GithubIcon className="h-4 w-4" />
            GitHub repository
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
