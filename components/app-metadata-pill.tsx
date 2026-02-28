import Link from "next/link";
import { ArrowUpRight, Github, Sparkles } from "lucide-react";

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
        className="inline-flex items-center gap-1 rounded-full px-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Github className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Repository</span>
        <ArrowUpRight className="h-3 w-3" aria-hidden />
      </Link>
      <span className="rounded-full border border-border/70 bg-muted/70 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
        {metadata.versionLabel}
      </span>
    </div>
  );
}
