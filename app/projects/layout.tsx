import { NotificationAwarenessBanner } from "@/components/notification-awareness-banner";
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
        <NotificationAwarenessBanner actorUserId={actorUserId} />
      </div>
      {children}
    </>
  );
}
