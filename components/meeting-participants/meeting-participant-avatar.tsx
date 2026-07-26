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
}

export function MeetingParticipantAvatar({
  participant,
  className,
  decorative = false,
}: MeetingParticipantAvatarProps) {
  if (participant.userId && participant.avatarSeed) {
    return (
      <UserAvatar
        avatarSeed={participant.avatarSeed}
        displayName={participant.displayName}
        className={className}
        decorative={decorative}
      />
    );
  }

  const accessibleProps = decorative
    ? { "aria-hidden": true as const }
    : {
        role: "img" as const,
        "aria-label": `${participant.displayName} initials avatar`,
      };

  return (
    <span
      {...accessibleProps}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-primary/10 font-semibold text-primary",
        className
      )}
    >
      {getMeetingParticipantInitials(participant.displayName)}
    </span>
  );
}
