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
      className={`min-w-0 rounded-2xl border border-border/60 bg-background/55 px-3 py-3 backdrop-blur-sm sm:px-4 ${accentClassName ?? ""} ${className ?? ""}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium uppercase leading-4 tracking-[0.12em] text-muted-foreground sm:text-[11px] xl:text-[10px] 2xl:text-[11px]">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate whitespace-nowrap">{label}</span>
        </div>
        {labelTrailing}
      </div>
      <p
        className={`truncate whitespace-nowrap text-lg font-semibold tracking-tight text-foreground sm:text-xl xl:text-lg 2xl:text-xl ${valueClassName ?? ""}`}
      >
        {value}
      </p>
    </div>
  );
}
