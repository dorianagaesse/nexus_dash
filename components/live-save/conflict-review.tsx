"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  LiveSaveConflict,
  LiveSaveConflictChoice,
  LiveSaveFieldMetaMap,
} from "@/lib/live-save/types";

export function formatLiveSaveFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

/**
 * Long values are shown in full inside a bounded, keyboard-scrollable box: the
 * user must be able to compare versions that only differ past any prefix.
 */
function FieldValuePreview({ value }: { value: unknown }) {
  return (
    <span
      className="mt-0.5 block max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap break-words"
      tabIndex={0}
    >
      {formatLiveSaveFieldValue(value)}
    </span>
  );
}

function defaultChoices(conflictingFields: string[]): Record<string, LiveSaveConflictChoice> {
  const choices: Record<string, LiveSaveConflictChoice> = {};
  for (const field of conflictingFields) choices[field] = "local";
  return choices;
}

export interface ConflictReviewProps<F extends Record<string, unknown>> {
  conflict: LiveSaveConflict<F>;
  fieldMeta?: LiveSaveFieldMetaMap<F>;
  pending?: boolean;
  onResolve: (choices: Record<string, LiveSaveConflictChoice>) => void;
}

/**
 * Conflict review preserving both versions (ND-432 section 4.5). Local values
 * are the default; "Keep my version" is submitted as a new conditional write
 * against the displayed latest revision, never as a force overwrite. Rich
 * text is presented as an indivisible field.
 */
export function ConflictReview<F extends Record<string, unknown>>({
  conflict,
  fieldMeta,
  pending = false,
  onResolve,
}: ConflictReviewProps<F>) {
  const [choices, setChoices] = useState<Record<string, LiveSaveConflictChoice>>(
    () => defaultChoices(conflict.conflictingFields)
  );
  useEffect(() => {
    setChoices(defaultChoices(conflict.conflictingFields));
  }, [conflict]);

  const labelFor = (field: string) =>
    fieldMeta?.[field as keyof F & string]?.label ?? field;
  const isRichText = (field: string) =>
    fieldMeta?.[field as keyof F & string]?.richText ?? false;
  const serverOnly = conflict.changedOnServer.filter(
    (field) => !conflict.conflictingFields.includes(field)
  );
  const localOnly = conflict.changedLocally.filter(
    (field) => !conflict.conflictingFields.includes(field)
  );

  return (
    <section
      aria-label="Resolve conflicting changes"
      data-conflict-review
      className="space-y-3 rounded-md border border-destructive/40 bg-muted/50 p-3 text-sm"
    >
      <p>
        Someone else saved changes to this record while your draft was open.
        Nothing was overwritten; both versions are kept below.
      </p>
      {serverOnly.length > 0 ? (
        <div>
          <p className="font-medium">Updated elsewhere (your draft did not touch these)</p>
          <ul className="mt-1 space-y-1">
            {serverOnly.map((field) => (
              <li key={field}>
                <span className="font-medium">{labelFor(field)}</span>:
                <FieldValuePreview value={conflict.latest[field]} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {localOnly.length > 0 ? (
        <div>
          <p className="font-medium">Your unsaved changes (saved as is)</p>
          <ul className="mt-1 space-y-1">
            {localOnly.map((field) => (
              <li key={field}>
                <span className="font-medium">{labelFor(field)}</span>:
                <FieldValuePreview value={conflict.local[field]} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {conflict.conflictingFields.map((field) => {
        const groupId = `conflict-${String(conflict.latestRevision)}-${field}`;
        return (
          <fieldset key={field} className="space-y-1">
            <legend className="font-medium">
              {labelFor(field)}
              {isRichText(field) ? (
                <span className="text-muted-foreground">
                  {" "}
                  (rich text - kept as a whole, never merged automatically)
                </span>
              ) : null}
            </legend>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                className="mt-1"
                name={groupId}
                checked={choices[field] === "local"}
                onChange={() =>
                  setChoices((current) => ({ ...current, [field]: "local" }))
                }
              />
              <span>
                Keep my version
                <FieldValuePreview value={conflict.local[field]} />
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                className="mt-1"
                name={groupId}
                checked={choices[field] === "latest"}
                onChange={() =>
                  setChoices((current) => ({ ...current, [field]: "latest" }))
                }
              />
              <span>
                Use latest
                <FieldValuePreview value={conflict.latest[field]} />
              </span>
            </label>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onResolve(latestForAll(conflict))}
        >
          Use latest for all conflicts
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => onResolve(choices)}
        >
          {pending ? "Saving..." : "Apply and save"}
        </Button>
      </div>
    </section>
  );
}

function latestForAll<F extends Record<string, unknown>>(
  conflict: LiveSaveConflict<F>
): Record<string, LiveSaveConflictChoice> {
  const choices: Record<string, LiveSaveConflictChoice> = {};
  for (const field of conflict.conflictingFields) choices[field] = "latest";
  return choices;
}
