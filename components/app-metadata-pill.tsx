import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c.957.005 1.983.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

import { getAppMetadataSummary } from "@/lib/app-metadata";

export function AppMetadataPill() {
  const metadata = getAppMetadataSummary();

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-gradient-to-r from-background/95 via-background/90 to-sky-500/10 px-2 py-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <Sparkles className="h-3.5 w-3.5 text-sky-500" aria-hidden />
      <Link
        href={metadata.repositoryUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open NexusDash GitHub repository"
        className="inline-flex items-center gap-1 rounded-full px-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <GithubIcon className="h-3.5 w-3.5" />
        <span className="sr-only">Repository</span>
        <span className="hidden sm:inline">Repository</span>
        <ArrowUpRight className="h-3 w-3" aria-hidden />
      </Link>
      <span className="rounded-full border border-border/70 bg-muted/70 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
        {metadata.versionLabel}
      </span>
    </div>
  );
}
