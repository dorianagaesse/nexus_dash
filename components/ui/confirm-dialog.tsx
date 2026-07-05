"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isConfirming) {
          onCancel();
        }
      }}
    >
      <DialogContent
        role="alertdialog"
        className="z-[150] w-full max-w-md"
        dismissible={!isConfirming}
        overlayClassName="z-[140]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelButtonRef.current?.focus();
        }}
      >
        <CardHeader className="space-y-2">
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DialogDescription>{description}</DialogDescription>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="destructive"
              disabled={isConfirming}
              className="w-full sm:w-auto"
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
            <DialogClose asChild>
              <Button
                ref={cancelButtonRef}
                type="button"
                variant="ghost"
                disabled={isConfirming}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
            </DialogClose>
          </div>
        </CardContent>
      </DialogContent>
    </Dialog>
  );
}
