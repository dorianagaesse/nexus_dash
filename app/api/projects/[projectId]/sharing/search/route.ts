import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { searchInvitableUsersForProject } from "@/lib/services/project-collaboration-service";

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const result = await searchInvitableUsersForProject({
    actorUserId: authenticatedUser.userId,
    projectId: params.projectId,
    query: request.nextUrl.searchParams.get("query") ?? "",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
