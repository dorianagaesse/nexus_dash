import { cn } from "@/lib/utils";

interface ProductStateBadgeProps {
  className?: string;
}

export function ProductStateBadge({ className }: ProductStateBadgeProps) {
  return (
    <span
      data-product-state="alpha"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-[0.12em] text-primary",
        className
      )}
    >
      Alpha
    </span>
  );
}
