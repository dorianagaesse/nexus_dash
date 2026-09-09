import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import {
  getProjectResponsibilityInventory,
  isOffboardingActorKind,
} from "@/lib/services/project-offboarding-service";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const params = await props.params;
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const actorKind = request.nextUrl.searchParams.get("actorKind");
  const actorId = request.nextUrl.searchParams.get("actorId") ?? "";
  if (!isOffboardingActorKind(actorKind)) {
    return NextResponse.json({ error: "invalid-actor-kind" }, { status: 400 });
  }

  const result = await getProjectResponsibilityInventory({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    actorKind,
    actorId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(result.data);
}
