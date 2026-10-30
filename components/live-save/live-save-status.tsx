"use client";

import type { LiveSaveSnapshot } from "@/lib/live-save/types";

/** Autosave is invisible; only explicit form actions display their own errors. */
export function liveSaveStatusText<F extends Record<string, unknown>>(snapshot: LiveSaveSnapshot<F>): null {
  void snapshot;
  return null;
}

export function LiveSaveStatus<F extends Record<string, unknown>>(props: {
  snapshot: LiveSaveSnapshot<F>;
  className?: string;
}) {
  void props;
  return null;
}
