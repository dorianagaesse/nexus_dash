import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { startServerTiming } from "@/lib/observability/server-timing";
import { searchProjectTaskIds } from "@/lib/services/project-task-search-service";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const timing = startServerTiming("tasks.search");
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const { projectId } = await props.params;
  const result = await searchProjectTaskIds({
    actorUserId: authenticatedUser.userId,
    projectId,
    query: request.nextUrl.searchParams.get("q") ?? "",
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: timing.headers() }
    );
  }

  return NextResponse.json(result.data, { headers: timing.headers() });
}
