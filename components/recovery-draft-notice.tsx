"use client";

import type { RecoveryDraftState } from "@/lib/hooks/use-recovery-draft";

/** Recovery is invisible. Retained for existing surface wiring; never renders UI. */
export function RecoveryDraftNotice(props: {
  draft: RecoveryDraftState;
  onDiscard: () => void;
  onAcceptConflict?: () => void;
}) {
  void props;
  return null;
}
