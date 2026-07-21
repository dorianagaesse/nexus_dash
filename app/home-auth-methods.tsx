"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HomeAuthMethodsProps {
  children: ReactNode;
  defaultEmailExpanded?: boolean;
  providerOptions: ReactNode;
}

export function HomeAuthMethods({
  children,
  defaultEmailExpanded = false,
  providerOptions,
}: HomeAuthMethodsProps) {
  const [emailExpanded, setEmailExpanded] = useState(defaultEmailExpanded);

  return (
    <>
      <div
        data-state={emailExpanded ? "email-expanded" : "provider-options"}
        className={cn("grid gap-2", emailExpanded && "hidden sm:grid")}
      >
        {providerOptions}
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full rounded-xl sm:hidden"
          onClick={() => setEmailExpanded(true)}
          aria-expanded={emailExpanded}
          aria-controls="home-email-auth-form"
        >
          <Mail className="size-4" aria-hidden="true" />
          Continue with email
        </Button>

        <div className="relative my-2 hidden sm:block">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <span className="bg-card px-3">Or use email</span>
          </div>
        </div>
      </div>

      <div
        id="home-email-auth-form"
        data-state={emailExpanded ? "email-expanded" : "provider-options"}
        className={cn("hidden gap-4 sm:grid", emailExpanded && "grid")}
      >
        {children}
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-full rounded-lg text-muted-foreground sm:hidden"
          onClick={() => setEmailExpanded(false)}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Other sign-in options
        </Button>
      </div>
    </>
  );
}
