import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function DashboardStatCard({
  icon: Icon,
  label,
  value,
  className,
  accentClassName,
  valueClassName,
  labelTrailing,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  className?: string;
  accentClassName?: string;
  valueClassName?: string;
  labelTrailing?: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-border/60 bg-background/55 px-3 py-3 backdrop-blur-sm sm:px-4 ${accentClassName ?? ""} ${className ?? ""}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase leading-4 tracking-[0.16em] text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        {labelTrailing}
      </div>
      <p
        className={`break-words text-lg font-semibold tracking-tight text-foreground sm:text-xl ${valueClassName ?? ""}`}
      >
        {value}
      </p>
    </div>
  );
}
