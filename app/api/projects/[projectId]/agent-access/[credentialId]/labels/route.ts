import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { updateProjectAgentCredentialDescriptiveLabels } from "@/lib/services/project-agent-access-service";

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ projectId: string; credentialId: string }> }
) {
  const actor = await requireAuthenticatedApiUser(request);
  if (!actor.ok) return actor.response;
  const params = await props.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || !("descriptiveLabels" in payload)) {
    return NextResponse.json({ error: "invalid-descriptive-labels" }, { status: 400 });
  }
  const result = await updateProjectAgentCredentialDescriptiveLabels({
    actorUserId: actor.userId,
    projectId: params.projectId,
    credentialId: params.credentialId,
    descriptiveLabels: payload.descriptiveLabels,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
