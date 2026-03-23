"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

type HomeAuthForm = "signin" | "signup";

type HomeAuthModeToggleLinkProps = {
  targetForm: HomeAuthForm;
  returnTo?: string | null;
  className?: string;
  ariaCurrent?: "page";
  children: ReactNode;
};

function normalizeEmailCandidate(emailCandidate: string | null | undefined): string | null {
  if (!emailCandidate) {
    return null;
  }

  const trimmed = emailCandidate.trim();
  if (!trimmed || trimmed.length > 320) {
    return null;
  }

  return trimmed;
}

function readCurrentEmailCandidate(): string | null {
  const emailInputs = document.querySelectorAll<HTMLInputElement>(
    'input[type="email"][name="email"]'
  );

  for (const emailInput of emailInputs) {
    const normalized = normalizeEmailCandidate(emailInput.value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function buildHomeAuthHref(
  targetForm: HomeAuthForm,
  emailCandidate?: string | null,
  returnTo?: string | null
): string {
  const params = new URLSearchParams({ form: targetForm });
  const normalizedEmail = normalizeEmailCandidate(emailCandidate);

  if (normalizedEmail) {
    params.set("email", normalizedEmail);
  }

  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  return `/?${params.toString()}`;
}

export function HomeAuthModeToggleLink({
  targetForm,
  returnTo,
  className,
  ariaCurrent,
  children,
}: HomeAuthModeToggleLinkProps) {
  const router = useRouter();
  const baseHref = buildHomeAuthHref(targetForm, null, returnTo);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    const nextHref = buildHomeAuthHref(
      targetForm,
      readCurrentEmailCandidate(),
      returnTo
    );
    if (nextHref === baseHref) {
      return;
    }

    event.preventDefault();
    router.push(nextHref, { scroll: false });
  };

  return (
    <Link
      href={baseHref}
      scroll={false}
      onClick={handleClick}
      aria-current={ariaCurrent}
      className={className}
    >
      {children}
    </Link>
  );
}
