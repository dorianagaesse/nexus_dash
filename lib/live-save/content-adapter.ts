import { CONTENT_IF_MATCH_HEADER, contentEtag, type ContentDomain } from "@/lib/content-revision";
import { fetchProjectActivityMutation } from "@/lib/project-activity-client";
import type {
  LiveSaveAdapter,
  LiveSaveIntent,
  LiveSaveRevision,
  LiveSaveWriteResult,
} from "./types";

export interface ContentSaveAdapterConfig<F extends Record<string, unknown>> {
  domain: ContentDomain;
  entityId: string;
  url: string;
  /** When set, accepted writes also acknowledge realtime project activity. */
  projectId?: string | null;
  /**
   * Map the scheduler's dirty surface fields to the PATCH body. Implementations
   * add command fields only for `explicit` intent; timed autosaves must carry
   * only the content fields from the ND-432 surface matrix.
   */
  buildPayload: (
    fields: Partial<F>,
    intent: LiveSaveIntent
  ) => Record<string, unknown> | null;
  /** Read the authoritative representation and revision from a 2xx body. */
  mapAccepted: (body: unknown) => ContentSaveAccepted<F> | null;
  /** Read the authorized current representation from a 412 `edit-conflict` body. */
  mapConflict: (body: unknown) => ContentSaveAccepted<F> | null;
  fetchImpl?: typeof fetch;
}

export interface ContentSaveAccepted<F extends Record<string, unknown>> {
  representation: F;
  revision: LiveSaveRevision;
}

const CONTRACT_VIOLATION_CODES = new Set([
  "edit-precondition-transport",
  "edit-precondition-invalid",
  "edit-precondition-required",
  "invalid-json",
  "invalid-request-body",
]);

function toRevisionNumber(revision: LiveSaveRevision): number | null {
  const raw = typeof revision === "number" ? String(revision) : revision;
  if (!/^(0|[1-9]\d*)$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= 2_147_483_647 ? value : null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" && error ? error : null;
}

function failed(message: string, retryable: boolean): LiveSaveWriteResult<never> {
  return { kind: "failed", message, retryable };
}

/**
 * Transport-only adapter for ND-565 conditional content PATCHes. The caller
 * owns field selection and response shape; this module owns the ETag
 * precondition, mutation intent header, and the status mapping required by
 * `LiveSaveAdapter`.
 */
export function createContentSaveAdapter<F extends Record<string, unknown>>(
  config: ContentSaveAdapterConfig<F>
): LiveSaveAdapter<F> {
  return {
    async save(input): Promise<LiveSaveWriteResult<F>> {
      const revision = toRevisionNumber(input.baseRevision);
      if (revision === null) {
        return failed("The saved revision is unavailable.", false);
      }
      let body: Record<string, unknown> | null;
      try {
        body = config.buildPayload(input.fields, input.intent);
      } catch {
        return failed("The change could not be prepared.", false);
      }
      if (!body || Object.keys(body).length === 0) {
        return failed("There are no changes to save.", false);
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return { kind: "offline" };
      }

      const init: RequestInit = {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          [CONTENT_IF_MATCH_HEADER]: contentEtag(config.domain, config.entityId, revision),
          "NexusDash-Mutation-Intent": input.intent,
        },
        body: JSON.stringify(body),
        signal: input.signal,
      };

      let response: Response;
      try {
        response = config.projectId
          ? await fetchProjectActivityMutation(config.projectId, config.url, init)
          : await (config.fetchImpl ?? fetch)(config.url, init);
      } catch {
        if (input.signal.aborted) {
          return failed("The save was cancelled.", true);
        }
        return { kind: "offline" };
      }

      const responseBody = await readJson(response);
      if (response.ok) {
        const accepted = config.mapAccepted(responseBody);
        if (!accepted) {
          return failed("The save response was incomplete.", false);
        }
        return {
          kind: "accepted",
          revision: accepted.revision,
          representation: accepted.representation,
        };
      }

      if (response.status === 412) {
        const conflict = config.mapConflict(responseBody);
        if (conflict) {
          return {
            kind: "conflict",
            latest: {
              revision: conflict.revision,
              representation: conflict.representation,
            },
          };
        }
        return failed("The save precondition was rejected.", false);
      }

      const errorCode = readErrorCode(responseBody);
      if (response.status === 401 || response.status === 403) {
        return { kind: "unauthorized" };
      }
      if (response.status === 404) {
        return { kind: "gone" };
      }
      if (response.status === 400 || response.status === 422) {
        if (errorCode && CONTRACT_VIOLATION_CODES.has(errorCode)) {
          return failed(errorCode, false);
        }
        return {
          kind: "invalid",
          message: errorCode ?? "The server rejected this change.",
        };
      }
      if (response.status >= 500) {
        return failed(errorCode ?? "The save failed.", true);
      }
      return failed(errorCode ?? "The save contract was not honoured.", false);
    },
  };
}
