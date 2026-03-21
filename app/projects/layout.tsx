import { PendingProjectInvitationsBanner } from "@/components/pending-project-invitations-banner";
import { requireVerifiedSessionUserIdFromServer } from "@/lib/auth/server-guard";

export const dynamic = "force-dynamic";

export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actorUserId = await requireVerifiedSessionUserIdFromServer();

  return (
    <>
      <div className="container pt-6">
        <PendingProjectInvitationsBanner actorUserId={actorUserId} />
      </div>
      {children}
    </>
  );
}
