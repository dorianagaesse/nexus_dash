import Image from "next/image";

import { buildGeneratedAvatarDataUri } from "@/lib/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  avatarSeed: string;
  displayName: string;
  className?: string;
  imageClassName?: string;
  decorative?: boolean;
}

export function UserAvatar({
  avatarSeed,
  displayName,
  className,
  imageClassName,
  decorative = false,
}: UserAvatarProps) {
  return (
    <span
      aria-hidden={decorative}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted",
        className
      )}
    >
      <Image
        src={buildGeneratedAvatarDataUri(avatarSeed)}
        alt={decorative ? "" : `${displayName} avatar`}
        width={64}
        height={64}
        unoptimized
        className={cn("h-full w-full object-cover", imageClassName)}
      />
    </span>
  );
}
