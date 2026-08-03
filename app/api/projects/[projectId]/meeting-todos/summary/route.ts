import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { getProjectMeetingTodoNavigationSummary } from "@/lib/services/project-meeting-todo-service";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ projectId: string }> }
) {
  const [{ projectId }, authenticatedUser] = await Promise.all([
    props.params,
    requireAuthenticatedApiUser(request),
  ]);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const summary = await getProjectMeetingTodoNavigationSummary({
    actorUserId: authenticatedUser.userId,
    projectId,
  });

  if (!summary) {
    return NextResponse.json(
      { error: "project-not-found" },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(summary, { headers: NO_STORE_HEADERS });
}
