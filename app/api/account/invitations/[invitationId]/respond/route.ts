import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import { respondToProjectInvitation } from "@/lib/services/project-collaboration-service";

interface RespondToInvitationRequestBody {
  decision?: unknown;
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ invitationId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: RespondToInvitationRequestBody;
  try {
    payload = (await request.json()) as RespondToInvitationRequestBody;
  } catch (error) {
    logServerWarning(
      "POST /api/account/invitations/:invitationId/respond.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (payload.decision !== "accept" && payload.decision !== "decline") {
    return NextResponse.json({ error: "invalid-decision" }, { status: 400 });
  }

  const result = await respondToProjectInvitation({
    actorUserId: authenticatedUser.userId,
    invitationId: params.invitationId,
    decision: payload.decision,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: result.status });
}
