import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { AutoDismissingAlert } from "@/components/auto-dismissing-alert";
import { logServerError } from "@/lib/observability/logger";
import { listPendingProjectInvitationsForUser } from "@/lib/services/project-collaboration-service";

interface PendingProjectInvitationsBannerProps {
  actorUserId: string;
}

export async function PendingProjectInvitationsBanner({
  actorUserId,
}: PendingProjectInvitationsBannerProps) {
  noStore();
  let result;
  try {
    result = await listPendingProjectInvitationsForUser(actorUserId);
  } catch (error) {
    logServerError(
      "PendingProjectInvitationsBanner.listPendingProjectInvitationsForUser",
      error
    );
    return null;
  }

  if (!result.ok || result.data.invitations.length === 0) {
    return null;
  }

  const firstInvitation = result.data.invitations[0];
  const extraCount = result.data.invitations.length - 1;
  const baseMessage =
    firstInvitation.role === "viewer"
      ? `${firstInvitation.invitedByDisplayName} invited you to view ${firstInvitation.projectName}.`
      : `${firstInvitation.invitedByDisplayName} invited you to collaborate on ${firstInvitation.projectName}.`;
  const message =
    extraCount > 0 ? `${baseMessage} +${extraCount} more pending invite${extraCount === 1 ? "" : "s"}.` : baseMessage;

  return (
    <AutoDismissingAlert
      message={
        <>
          {message}{" "}
          <Link
            href="/account#project-invitations"
            className="font-medium underline underline-offset-4"
          >
            Review invitations
          </Link>
        </>
      }
      className="rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-700 dark:text-sky-200"
    />
  );
}
