"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const PREFIX = "nexusdash.draft.v1:";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 300;

interface StoredDraft<T> {
  version: 1;
  payload: T;
  base: string;
  baseRevision: string | null;
  updatedAt: number;
  writer: string;
  revision: number;
}

export function recoveryDraftKey(input: {
  userId: string;
  projectId: string;
  surface: string;
  mode: string;
  entityId?: string | null;
}): string {
  return `${PREFIX}${input.userId}:${input.projectId}:${input.surface}:${input.mode}:${input.entityId ?? "new"}`;
}

export function clearUserRecoveryDrafts(userId: string): void {
  try {
    window.dispatchEvent(new CustomEvent("nexusdash:clear-recovery-drafts", { detail: userId }));
    const prefix = `${PREFIX}${userId}:`;
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch {
    // Logout must still proceed when browser storage is unavailable.
  }
}

function readDraft<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (parsed.version !== 1 || parsed.payload === undefined ||
      typeof parsed.base !== "string" || typeof parsed.updatedAt !== "number") {
      // A draft from a newer schema stays available for manual recovery.
      return null;
    }
    if (Date.now() - parsed.updatedAt > MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    if (parsed.updatedAt > Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface RecoveryDraftState {
  restored: boolean;
  locallyStored: boolean;
  conflict: boolean;
  error: string | null;
  incompatibleDraft: string | null;
  discard: (allowEditingAfterDiscard?: boolean) => void;
  acceptConflict: () => void;
  saved: (submittedValue: unknown) => void;
  flush: () => void;
}

export function useRecoveryDraft<T>({
  storageKey,
  value,
  base,
  restore,
  isEmpty,
  baseRevision = null,
}: {
  storageKey: string | null;
  value: T;
  base: T;
  restore: (value: T) => void;
  isEmpty?: (value: T) => boolean;
  baseRevision?: string | null;
}): RecoveryDraftState {
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const baseJson = JSON.stringify(base);
  const [restored, setRestored] = useState(false);
  const [locallyStored, setLocallyStored] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incompatibleDraft, setIncompatibleDraft] = useState<string | null>(null);
  const writerRef = useRef<string | null>(null);
  const revisionRef = useRef(0);
  const lastWrittenRef = useRef<string | null>(null);
  const suppressedRef = useRef<string | null>(null);
  const allowEditingAfterDiscardRef = useRef(false);
  const acceptedBaseRef = useRef<string | null>(null);
  const acceptedRevisionRef = useRef<string | null>(null);
  const composingRef = useRef(false);
  const incompatibleKeyRef = useRef<string | null>(null);
  const latestRef = useRef({ storageKey, value, base, isEmpty, baseRevision });
  const restoreRef = useRef(restore);
  useLayoutEffect(() => {
    latestRef.current = { storageKey, value, base, isEmpty, baseRevision };
    restoreRef.current = restore;
  });

  const flush = useCallback(() => {
    const { storageKey: key, value: current, base: initial, isEmpty: empty, baseRevision: revision } = latestRef.current;
    if (!key || readyKey !== key || suppressedRef.current === key || composingRef.current || incompatibleKeyRef.current === key) return;
    try {
      if (!writerRef.current) {
        writerRef.current = sessionStorage.getItem("nexusdash.draft.writer.v1") ?? crypto.randomUUID();
        sessionStorage.setItem("nexusdash.draft.writer.v1", writerRef.current);
      }
      const forkKey = `${key}:conflict:${writerRef.current}`;
      const existing = readDraft<T>(key);
      const baseSnapshot = acceptedBaseRef.current ?? JSON.stringify(initial);
      const baseChanged = baseSnapshot !== JSON.stringify(initial);
      const hasOtherWriter = Boolean(existing && existing.writer !== writerRef.current &&
        JSON.stringify(existing) !== lastWrittenRef.current);
      if (hasOtherWriter || baseChanged) setConflict(true);
      if (JSON.stringify(current) === JSON.stringify(initial) || empty?.(current)) {
        if (existing && !hasOtherWriter && !baseChanged && !conflict) localStorage.removeItem(key);
        localStorage.removeItem(forkKey);
        lastWrittenRef.current = null;
        setRestored(false);
        setLocallyStored(false);
        return;
      }
      const envelope: StoredDraft<T> = {
        version: 1,
        payload: current,
        base: baseSnapshot,
        baseRevision: baseChanged ? acceptedRevisionRef.current : revision,
        updatedAt: Date.now(),
        writer: writerRef.current,
        revision: ++revisionRef.current,
      };
      const serialized = JSON.stringify(envelope);
      if (conflict || hasOtherWriter || baseChanged) {
        localStorage.setItem(forkKey, serialized);
      } else {
        localStorage.setItem(key, serialized);
        localStorage.removeItem(forkKey);
        lastWrittenRef.current = serialized;
      }
      setLocallyStored(true);
      setError(null);
    } catch {
      setError("This draft could not be stored in this browser. Copy your changes before leaving.");
    }
  }, [readyKey, conflict]);

  useEffect(() => {
    if (!storageKey) {
      setReadyKey(null);
      setRestored(false);
      setLocallyStored(false);
      setConflict(false);
      setIncompatibleDraft(null);
      incompatibleKeyRef.current = null;
      return;
    }
    suppressedRef.current = null;
    allowEditingAfterDiscardRef.current = false;
    acceptedBaseRef.current = JSON.stringify(latestRef.current.base);
    acceptedRevisionRef.current = latestRef.current.baseRevision;
    if (!writerRef.current) {
      try {
        writerRef.current = sessionStorage.getItem("nexusdash.draft.writer.v1") ?? crypto.randomUUID();
        sessionStorage.setItem("nexusdash.draft.writer.v1", writerRef.current);
      } catch { writerRef.current = crypto.randomUUID(); }
    }
    const primary = readDraft<T>(storageKey);
    let rawPrimary: string | null = null;
    try { rawPrimary = localStorage.getItem(storageKey); } catch { /* storage unavailable */ }
    incompatibleKeyRef.current = rawPrimary && !primary ? storageKey : null;
    setIncompatibleDraft(rawPrimary && !primary ? rawPrimary : null);
    if (rawPrimary && !primary) setError("This browser has a draft from another version. Copy it before discarding it.");
    else setError(null);
    const fork = readDraft<T>(`${storageKey}:conflict:${writerRef.current}`);
    const draft = fork ?? primary;
    if (draft) {
      acceptedBaseRef.current = draft.base;
      acceptedRevisionRef.current = draft.baseRevision ?? null;
    }
    lastWrittenRef.current = primary ? JSON.stringify(primary) : null;
    revisionRef.current = draft?.revision ?? 0;
    setRestored(Boolean(draft));
    setLocallyStored(Boolean(draft));
    setConflict(Boolean(fork || (draft && draft.base !== JSON.stringify(latestRef.current.base))));
    // Parent dialogs initialize their fields in an effect when the entity opens.
    const timer = window.setTimeout(() => {
      if (draft) restoreRef.current(draft.payload);
      setReadyKey(storageKey);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (storageKey && readyKey === storageKey && acceptedBaseRef.current !== baseJson) {
      if (JSON.stringify(value) === baseJson && !restored) {
        acceptedBaseRef.current = baseJson;
        acceptedRevisionRef.current = baseRevision;
      } else {
        setConflict(true);
      }
    }
  }, [storageKey, readyKey, baseJson, value, restored, baseRevision]);

  useEffect(() => {
    if (!storageKey || readyKey !== storageKey) return;
    if (suppressedRef.current === storageKey) {
      if (!allowEditingAfterDiscardRef.current || JSON.stringify(value) === baseJson) return;
      suppressedRef.current = null;
      allowEditingAfterDiscardRef.current = false;
    }
    setLocallyStored(false);
    const timer = window.setTimeout(flush, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [storageKey, readyKey, value, baseJson, flush]);

  useEffect(() => {
    if (!storageKey || readyKey !== storageKey) return;
    const onHide = () => flush();
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue !== lastWrittenRef.current) {
        setConflict(true);
        // Preserve this tab's version even if it closes before another render.
        const current = latestRef.current;
        if (JSON.stringify(current.value) !== JSON.stringify(current.base)) {
          try {
            localStorage.setItem(`${storageKey}:conflict:${writerRef.current}`, JSON.stringify({
              version: 1, payload: current.value, base: acceptedBaseRef.current ?? JSON.stringify(current.base),
              baseRevision: acceptedRevisionRef.current, updatedAt: Date.now(),
              writer: writerRef.current, revision: ++revisionRef.current,
            }));
          } catch { setError("This draft could not be stored in this browser. Copy your changes before leaving."); }
        }
      }
    };
    const onCompositionStart = () => { composingRef.current = true; };
    const onCompositionEnd = () => {
      composingRef.current = false;
      window.setTimeout(flush, DEBOUNCE_MS);
    };
    const onLogout = (event: Event) => {
      if (storageKey.startsWith(`${PREFIX}${(event as CustomEvent<string>).detail}:`)) {
        suppressedRef.current = storageKey;
      }
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);
    document.addEventListener("compositionstart", onCompositionStart);
    document.addEventListener("compositionend", onCompositionEnd);
    window.addEventListener("nexusdash:clear-recovery-drafts", onLogout);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("compositionstart", onCompositionStart);
      document.removeEventListener("compositionend", onCompositionEnd);
      window.removeEventListener("nexusdash:clear-recovery-drafts", onLogout);
      flush();
    };
  }, [storageKey, readyKey, flush]);

  const discard = useCallback((allowEditingAfterDiscard = false) => {
    if (!storageKey) return;
    try {
      const primary = readDraft<T>(storageKey);
      const fork = readDraft<T>(`${storageKey}:conflict:${writerRef.current}`);
      if (!conflict || primary?.writer === writerRef.current ||
        (!fork && primary && JSON.stringify(primary) === lastWrittenRef.current)) {
        localStorage.removeItem(storageKey);
      }
      localStorage.removeItem(`${storageKey}:conflict:${writerRef.current}`);
    } catch { /* storage unavailable */ }
    suppressedRef.current = storageKey;
    allowEditingAfterDiscardRef.current = allowEditingAfterDiscard;
    acceptedBaseRef.current = JSON.stringify(latestRef.current.base);
    acceptedRevisionRef.current = latestRef.current.baseRevision;
    setRestored(false);
    setLocallyStored(false);
    setConflict(false);
    setError(null);
    setIncompatibleDraft(null);
    incompatibleKeyRef.current = null;
  }, [storageKey, conflict]);

  const saved = useCallback((submittedValue: unknown) => {
    if (JSON.stringify(latestRef.current.value) === JSON.stringify(submittedValue)) discard();
  }, [discard]);

  const acceptConflict = useCallback(() => {
    if (!storageKey) return;
    lastWrittenRef.current = readDraft<T>(storageKey) ? JSON.stringify(readDraft<T>(storageKey)) : null;
    acceptedBaseRef.current = JSON.stringify(latestRef.current.base);
    acceptedRevisionRef.current = latestRef.current.baseRevision;
    setConflict(false);
  }, [storageKey]);

  return useMemo(() => ({ restored, locallyStored, conflict, error, incompatibleDraft, discard, acceptConflict, saved, flush }),
    [restored, locallyStored, conflict, error, incompatibleDraft, discard, acceptConflict, saved, flush]);
}
