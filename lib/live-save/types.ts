/**
 * Shared types for the ND-433 live-save client scheduler.
 *
 * The scheduler implements the client half of `adr/task-432-autosave-contract.md`
 * section 4.3 and 4.5: a 2-second quiet debounce, a 30-second maximum wait,
 * single-flight coalesced dirty-field writes, pause/resume behavior, bounded
 * exponential retry, a guarded explicit save, and conflict recovery that
 * preserves both versions. Live save must stay disabled until the ND-428/429
 * latency gate and the agent v1 sunset allow enabling a surface.
 */

export const LIVE_SAVE_DEBOUNCE_MS = 2_000;
export const LIVE_SAVE_MAX_WAIT_MS = 30_000;
export const LIVE_SAVE_RETRY_DELAYS_MS = [5_000, 15_000, 60_000] as const;

/** Content revision used as the conditional-write precondition (`If-Match`). */
export type LiveSaveRevision = string | number;

/** Mutating request attribution; maps to `NexusDash-Mutation-Intent`. */
export type LiveSaveIntent = "autosave" | "explicit";

export type LiveSaveFieldMeta = {
  label: string;
  /** Rich text is an indivisible field: the contract never merges it. */
  richText?: boolean;
};

export type LiveSaveFieldMetaMap<F extends Record<string, unknown>> = Partial<
  Record<keyof F & string, LiveSaveFieldMeta>
>;

/**
 * Required server contract for an injected live-save adapter.
 *
 * The adapter performs one conditional partial content update per call. It owns
 * transport details; the scheduler owns scheduling, coalescing, pause/retry,
 * and conflict policy. A conforming adapter must:
 *
 * 1. Send `PATCH` to the record's content route with only the supplied `fields`
 *    (never the whole aggregate), `If-Match: baseRevision`, and the
 *    `NexusDash-Mutation-Intent` header set to `intent`. Autosave intent is a
 *    hint for side-effect coalescing, not an authorization bypass; commands
 *    (status, assignee, archive, delete, mentions, attachments) must never be
 *    sent through the autosave path.
 * 2. Map responses to exactly one result kind:
 *    - `200`-class with the updated record -> `accepted` with the new
 *      monotonic content revision and the full current representation mapped
 *      into the surface field shape.
 *    - `412 Precondition Failed` with stable `edit-conflict` code ->
 *      `conflict` carrying the current revision and the authorized latest
 *      representation. The adapter must not retry or apply the stale payload.
 *    - `422`/`400` validation rejection -> `invalid` with the server message.
 *    - `401`/`403` -> `unauthorized`.
 *    - `404` (deleted or lost access) -> `gone`.
 *    - Network failure or timeout where the request may not have been sent ->
 *      `offline` (the scheduler pauses timed saves; an explicit save may
 *      retry). If the browser reports offline, resolve `offline` as well.
 *    - Other `5xx`/transport errors -> `failed` with `retryable: true`.
 *    - Contract violations (for example `428 Precondition Required`, which
 *      means the negotiated revision contract is missing) -> `failed` with
 *      `retryable: false`.
 * 3. Never throw and never resolve `accepted` without the authoritative
 *    representation; the scheduler rebases and clears local drafts from it.
 * 4. Honor the `AbortSignal`; an aborted request resolves `failed` with
 *    `retryable: true` only if the caller still exists, but the scheduler
 *    discards late results anyway.
 */
export interface LiveSaveAdapter<F extends Record<string, unknown>> {
  save(input: LiveSaveWriteInput<F>): Promise<LiveSaveWriteResult<F>>;
}

export interface LiveSaveWriteInput<F extends Record<string, unknown>> {
  /** Dirty fields only; never the whole aggregate. */
  fields: Partial<F>;
  /** Conditional-write precondition for the submitted base revision. */
  baseRevision: LiveSaveRevision;
  intent: LiveSaveIntent;
  signal: AbortSignal;
}

export type LiveSaveWriteResult<F extends Record<string, unknown>> =
  | { kind: "accepted"; revision: LiveSaveRevision; representation: F }
  | {
      kind: "conflict";
      latest: { revision: LiveSaveRevision; representation: F };
    }
  | { kind: "invalid"; message: string }
  | { kind: "unauthorized" }
  | { kind: "gone" }
  | { kind: "offline" }
  | { kind: "failed"; message: string; retryable: boolean };

export type LiveSaveValidation =
  | { valid: true }
  | { valid: false; message: string };

/**
 * Visible scheduler state. The UI maps phases to the contract labels:
 * `saving` -> "Saving changes", `saved` -> "Saved",
 * `offline-paused` -> "Offline - draft safe locally",
 * `failed` -> "Save failed - draft safe locally",
 * `conflict` -> "Conflict - review changes". While `dirty` the recovery-draft
 * notice already shows "Draft saved locally". `disabled`, `clean`, and
 * `hidden-paused` render nothing.
 */
export type LiveSavePhase =
  | "disabled"
  | "clean"
  | "dirty"
  | "sending"
  | "saved"
  | "offline-paused"
  | "hidden-paused"
  | "invalid-paused"
  | "auth-paused"
  | "gone-blocked"
  | "failed"
  | "conflict";

export interface LiveSaveConflict<F extends Record<string, unknown>> {
  /** Snapshot the draft started from. */
  base: F;
  /** Current local draft. */
  local: F;
  /** Latest authorized server representation. */
  latest: F;
  latestRevision: LiveSaveRevision;
  changedLocally: string[];
  changedOnServer: string[];
  /** Fields changed on both sides; require an explicit choice. */
  conflictingFields: string[];
}

export interface LiveSaveSnapshot<F extends Record<string, unknown>> {
  phase: LiveSavePhase;
  enabled: boolean;
  dirtyFields: string[];
  invalidMessage: string | null;
  failureMessage: string | null;
  /** When a timed retry will run; null when there is no pending retry. */
  retryAt: number | null;
  conflict: LiveSaveConflict<F> | null;
  savedAt: number | null;
}

export interface LiveSaveAcceptedInfo<F extends Record<string, unknown>> {
  representation: F;
  revision: LiveSaveRevision;
  /** The value submitted with this write. */
  submitted: F;
  /** True when no local changes remain after this acknowledgement. */
  fullySynced: boolean;
}

export type LiveSaveConflictChoice = "local" | "latest";

export type LiveSaveOutcome<F extends Record<string, unknown>> =
  | { status: "accepted"; revision: LiveSaveRevision }
  | { status: "adopted"; representation: F }
  | { status: "conflict" }
  | { status: "invalid"; message: string }
  | { status: "unauthorized" }
  | { status: "gone" }
  | { status: "offline" }
  | { status: "failed"; message: string; retryable: boolean }
  | { status: "clean" }
  | { status: "disabled" }
  | { status: "busy" };
