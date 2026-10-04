import { NextRequest, NextResponse } from "next/server";

import {
  getAgentProjectAccessContext,
  requireApiPrincipal,
} from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { isProjectActorReference } from "@/lib/project-actor";
import { recordProjectActivityEventVersion } from "@/lib/project-activity-event-response";
import { withProjectActivityVersionHeader } from "@/lib/project-activity-version";
import {
  assignProjectEpicLead,
  type ProjectEpicLeadChange,
} from "@/lib/services/project-epic-service";
import {
  serializeProjectEpicEventActor,
  serializeProjectEpicResponse,
} from "@/lib/services/project-epic-response";

interface EpicLeadRequestBody {
  lead?: unknown;
}

function serializeLeadChangeActor(
  actor: ProjectEpicLeadChange["previous"]
) {
  return actor ? serializeProjectEpicEventActor(actor) : null;
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; epicId: string }> }
) {
  const params = await props.params;
  const principalResult = await requireApiPrincipal(request);
  if (!principalResult.ok) {
    return principalResult.response;
  }

  let payload: EpicLeadRequestBody;
  try {
    payload = (await request.json()) as EpicLeadRequestBody;
  } catch (error) {
    logServerWarning(
      "PATCH /api/projects/:projectId/epics/:epicId/lead.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json(
      { error: "epic-lead-required" },
      { status: 400 }
    );
  }

  if (payload.lead === undefined) {
    return NextResponse.json(
      { error: "epic-lead-required" },
      { status: 400 }
    );
  }

  if (!isProjectActorReference(payload.lead)) {
    return NextResponse.json(
      { error: "epic-lead-invalid" },
      { status: 400 }
    );
  }

  const result = await assignProjectEpicLead({
    actorUserId: principalResult.principal.actorUserId,
    projectId: params.projectId,
    epicId: params.epicId,
    lead: { kind: payload.lead.kind, id: payload.lead.id.trim() },
    agentAccess: getAgentProjectAccessContext(principalResult.principal),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const serializedEpic = serializeProjectEpicResponse(result.data.epic);
  const leadChange = result.data.leadChange;
  const version = leadChange
    ? await recordProjectActivityEventVersion({
        actorUserId: principalResult.principal.actorUserId,
        projectId: params.projectId,
        domain: "epic",
        action: "updated",
        entityId: params.epicId,
        payload: {
          epic: serializedEpic,
          actor: serializeProjectEpicEventActor(result.data.actor),
          leadChange: {
            previous: serializeLeadChangeActor(leadChange.previous),
            next: serializeLeadChangeActor(leadChange.next),
          },
        },
      })
    : undefined;

  return NextResponse.json(
    {
      epic: serializedEpic,
    },
    {
      headers: withProjectActivityVersionHeader(undefined, version),
    }
  );
}
