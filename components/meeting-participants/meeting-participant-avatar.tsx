import { Crown } from "lucide-react";

import { UserAvatar } from "@/components/ui/user-avatar";
import {
  getMeetingParticipantInitials,
  type ProjectMeetingParticipantIdentity,
} from "@/lib/meeting-participant";
import { cn } from "@/lib/utils";

interface MeetingParticipantAvatarProps {
  participant: ProjectMeetingParticipantIdentity;
  className?: string;
  decorative?: boolean;
  isSteward?: boolean;
}

export function MeetingParticipantAvatar({
  participant,
  className,
  decorative = false,
  isSteward = false,
}: MeetingParticipantAvatarProps) {
  const avatar =
    participant.userId && participant.avatarSeed ? (
      <UserAvatar
        avatarSeed={participant.avatarSeed}
        displayName={participant.displayName}
        className={className}
        decorative={decorative}
      />
    ) : (
      <span
        {...(decorative
          ? { "aria-hidden": true as const }
          : {
              role: "img" as const,
              "aria-label": `${participant.displayName} initials avatar`,
            })}
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-primary/10 font-semibold text-primary",
          className
        )}
      >
        {getMeetingParticipantInitials(participant.displayName)}
      </span>
    );

  if (!isSteward) {
    return avatar;
  }

  return (
    <span className="relative inline-flex shrink-0 rounded-full ring-2 ring-amber-400 ring-offset-1 ring-offset-background">
      {avatar}
      <span
        className="absolute -bottom-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-200 bg-amber-400 text-amber-950 shadow-sm dark:border-amber-700"
        aria-hidden="true"
      >
        <Crown className="h-2.5 w-2.5" strokeWidth={2.5} />
      </span>
    </span>
  );
}
