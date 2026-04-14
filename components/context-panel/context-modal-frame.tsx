import { createPortal } from "react-dom";
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
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex min-h-dvh w-screen items-end justify-center overflow-y-auto overscroll-y-contain bg-black/70 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <Card
        className="flex max-h-[100dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto">{children}</CardContent>
      </Card>
    </div>,
    document.body
  );
}
