import { Badge } from "@/components/ui/badge";

export function AgentCredentialDescriptiveLabels({ labels }: { labels?: readonly string[] }) {
  if (!labels?.length) return null;
  return (
    <div className="inline-flex min-w-0 max-w-full flex-wrap gap-1" aria-label="Descriptive labels">
      {labels.map((label) => (
        <Badge key={label} variant="outline" className="max-w-full whitespace-normal break-words text-xs [overflow-wrap:anywhere]">
          {label}
        </Badge>
      ))}
    </div>
  );
}
