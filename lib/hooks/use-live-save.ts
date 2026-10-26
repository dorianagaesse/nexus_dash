"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RecoveryDraftState } from "@/lib/hooks/use-recovery-draft";
import { LiveSaveScheduler } from "@/lib/live-save/scheduler";
import type {
  LiveSaveAcceptedInfo,
  LiveSaveAdapter,
  LiveSaveConflictChoice,
  LiveSaveFieldMetaMap,
  LiveSaveOutcome,
  LiveSaveRevision,
  LiveSaveSnapshot,
  LiveSaveValidation,
} from "@/lib/live-save/types";

/**
 * React binding for the ND-433 live-save scheduler. The surface keeps owning
 * its form state; this hook observes `value`/`base`/`baseRevision`, schedules
 * dirty-field saves through the injected adapter, and exposes the conflict
 * review actions. `enabled` must stay false until the surface's Live gate in
 * `lib/live-save/rollout.ts` is flipped; local recovery drafts keep working
 * either way.
 *
 * Integration rules:
 * - `fields`, `fieldMeta`, `isEqual`, and `validate` must stay constant for
 *   the lifetime of the hook instance.
 * - `applyRepresentation` is required for conflict review and disjoint
 *   rebases: it writes the merged server/local representation back into the
 *   form fields so the displayed values match what was saved.
 * - When a write is accepted, or a conflict is adopted without a write, the
 *   hook first calls `recovery.saved(submitted)` and then `onAccepted`.
 *   Advance the recovery `base` prop only when the surface representation is
 *   fully synced with the acknowledgement; otherwise keep the previous base so
 *   the recovery hook does not flag a false local conflict while newer
 *   in-flight edits continue.
 * - `entityKey` identifies the record/mode; changing it resets scheduling and
 *   aborts any in-flight write.
 */
export interface UseLiveSaveOptions<F extends Record<string, unknown>> {
  adapter: LiveSaveAdapter<F>;
  value: F;
  base: F;
  baseRevision: LiveSaveRevision;
  fields: readonly (keyof F & string)[];
  enabled: boolean;
  entityKey: string | null;
  fieldMeta?: LiveSaveFieldMetaMap<F>;
  isEqual?: (a: unknown, b: unknown, field: string) => boolean;
  validate?: (value: F) => LiveSaveValidation;
  debounceMs?: number;
  maxWaitMs?: number;
  retryDelaysMs?: readonly number[];
  applyRepresentation?: (representation: F, fields: string[]) => void;
  onAccepted?: (info: LiveSaveAcceptedInfo<F>) => void;
  recovery?: RecoveryDraftState;
}

export interface LiveSaveController<F extends Record<string, unknown>> {
  snapshot: LiveSaveSnapshot<F>;
  /**
   * Explicit save through the same guarded, conflict-aware path. Works while
   * the Live gate is off; `allowEmpty` lets command-only explicit saves flush
   * when no live-content field is dirty.
   */
  saveNow: (options?: { allowEmpty?: boolean }) => Promise<LiveSaveOutcome<F>>;
  resolveConflict: (
    choices: Record<string, LiveSaveConflictChoice>
  ) => Promise<LiveSaveOutcome<F>>;
}

function acceptedWithRecovery<F extends Record<string, unknown>>(
  options: UseLiveSaveOptions<F>
): (info: LiveSaveAcceptedInfo<F>) => void {
  return (info) => {
    // Keep the recovery ledger consistent before the surface advances its
    // base prop: the submitted draft clears only when no newer local edit
    // remains; otherwise it stays for the next cycle.
    options.recovery?.saved(info.submitted);
    options.onAccepted?.(info);
  };
}

export function useLiveSave<F extends Record<string, unknown>>(
  options: UseLiveSaveOptions<F>
): LiveSaveController<F> {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  const [scheduler] = useState(
    () =>
      new LiveSaveScheduler<F>({
        adapter: options.adapter,
        value: options.value,
        base: options.base,
        baseRevision: options.baseRevision,
        fields: options.fields,
        enabled: options.enabled,
        fieldMeta: options.fieldMeta,
        isEqual: options.isEqual,
        validate: options.validate,
        debounceMs: options.debounceMs,
        maxWaitMs: options.maxWaitMs,
        retryDelaysMs: options.retryDelaysMs,
        applyRepresentation: options.applyRepresentation,
        onAccepted: acceptedWithRecovery(options),
      })
  );

  const subscribe = useCallback(
    (listener: () => void) => scheduler.subscribe(listener),
    [scheduler]
  );
  const getSnapshot = useCallback(() => scheduler.getSnapshot(), [scheduler]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const valueJsonRef = useRef<string | null>(null);
  const baseKeyRef = useRef<string | null>(null);
  const enabledRef = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    scheduler.setCallbacks({
      adapter: options.adapter,
      applyRepresentation: options.applyRepresentation,
      onAccepted: acceptedWithRecovery(options),
    });
    const valueJson = JSON.stringify(options.value);
    const baseKey = `${String(options.baseRevision)}\n${JSON.stringify(options.base)}`;
    if (valueJsonRef.current !== valueJson) {
      valueJsonRef.current = valueJson;
      scheduler.setValue(options.value);
    }
    if (baseKeyRef.current !== baseKey) {
      baseKeyRef.current = baseKey;
      scheduler.setBase(options.base, options.baseRevision);
    }
    if (enabledRef.current !== options.enabled) {
      enabledRef.current = options.enabled;
      scheduler.setEnabled(options.enabled);
    }
  });

  const entityKeyRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (entityKeyRef.current === undefined) {
      entityKeyRef.current = options.entityKey;
      return;
    }
    if (entityKeyRef.current === options.entityKey) return;
    entityKeyRef.current = options.entityKey;
    const current = latest.current;
    scheduler.reset({
      value: current.value,
      base: current.base,
      baseRevision: current.baseRevision,
      enabled: current.enabled,
    });
    valueJsonRef.current = JSON.stringify(current.value);
    baseKeyRef.current = `${String(current.baseRevision)}\n${JSON.stringify(current.base)}`;
    enabledRef.current = current.enabled;
  }, [options.entityKey, scheduler]);

  useEffect(() => {
    const onOnline = () => scheduler.setOnline(true);
    const onOffline = () => scheduler.setOnline(false);
    const onVisibility = () =>
      scheduler.setVisible(document.visibilityState !== "hidden");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    scheduler.setOnline(navigator.onLine);
    scheduler.setVisible(document.visibilityState !== "hidden");
    // Scheduling starts only here, from the committed effect, with the real
    // connectivity/visibility state already applied; construction stays inert
    // so a discarded StrictMode render can never leave a live timer behind.
    scheduler.resume();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      scheduler.suspend();
    };
  }, [scheduler]);

  const saveNow = useCallback(
    (saveOptions?: { allowEmpty?: boolean }) => scheduler.saveNow(saveOptions),
    [scheduler]
  );
  const resolveConflict = useCallback(
    (choices: Record<string, LiveSaveConflictChoice>) =>
      scheduler.resolveConflict(choices),
    [scheduler]
  );

  return { snapshot, saveNow, resolveConflict };
}
