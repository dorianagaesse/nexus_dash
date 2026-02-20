import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div
      className="fixed inset-0 z-50 flex min-h-dvh w-screen items-start justify-center overflow-y-auto overscroll-y-contain bg-black/70 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <Card
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
