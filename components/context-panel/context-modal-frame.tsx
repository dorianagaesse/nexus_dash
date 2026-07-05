import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface ContextModalFrameProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function ContextModalFrame({
  title,
  onClose,
  children,
}: ContextModalFrameProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[100dvh] w-full max-w-xl flex-col overflow-hidden sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl"
      >
        <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={`Close ${title}`}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto">{children}</CardContent>
      </DialogContent>
    </Dialog>
  );
}
