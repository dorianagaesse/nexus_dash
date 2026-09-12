import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { logServerWarning } from "@/lib/observability/logger";
import {
  parseResponsibilityResolution,
  transferProjectOwnership,
} from "@/lib/services/project-offboarding-service";

interface TransferOwnershipRequestBody {
  newOwnerMembershipId?: unknown;
  previousOwnerLeaves?: unknown;
  responsibilityResolution?: unknown;
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  let payload: TransferOwnershipRequestBody;
  try {
    payload = (await request.json()) as TransferOwnershipRequestBody;
  } catch (error) {
    logServerWarning(
      "POST /api/projects/:projectId/ownership/transfer.invalidJson",
      "Invalid JSON payload",
      { error }
    );
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (typeof payload.previousOwnerLeaves !== "boolean") {
    return NextResponse.json(
      { error: "invalid-leave-choice" },
      { status: 400 }
    );
  }

  const result = await transferProjectOwnership({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    newOwnerMembershipId:
      typeof payload.newOwnerMembershipId === "string"
        ? payload.newOwnerMembershipId
        : "",
    previousOwnerLeaves: payload.previousOwnerLeaves,
    responsibilityResolution: parseResponsibilityResolution(
      payload.responsibilityResolution
    ),
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, inventory: result.inventory },
      { status: result.status }
    );
  }

  return NextResponse.json(result.data);
}
