"use client";

import type { LiveSaveConflict, LiveSaveConflictChoice, LiveSaveFieldMetaMap } from "@/lib/live-save/types";

export interface ConflictReviewProps<F extends Record<string, unknown>> {
  conflict: LiveSaveConflict<F>;
  fieldMeta?: LiveSaveFieldMetaMap<F>;
  pending?: boolean;
  onResolve: (choices: Record<string, LiveSaveConflictChoice>) => void;
}

/** Conflict protection is internal. Never expose autosave recovery choices. */
export function ConflictReview<F extends Record<string, unknown>>(props: ConflictReviewProps<F>) {
  void props;
  return null;
}
