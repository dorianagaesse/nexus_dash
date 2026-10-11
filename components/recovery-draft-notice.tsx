"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { RecoveryDraftState } from "@/lib/hooks/use-recovery-draft";

export function RecoveryDraftNotice({
  draft,
  onDiscard,
}: {
  draft: RecoveryDraftState;
  onDiscard: () => void;
}) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  if (!draft.restored && !draft.locallyStored && !draft.conflict && !draft.error) return null;
  return (
    <div role="status" className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
      {draft.conflict ? (
        <p>Another version of this draft or saved record exists. Your changes are kept locally. Check the current record before saving.</p>
      ) : draft.restored ? (
        <p>Draft restored from this browser.</p>
      ) : draft.locallyStored ? (
        <p>Draft saved locally in this browser.</p>
      ) : null}
      {draft.error ? <p className="text-destructive">{draft.error}</p> : null}
      {draft.incompatibleDraft ? <details className="mt-2">
        <summary className="cursor-pointer">View draft data to copy</summary>
        <textarea readOnly aria-label="Saved draft data" value={draft.incompatibleDraft} className="mt-2 min-h-24 w-full rounded border bg-background p-2 font-mono text-xs" />
      </details> : null}
      <div className="mt-2 flex gap-2">
        {draft.conflict ? (
          <Button type="button" size="sm" variant="outline" onClick={draft.acceptConflict}>
            I reviewed; keep my changes
          </Button>
        ) : null}
        {(draft.restored || draft.conflict || draft.incompatibleDraft) ? (
          confirmingDiscard ? <>
            <Button type="button" size="sm" variant="destructive" onClick={() => { onDiscard(); setConfirmingDiscard(false); }}>
              Confirm discard
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingDiscard(false)}>
              Keep draft
            </Button>
          </> : <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingDiscard(true)}>
            Discard draft
          </Button>
        ) : null}
      </div>
    </div>
  );
}
