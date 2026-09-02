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
  borderless?: boolean;
}

export function MeetingParticipantStewardAffordance({
  isSteward,
  tooltipId,
}: {
  isSteward: boolean;
  tooltipId?: string;
}) {
  return (
    <>
      {isSteward ? (
        <span
          className="pointer-events-none absolute -left-1.5 -top-1.5 z-10 inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-200 bg-amber-400 text-amber-950 shadow-sm dark:border-amber-700"
          aria-hidden="true"
        >
          <Crown className="h-2.5 w-2.5" strokeWidth={2.5} />
        </span>
      ) : null}
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+6px)] z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md ring-1 ring-border transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {isSteward ? "Steward" : "Make steward"}
      </span>
    </>
  );
}

export function MeetingParticipantAvatar({
  participant,
  className,
  decorative = false,
  borderless = false,
}: MeetingParticipantAvatarProps) {
  return participant.userId && participant.avatarSeed ? (
    <UserAvatar
      avatarSeed={participant.avatarSeed}
      displayName={participant.displayName}
      className={cn(className, borderless && "border-0")}
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
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary",
        !borderless && "border border-border/60",
        className
      )}
    >
      {getMeetingParticipantInitials(participant.displayName)}
    </span>
  );
}
