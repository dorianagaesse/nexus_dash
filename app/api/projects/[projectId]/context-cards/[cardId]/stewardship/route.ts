import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import {
  isContextCardActorReference,
  type ContextCardActorReference,
} from "@/lib/context-card-actor";
import { logServerWarning } from "@/lib/observability/logger";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import { assignContextCardSteward } from "@/lib/services/context-card-stewardship-service";

interface ContextCardStewardshipRequestBody {
  steward?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; cardId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }
  const actorUserId = principalResult.principal.actorUserId;
  const agentAccess = getAgentProjectAccessContext(principalResult.principal);
  const { projectId, cardId } = params;
  if (!projectId || !cardId) {
    return NextResponse.json({ error: "Missing route parameters" }, { status: 400 });
  }

  let payload: ContextCardStewardshipRequestBody;
  try {
    const parsedPayload: unknown = await request.json();
    if (!isRecord(parsedPayload)) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    payload = parsedPayload;
  } catch (error) {
    logServerWarning(
      "PATCH /api/projects/:projectId/context-cards/:cardId/stewardship.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!Object.prototype.hasOwnProperty.call(payload, "steward")) {
    return NextResponse.json(
      { error: "context-card-stewardship-missing" },
      { status: 400 }
    );
  }

  const stewardRaw = payload.steward;
  let steward: ContextCardActorReference | null;
  if (stewardRaw === null) {
    steward = null;
  } else if (isContextCardActorReference(stewardRaw)) {
    steward = stewardRaw;
  } else {
    return NextResponse.json(
      { error: "context-card-steward-invalid" },
      { status: 400 }
    );
  }

  const result = await assignContextCardSteward({
    actorUserId,
    projectId,
    cardId,
    steward,
    agentAccess,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const version = await recordProjectActivityEventVersion({
    actorUserId,
    projectId,
    domain: "context-card",
    action: "updated",
    entityId: cardId,
    payload: {
      card: {
        id: result.data.cardId,
        updatedAt: result.data.updatedAt.toISOString(),
        projection: {
          ...result.data.projection,
          review: {
            ...result.data.projection.review,
            lastEditedAt:
              result.data.projection.review.lastEditedAt.toISOString(),
          },
          attachments: result.data.projection.attachments.map((attachment) => ({
            ...attachment,
            uploadedAt: attachment.uploadedAt.toISOString(),
          })),
        },
      },
      change: "stewardship",
      steward: result.data.steward
        ? {
            kind: result.data.steward.kind,
            id: result.data.steward.id,
          }
        : null,
    },
  });

  return NextResponse.json(
    {
      cardId: result.data.cardId,
      steward: result.data.steward,
      review: {
        needsReview: result.data.needsReview,
        thresholdDays: result.data.thresholdDays,
        lastEditedAt: result.data.lastEditedAt.toISOString(),
      },
      updatedAt: result.data.updatedAt.toISOString(),
    },
    {
      headers: withProjectActivityVersionHeader(new Headers(), version),
    }
  );
}
