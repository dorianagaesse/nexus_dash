"use client";

import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  isConfirming?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex min-h-dvh w-screen items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isConfirming) {
          onCancel();
        }
      }}
    >
      <Card
        className="w-full max-w-md"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={isConfirming}
              onClick={() => {
                try {
                  const result = onConfirm();
                  if (result instanceof Promise) {
                    void result.catch((error: unknown) => {
                      console.error("[ConfirmDialog.onConfirm]", error);
                    });
                  }
                } catch (error) {
                  console.error("[ConfirmDialog.onConfirm]", error);
                }
              }}
            >
              {isConfirming ? "Deleting..." : confirmLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isConfirming}
              onClick={onCancel}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>,
    document.body
  );
}
