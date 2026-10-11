import {
  LIVE_SAVE_DEBOUNCE_MS,
  LIVE_SAVE_MAX_WAIT_MS,
  LIVE_SAVE_RETRY_DELAYS_MS,
  type LiveSaveAcceptedInfo,
  type LiveSaveAdapter,
  type LiveSaveConflict,
  type LiveSaveConflictChoice,
  type LiveSaveFieldMetaMap,
  type LiveSaveOutcome,
  type LiveSavePhase,
  type LiveSaveRevision,
  type LiveSaveSnapshot,
  type LiveSaveValidation,
} from "./types";

export function defaultFieldEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return false;
  }
}

export interface LiveSaveSchedulerOptions<F extends Record<string, unknown>> {
  adapter: LiveSaveAdapter<F>;
  value: F;
  base: F;
  baseRevision: LiveSaveRevision;
  /** Declared surface fields; order is used in snapshots and conflict lists. */
  fields: readonly (keyof F & string)[];
  enabled?: boolean;
  fieldMeta?: LiveSaveFieldMetaMap<F>;
  isEqual?: (a: unknown, b: unknown, field: string) => boolean;
  validate?: (value: F) => LiveSaveValidation;
  debounceMs?: number;
  maxWaitMs?: number;
  retryDelaysMs?: readonly number[];
  /** Push server values into the surface form (disjoint rebase and conflict resolution). */
  applyRepresentation?: (representation: F, fields: string[]) => void;
  /**
   * The surface baseline may advance: a conditional write was accepted, or a
   * conflict was adopted without a write. Advance the surface base
   * snapshot/revision; on adoption advance to the returned representation and
   * revision so the next conditional write targets them.
   */
  onAccepted?: (info: LiveSaveAcceptedInfo<F>) => void;
  now?: () => number;
}

type ResolvedOptions<F extends Record<string, unknown>> = Omit<
  Required<LiveSaveSchedulerOptions<F>>,
  "fieldMeta" | "isEqual" | "validate" | "applyRepresentation" | "onAccepted"
> &
  Pick<LiveSaveSchedulerOptions<F>, "fieldMeta" | "isEqual" | "validate" | "applyRepresentation" | "onAccepted">;

type InFlight<F extends Record<string, unknown>> = {
  generation: number;
  controller: AbortController;
  submittedValue: F;
  submittedFields: string[];
};

/**
 * Framework-free scheduler implementing the ND-432 sections 4.3/4.5 client
 * contract. One instance drives one record ("one request in flight per
 * entity"). Transport lives in the injected adapter; this class owns timers,
 * dirty-field computation, coalescing, pause/retry state, and conflict policy.
 */
export class LiveSaveScheduler<F extends Record<string, unknown>> {
  private readonly opts: ResolvedOptions<F>;
  private readonly listeners = new Set<() => void>();
  private snapshot: LiveSaveSnapshot<F>;
  private value: F;
  private acceptedBase: F;
  private acceptedRevision: LiveSaveRevision;
  private enabled: boolean;
  private online = true;
  private visible = true;
  private destroyed = false;
  private suspended = false;
  private generation = 0;
  private inFlight: InFlight<F> | null = null;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private lastChangeAt = 0;
  private readonly firstDirtyAt = new Map<string, number>();
  private pendingRepresentation: F | null = null;
  private attempts = 0;
  private autoRebaseUsed = false;
  private authPaused = false;
  private goneBlocked = false;
  private failureMessage: string | null = null;
  private retryAt: number | null = null;
  private serverInvalidMessage: string | null = null;
  private conflict: LiveSaveConflict<F> | null = null;
  private savedAt: number | null = null;

  constructor(options: LiveSaveSchedulerOptions<F>) {
    this.opts = {
      ...options,
      // `??` per option: an explicitly-undefined override (for example the
      // hook forwarding `debounceMs: options.debounceMs`) must not clobber the
      // defaults.
      enabled: options.enabled ?? false,
      debounceMs: options.debounceMs ?? LIVE_SAVE_DEBOUNCE_MS,
      maxWaitMs: options.maxWaitMs ?? LIVE_SAVE_MAX_WAIT_MS,
      retryDelaysMs: options.retryDelaysMs ?? LIVE_SAVE_RETRY_DELAYS_MS,
      now: options.now ?? (() => Date.now()),
    };
    this.value = options.value;
    this.acceptedBase = options.base;
    this.acceptedRevision = options.baseRevision;
    this.enabled = this.opts.enabled;
    this.snapshot = this.buildSnapshot();
    this.refresh();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LiveSaveSnapshot<F> => this.snapshot;

  setValue(value: F): void {
    if (this.destroyed) return;
    const changed = this.opts.fields.some(
      (field) => !this.equal(value[field], this.value[field], field)
    );
    const hadPending = this.pendingRepresentation !== null;
    this.pendingRepresentation = null;
    if (!changed && !hadPending) return;
    this.value = value;
    this.lastChangeAt = this.now();
    // New input supersedes a rejected payload; scheduling starts fresh.
    this.serverInvalidMessage = null;
    this.failureMessage = null;
    this.retryAt = null;
    this.attempts = 0;
    if (this.conflict) {
      // Keep the review's "your version" column and resolution input current
      // while the user keeps typing.
      this.conflict = this.buildConflict(
        this.conflict.latest,
        this.conflict.latestRevision,
        this.conflict.base
      );
    }
    this.refresh();
  }

  /**
   * Server representation moved (remote activity, explicit save elsewhere, or
   * the surface applying an acknowledgement). Disjoint remote changes rebase;
   * overlapping ones enter conflict review instead of resetting the draft.
   */
  setBase(base: F, revision: LiveSaveRevision): void {
    if (this.destroyed) return;
    if (revision === this.acceptedRevision) return;
    const dirty = this.dirtyFields(this.effectiveValue());
    if (dirty.length === 0) {
      this.acceptedBase = base;
      this.acceptedRevision = revision;
      this.refresh();
      return;
    }
    if (this.conflict) {
      this.conflict = this.buildConflict(base, revision, this.conflict.base);
      this.emit();
      return;
    }
    this.handleServerChange(base, revision, { allowAutoRebase: true });
  }

  setEnabled(enabled: boolean): void {
    if (this.destroyed || enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.clearSendTimer();
      this.abortInFlight();
    }
    this.refresh();
  }

  setOnline(online: boolean): void {
    if (this.destroyed || online === this.online) return;
    this.online = online;
    this.refresh();
  }

  setVisible(visible: boolean): void {
    if (this.destroyed || visible === this.visible) return;
    this.visible = visible;
    this.refresh();
  }

  /**
   * Re-point the injected transport and surface callbacks at the latest render
   * instances (surfaces may pass fresh objects each render). The hook calls
   * this on every commit; they are read lazily at send and acknowledgement
   * time, so an update between scheduling and send takes effect.
   */
  setCallbacks(input: {
    adapter: LiveSaveAdapter<F>;
    applyRepresentation?: (representation: F, fields: string[]) => void;
    onAccepted?: (info: LiveSaveAcceptedInfo<F>) => void;
  }): void {
    if (this.destroyed) return;
    this.opts.adapter = input.adapter;
    this.opts.applyRepresentation = input.applyRepresentation;
    this.opts.onAccepted = input.onAccepted;
  }

  /** Entity or mode switch: drop all record state and adopt the new base. */
  reset(input: {
    value: F;
    base: F;
    baseRevision: LiveSaveRevision;
    enabled?: boolean;
  }): void {
    if (this.destroyed) return;
    this.generation += 1;
    this.abortInFlight();
    this.clearSendTimer();
    this.value = input.value;
    this.acceptedBase = input.base;
    this.acceptedRevision = input.baseRevision;
    if (input.enabled !== undefined) this.enabled = input.enabled;
    this.lastChangeAt = 0;
    this.firstDirtyAt.clear();
    this.pendingRepresentation = null;
    this.attempts = 0;
    this.autoRebaseUsed = false;
    this.authPaused = false;
    this.goneBlocked = false;
    this.failureMessage = null;
    this.retryAt = null;
    this.serverInvalidMessage = null;
    this.conflict = null;
    this.savedAt = null;
    this.refresh();
  }

  /** Detach from the DOM lifecycle without destroying the instance. */
  suspend(): void {
    if (this.destroyed) return;
    this.suspended = true;
    this.generation += 1;
    this.abortInFlight();
    this.clearSendTimer();
  }

  resume(): void {
    if (this.destroyed || !this.suspended) return;
    this.suspended = false;
    this.refresh();
  }

  /**
   * Explicit save: cancels timers, validates, and sends immediately through
   * the same conditional path. During a conflict it keeps every local value as
   * one guarded write against the displayed latest revision; it never
   * overwrites unconditionally.
   */
  async saveNow(): Promise<LiveSaveOutcome<F>> {
    if (this.destroyed || !this.enabled) return { status: "disabled" };
    if (this.conflict) {
      const choices: Record<string, LiveSaveConflictChoice> = {};
      for (const field of this.conflict.conflictingFields) choices[field] = "local";
      return this.resolveConflict(choices);
    }
    if (this.goneBlocked) return { status: "gone" };
    this.authPaused = false;
    this.attempts = 0;
    this.failureMessage = null;
    this.retryAt = null;
    this.serverInvalidMessage = null;
    this.clearSendTimer();
    return this.attemptSend("explicit");
  }

  /**
   * Apply per-field choices. Local values win for `local`; `latest` adopts the
   * server value. Remaining differences are submitted as one conditional write
   * against the displayed latest revision.
   */
  async resolveConflict(
    choices: Record<string, LiveSaveConflictChoice>
  ): Promise<LiveSaveOutcome<F>> {
    if (this.destroyed) return { status: "disabled" };
    const conflict = this.conflict;
    if (!conflict) return { status: "clean" };
    const conflictChoices: Record<string, LiveSaveConflictChoice> = {};
    for (const field of conflict.conflictingFields) {
      conflictChoices[field] = choices[field] ?? "latest";
    }
    const merged = { ...conflict.latest };
    const touchedFields = new Set([
      ...conflict.changedLocally,
      ...conflict.changedOnServer,
    ]);
    for (const field of this.opts.fields) {
      const keepsLocal =
        conflict.changedLocally.includes(field) &&
        !conflict.changedOnServer.includes(field);
      const choice = conflict.conflictingFields.includes(field)
        ? conflictChoices[field]
        : keepsLocal
          ? "local"
          : "latest";
      if (choice === "local") merged[field] = conflict.local[field];
    }
    const writeFields = this.opts.fields.filter(
      (field) =>
        touchedFields.has(field) &&
        !this.equal(merged[field], conflict.latest[field], field)
    );

    this.opts.applyRepresentation?.(merged, [...touchedFields]);
    this.conflict = null;
    this.acceptedBase = conflict.latest;
    this.acceptedRevision = conflict.latestRevision;
    this.pendingRepresentation = merged;
    this.autoRebaseUsed = false;
    this.clearSendTimer();

    if (writeFields.length === 0) {
      // The server already holds the merged representation; no write is sent,
      // but the surface baseline must still advance to it.
      this.opts.onAccepted?.({
        representation: merged,
        revision: conflict.latestRevision,
        submitted: merged,
        fullySynced: true,
      });
      this.refresh();
      return { status: "adopted", representation: merged };
    }
    return this.attemptSend("explicit", {
      fields: writeFields,
      submittedValue: merged,
      allowAutoRebase: false,
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.abortInFlight();
    this.clearSendTimer();
    this.listeners.clear();
  }

  private effectiveValue(): F {
    return this.pendingRepresentation ?? this.value;
  }

  private equal(a: unknown, b: unknown, field: string): boolean {
    return this.opts.isEqual
      ? this.opts.isEqual(a, b, field)
      : defaultFieldEqual(a, b);
  }

  private dirtyFields(value: F): string[] {
    return this.opts.fields.filter(
      (field) => !this.equal(value[field], this.acceptedBase[field], field)
    );
  }

  private changedFields(value: F, against: F): string[] {
    return this.opts.fields.filter(
      (field) => !this.equal(value[field], against[field], field)
    );
  }

  private now(): number {
    return this.opts.now();
  }

  private refresh(): void {
    if (this.destroyed) return;
    const dirty = this.dirtyFields(this.effectiveValue());
    const now = this.now();
    for (const field of this.opts.fields) {
      if (dirty.includes(field)) {
        if (!this.firstDirtyAt.has(field)) this.firstDirtyAt.set(field, now);
      } else {
        this.firstDirtyAt.delete(field);
      }
    }
    if (dirty.length === 0) {
      this.failureMessage = null;
      this.retryAt = null;
    }
    this.armSendTimer();
    this.emit();
  }

  private armSendTimer(): void {
    this.clearSendTimer();
    if (this.destroyed || this.suspended || !this.enabled) return;
    if (this.conflict || this.goneBlocked || this.authPaused) return;
    if (this.inFlight) return;
    // A non-retryable failure waits for a new edit or an explicit save.
    if (this.failureMessage !== null && this.retryAt === null) return;
    const value = this.effectiveValue();
    const dirty = this.dirtyFields(value);
    if (dirty.length === 0) return;
    if (!this.visible || !this.online) return;
    if (this.validationMessage(value) !== null) return;

    let target = this.lastChangeAt + this.opts.debounceMs;
    const oldest = this.oldestFirstDirtyAt();
    if (oldest !== null) {
      target = Math.min(target, oldest + this.opts.maxWaitMs);
    }
    if (this.retryAt !== null) target = this.retryAt;
    const delay = Math.max(0, target - this.now());
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      void this.attemptSend("autosave");
    }, delay);
  }

  private oldestFirstDirtyAt(): number | null {
    let oldest: number | null = null;
    for (const at of this.firstDirtyAt.values()) {
      if (oldest === null || at < oldest) oldest = at;
    }
    return oldest;
  }

  private validationMessage(value: F): string | null {
    if (this.serverInvalidMessage !== null) return this.serverInvalidMessage;
    const validation = this.opts.validate?.(value);
    return validation && !validation.valid ? validation.message : null;
  }

  private clearSendTimer(): void {
    if (this.sendTimer !== null) {
      clearTimeout(this.sendTimer);
      this.sendTimer = null;
    }
  }

  private abortInFlight(): void {
    if (this.inFlight) {
      this.inFlight.controller.abort();
      this.inFlight = null;
    }
  }

  private async attemptSend(
    intent: "autosave" | "explicit",
    override?: {
      fields?: string[];
      submittedValue?: F;
      allowAutoRebase?: boolean;
    }
  ): Promise<LiveSaveOutcome<F>> {
    if (this.destroyed || !this.enabled) return { status: "disabled" };
    if (this.inFlight) return { status: "busy" };
    if (this.conflict) return { status: "conflict" };
    if (this.goneBlocked) return { status: "gone" };
    const value = override?.submittedValue ?? this.effectiveValue();
    const fields = override?.fields ?? this.dirtyFields(value);
    if (fields.length === 0) return { status: "clean" };
    if (!this.online && intent !== "explicit") return { status: "offline" };
    const invalid = this.validationMessage(value);
    if (invalid !== null) {
      this.serverInvalidMessage = null;
      this.emit();
      return { status: "invalid", message: invalid };
    }

    const controller = new AbortController();
    const generation = this.generation;
    this.inFlight = {
      generation,
      controller,
      submittedValue: value,
      submittedFields: fields,
    };
    this.failureMessage = null;
    this.retryAt = null;
    this.serverInvalidMessage = null;
    this.emit();

    const partial: Partial<F> = {};
    for (const field of fields) {
      (partial as Record<string, unknown>)[field] = value[field];
    }
    let result;
    try {
      result = await this.opts.adapter.save({
        fields: partial,
        baseRevision: this.acceptedRevision,
        intent,
        signal: controller.signal,
      });
    } catch (error) {
      result = {
        kind: "failed" as const,
        message: error instanceof Error ? error.message : "Live save failed.",
        retryable: true,
      };
    }

    if (this.destroyed || this.suspended || generation !== this.generation) {
      return { status: "clean" };
    }
    const submitted = value;
    this.inFlight = null;

    switch (result.kind) {
      case "accepted": {
        this.acceptedBase = result.representation;
        this.acceptedRevision = result.revision;
        this.attempts = 0;
        this.autoRebaseUsed = false;
        this.savedAt = this.now();
        this.failureMessage = null;
        this.retryAt = null;
        const fullySynced =
          this.dirtyFields(this.effectiveValue()).length === 0;
        this.opts.onAccepted?.({
          representation: result.representation,
          revision: result.revision,
          submitted,
          fullySynced,
        });
        this.refresh();
        return { status: "accepted", revision: result.revision };
      }
      case "conflict":
        this.handleServerChange(result.latest.representation, result.latest.revision, {
          allowAutoRebase: override?.allowAutoRebase ?? true,
        });
        if (this.conflict === null) {
          // Disjoint server changes were rebased; retry once against the new
          // revision instead of waiting for the next timer.
          this.clearSendTimer();
          return this.attemptSend(intent, { allowAutoRebase: false });
        }
        return { status: "conflict" };
      case "invalid":
        this.serverInvalidMessage = result.message;
        this.failureMessage = null;
        this.retryAt = null;
        this.emit();
        return { status: "invalid", message: result.message };
      case "unauthorized":
        this.authPaused = true;
        this.failureMessage = null;
        this.retryAt = null;
        this.refresh();
        return { status: "unauthorized" };
      case "gone":
        this.goneBlocked = true;
        this.failureMessage = null;
        this.retryAt = null;
        this.refresh();
        return { status: "gone" };
      case "offline":
        this.online = false;
        this.refresh();
        return { status: "offline" };
      case "failed": {
        this.failureMessage = result.message;
        if (result.retryable) {
          const delays = this.opts.retryDelaysMs;
          const delay =
            delays[Math.min(this.attempts, delays.length - 1)] ??
            LIVE_SAVE_RETRY_DELAYS_MS[LIVE_SAVE_RETRY_DELAYS_MS.length - 1];
          this.attempts += 1;
          this.retryAt = this.now() + delay;
        } else {
          this.retryAt = null;
        }
        this.refresh();
        return {
          status: "failed",
          message: result.message,
          retryable: result.retryable,
        };
      }
    }
  }

  private handleServerChange(
    representation: F,
    revision: LiveSaveRevision,
    options: { allowAutoRebase: boolean }
  ): void {
    const changedLocally = this.changedFields(
      this.effectiveValue(),
      this.acceptedBase
    );
    const changedOnServer = this.changedFields(
      representation,
      this.acceptedBase
    );
    const conflictingFields = changedOnServer.filter((field) =>
      changedLocally.includes(field)
    );
    if (
      options.allowAutoRebase &&
      !this.autoRebaseUsed &&
      conflictingFields.length === 0
    ) {
      this.autoRebaseUsed = true;
      this.acceptedBase = representation;
      this.acceptedRevision = revision;
      // The surface applies the server fields asynchronously; adopt them
      // internally now so dirty-field computation (and the inline retry) never
      // resubmits a value the server already replaced.
      const adopted = { ...this.effectiveValue() };
      for (const field of changedOnServer) {
        (adopted as Record<string, unknown>)[field] = representation[field];
      }
      this.pendingRepresentation = null;
      this.value = adopted;
      this.opts.applyRepresentation?.(representation, changedOnServer);
      this.refresh();
      return;
    }
    this.conflict = {
      base: this.acceptedBase,
      local: this.effectiveValue(),
      latest: representation,
      latestRevision: revision,
      changedLocally,
      changedOnServer,
      conflictingFields,
    };
    this.autoRebaseUsed = false;
    this.clearSendTimer();
    this.emit();
  }

  private buildConflict(
    latest: F,
    latestRevision: LiveSaveRevision,
    base: F
  ): LiveSaveConflict<F> {
    const local = this.effectiveValue();
    const changedLocally = this.changedFields(local, base);
    const changedOnServer = this.changedFields(latest, base);
    return {
      base,
      local,
      latest,
      latestRevision,
      changedLocally,
      changedOnServer,
      conflictingFields: changedOnServer.filter((field) =>
        changedLocally.includes(field)
      ),
    };
  }

  private buildSnapshot(): LiveSaveSnapshot<F> {
    const value = this.effectiveValue();
    const dirty = this.dirtyFields(value);
    const invalidMessage = this.validationMessage(value);
    let phase: LiveSavePhase;
    if (!this.enabled) phase = "disabled";
    else if (this.conflict) phase = "conflict";
    else if (this.goneBlocked) phase = "gone-blocked";
    else if (this.authPaused) phase = "auth-paused";
    else if (this.inFlight) phase = "sending";
    else if (dirty.length === 0) phase = this.savedAt !== null ? "saved" : "clean";
    else if (!this.online) phase = "offline-paused";
    else if (!this.visible) phase = "hidden-paused";
    else if (invalidMessage !== null) phase = "invalid-paused";
    else if (this.failureMessage !== null) phase = "failed";
    else phase = "dirty";
    return {
      phase,
      enabled: this.enabled,
      dirtyFields: dirty,
      invalidMessage: phase === "invalid-paused" ? invalidMessage : null,
      failureMessage: phase === "failed" ? this.failureMessage : null,
      retryAt: phase === "failed" ? this.retryAt : null,
      conflict: this.conflict,
      savedAt: this.savedAt,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    if (this.destroyed || this.suspended) return;
    for (const listener of this.listeners) listener();
  }
}
