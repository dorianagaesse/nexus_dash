/**
 * Per-surface Live enablement gate (ND-432 sections 4.3 and 6).
 *
 * Live save stays disabled everywhere until the release gates are met:
 * ND-428/ND-429 measured p95 and query budgets for the surface, idle editors
 * producing zero writes, bounded invalidation/activity side effects, and the
 * agent v1 sunset for agent-writable aggregates. Add a surface here only with
 * that evidence recorded; local recovery keeps working while it is off.
 */
export type LiveSaveSurface =
  | "task-detail"
  | "context-card"
  | "meeting-preparation"
  | "meeting-output";

export const LIVE_SAVE_SURFACES: readonly LiveSaveSurface[] = [
  "task-detail",
  "context-card",
  "meeting-preparation",
  "meeting-output",
];

export const LIVE_SAVE_ENABLED_SURFACES: ReadonlySet<LiveSaveSurface> = new Set();

export function isLiveSaveSurfaceEnabled(surface: LiveSaveSurface): boolean {
  return LIVE_SAVE_ENABLED_SURFACES.has(surface);
}
