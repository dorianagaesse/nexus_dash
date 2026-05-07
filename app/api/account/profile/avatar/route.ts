import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedApiUser } from "@/lib/auth/api-guard";
import { regenerateAccountAvatar } from "@/lib/services/account-profile-service";

export async function POST(request: NextRequest) {
  const authenticatedUser = await requireAuthenticatedApiUser(request);
  if (!authenticatedUser.ok) {
    return authenticatedUser.response;
  }

  const result = await regenerateAccountAvatar({
    actorUserId: authenticatedUser.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ avatar: result.data }, { status: result.status });
}
