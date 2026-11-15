import { ArrowRight, Layers3 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col bg-background px-6 py-24 text-foreground sm:px-10">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center">
        <div className="mb-12 flex items-center gap-3 text-base font-semibold tracking-tight">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Layers3 className="size-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          NexusDash
        </div>

        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          <span className="mb-6 block text-7xl tracking-tighter text-muted-foreground sm:text-8xl">
            404
          </span>
          Page not found
        </h1>
        <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
          This page may have moved, or the link may be incorrect. Check the address
          or return to your projects to keep going.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/projects">
              Go to projects
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
