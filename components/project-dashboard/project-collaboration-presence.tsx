import { UserAvatar } from "@/components/ui/user-avatar";
import { formatProjectCollaboratorRole } from "@/lib/project-collaborator-role";
import type { ProjectCollaboratorIdentitySummary } from "@/lib/services/project-service";
import { cn } from "@/lib/utils";

interface ProjectCollaborationPresenceProps {
  members: ProjectCollaboratorIdentitySummary[];
  actorUserId: string;
}

function buildMemberLabel(
  member: ProjectCollaboratorIdentitySummary,
  isActor: boolean
): string {
  const role = formatProjectCollaboratorRole(member.projectRole);
  return `${member.displayName}${isActor ? " (you)" : ""}, ${role}`;
}

export function ProjectCollaborationPresence({
  members,
  actorUserId,
}: ProjectCollaborationPresenceProps) {
  if (members.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Project collaborators"
      className="flex min-w-0 justify-end"
    >
      <p className="sr-only">
        {members
          .map((member) => buildMemberLabel(member, member.id === actorUserId))
          .join("; ")}
      </p>
      <div className="flex -space-x-2" aria-hidden="true">
        {members.map((member) => {
          const isOwner = member.projectRole === "owner";

          return (
            <UserAvatar
              key={member.id}
              avatarSeed={member.avatarSeed}
              displayName={member.displayName}
              title={member.usernameTag ?? member.displayName}
              className={cn(
                "h-8 w-8 shadow-sm",
                isOwner
                  ? "relative z-10 border-2 border-primary"
                  : "border-0"
              )}
              decorative
            />
          );
        })}
      </div>
    </section>
  );
}
