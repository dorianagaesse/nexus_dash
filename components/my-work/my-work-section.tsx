import { MyWorkRow } from "@/components/my-work/my-work-row";
import {
  MY_WORK_SECTION_LIMIT,
  type MyWorkSection as MyWorkSectionData,
} from "@/lib/services/my-work-service";

export function MyWorkSection({
  name,
  title,
  emptyMessage,
  section,
  now,
}: {
  name: "tasks" | "todos" | "notes";
  title: string;
  emptyMessage: string;
  section: MyWorkSectionData;
  now: Date;
}) {
  return (
    <section className="space-y-3" data-my-work-section={name}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <span
          data-my-work-count={section.count}
          className="text-xs font-medium tabular-nums text-muted-foreground"
        >
          {section.count}
          {section.truncated ? "+" : ""}
        </span>
      </div>
      {section.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-background">
            {section.items.map((item) => (
              <MyWorkRow key={item.id} item={item} now={now} />
            ))}
          </ul>
          {section.truncated ? (
            <p className="text-xs text-muted-foreground">
              Showing the first {MY_WORK_SECTION_LIMIT} items.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
