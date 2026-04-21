import Image from "next/image";

import { buildGeneratedAvatarDataUri } from "@/lib/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  avatarSeed: string;
  displayName: string;
  className?: string;
  imageClassName?: string;
}

export function UserAvatar({
  avatarSeed,
  displayName,
  className,
  imageClassName,
}: UserAvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted",
        className
      )}
    >
      <Image
        src={buildGeneratedAvatarDataUri(avatarSeed)}
        alt={`${displayName} avatar`}
        width={64}
        height={64}
        unoptimized
        className={cn("h-full w-full object-cover", imageClassName)}
      />
    </span>
  );
}
