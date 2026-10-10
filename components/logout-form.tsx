"use client";

import type { ReactNode } from "react";
import { clearUserRecoveryDrafts } from "@/lib/hooks/use-recovery-draft";

export function LogoutForm({ action, userId, children, className, role }: {
  action: string;
  userId: string | null | undefined;
  children: ReactNode;
  className?: string;
  role?: string;
}) {
  return <form action={action} method="post" className={className} role={role}
    onSubmit={() => { if (userId) clearUserRecoveryDrafts(userId); }}>
    {children}
  </form>;
}
