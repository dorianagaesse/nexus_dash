import { Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatProjectCollaboratorRole } from "@/lib/project-collaborator-role";
import type { ProjectCollaboratorIdentitySummary } from "@/lib/services/project-service";
import { cn } from "@/lib/utils";

interface ProjectCollaborationPresenceProps {
  members: ProjectCollaboratorIdentitySummary[];
  actorUserId: string;
}

const VISIBLE_AVATAR_COUNT = 5;
const VISIBLE_MEMBER_ROWS = 4;

function formatMemberCount(count: number): string {
  return `${count} member${count === 1 ? "" : "s"}`;
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

  const actor = members.find((member) => member.id === actorUserId) ?? null;
  const visibleAvatars = members.slice(0, VISIBLE_AVATAR_COUNT);
  const visibleRows = members.slice(0, VISIBLE_MEMBER_ROWS);
  const hiddenAvatarCount = Math.max(0, members.length - visibleAvatars.length);
  const hiddenRowCount = Math.max(0, members.length - visibleRows.length);
  const summary = actor
    ? `You are ${formatProjectCollaboratorRole(actor.projectRole).toLowerCase()}`
    : "Project access";

  return (
    <section
      aria-label="Project collaborators"
      className="min-w-0 space-y-3 rounded-2xl bg-background/55 px-3.5 py-3 shadow-sm ring-1 ring-border/60 backdrop-blur sm:min-w-72"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <p className="sr-only">
            {members
              .map((member) => buildMemberLabel(member, member.id === actorUserId))
              .join("; ")}
          </p>
          <div className="flex -space-x-2" aria-hidden="true">
            {visibleAvatars.map((member) => {
              const isActor = member.id === actorUserId;

              return (
                <UserAvatar
                  key={member.id}
                  avatarSeed={member.avatarSeed}
                  displayName={member.displayName}
                  title={buildMemberLabel(member, isActor)}
                  className={cn(
                    "h-8 w-8 border-2 border-background shadow-sm",
                    isActor ? "ring-2 ring-primary/55" : null
                  )}
                  decorative
                />
              );
            })}
            {hiddenAvatarCount > 0 ? (
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-semibold text-muted-foreground shadow-sm"
                title={`${hiddenAvatarCount} more collaborator${hiddenAvatarCount === 1 ? "" : "s"}`}
              >
                +{hiddenAvatarCount}
              </span>
            ) : null}
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="truncate text-sm font-medium">
                {formatMemberCount(members.length)}
              </p>
            </div>
            <p className="truncate text-xs text-muted-foreground">{summary}</p>
          </div>
        </div>

        {actor ? (
          <Badge variant="outline" className="shrink-0 capitalize">
            You
          </Badge>
        ) : null}
      </div>

      <ul
        aria-hidden="true"
        className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
      >
        {visibleRows.map((member) => {
          const isActor = member.id === actorUserId;

          return (
            <li
              key={member.id}
              className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-background/60 px-2 py-1.5"
            >
              <span className="min-w-0 truncate text-xs font-medium">
                {member.displayName}
                {isActor ? " (you)" : ""}
              </span>
              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                {formatProjectCollaboratorRole(member.projectRole)}
              </span>
            </li>
          );
        })}
        {hiddenRowCount > 0 ? (
          <li className="flex min-w-0 items-center rounded-md bg-background/60 px-2 py-1.5 text-xs font-medium text-muted-foreground">
            +{hiddenRowCount} more
          </li>
        ) : null}
      </ul>
    </section>
  );
}
