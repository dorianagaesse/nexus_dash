import { Badge } from "@/components/ui/badge";
import { getTaskLabelColor } from "@/lib/task-label";

export function AgentCredentialDescriptiveLabels({ labels }: { labels?: readonly string[] }) {
  if (!labels?.length) return null;
  return (
    <div className="inline-flex min-w-0 max-w-full flex-wrap gap-1" role="group" aria-label="Descriptive labels">
      {labels.map((label) => (
        <Badge key={label} variant="outline" style={{ backgroundColor: getTaskLabelColor(label) }}
          className="max-w-full whitespace-normal break-words text-xs text-slate-900 [overflow-wrap:anywhere]">
          {label}
        </Badge>
      ))}
    </div>
  );
}
