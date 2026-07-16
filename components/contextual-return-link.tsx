import Link from "next/link";
import { CornerUpLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  resolveContextualReturnDestination,
  type ContextualReturnDestination,
} from "@/lib/navigation/authenticated-shell";

interface ContextualReturnLinkProps {
  returnTo?: string | null;
  fallback: ContextualReturnDestination;
}

export function ContextualReturnLink({
  returnTo,
  fallback,
}: ContextualReturnLinkProps) {
  const destination = resolveContextualReturnDestination(returnTo, fallback);

  return (
    <Button asChild variant="ghost" className="-ml-2 min-h-11 w-fit px-2 text-sm">
      <Link href={destination.href}>
        <CornerUpLeft className="h-4 w-4" aria-hidden />
        {destination.label}
      </Link>
    </Button>
  );
}
