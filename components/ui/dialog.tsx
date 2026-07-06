"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[var(--layer-dialog-overlay)] bg-black/70",
      "data-[state=open]:animate-in data-[state=open]:fade-in-0",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
      "motion-reduce:animate-none motion-reduce:transition-none",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /** Keep Escape and outside-pointer dismissal disabled while a critical mutation is running. */
  dismissible?: boolean;
  overlayClassName?: string;
  presentation?: "responsive-sheet" | "centered";
};

function isNestedOverlayControl(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-overlay-popover="true"]'));
}

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      children,
      className,
      dismissible = true,
      onEscapeKeyDown,
      onInteractOutside,
      onPointerDownOutside,
      overlayClassName,
      presentation = "responsive-sheet",
      ...props
    },
    ref
  ) => (
    <DialogPrimitive.Portal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        ref={ref}
        aria-modal="true"
        data-overlay-content="true"
        className={cn(
          "fixed left-1/2 z-[var(--layer-dialog)] w-[calc(100%-2rem)] -translate-x-1/2 border border-border/60 bg-card text-card-foreground shadow-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          "motion-reduce:animate-none motion-reduce:transition-none",
          presentation === "responsive-sheet"
            ? [
                "bottom-0 w-full rounded-t-3xl",
                "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
                "sm:bottom-auto sm:top-1/2 sm:w-[calc(100%-2rem)] sm:-translate-y-1/2 sm:rounded-xl",
                "sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0",
              ]
            : [
                "top-1/2 -translate-y-1/2 rounded-xl",
                "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
              ],
          className
        )}
        onEscapeKeyDown={(event) => {
          onEscapeKeyDown?.(event);
          if (!dismissible) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          onInteractOutside?.(event);
          if (isNestedOverlayControl(event.detail.originalEvent.target)) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          onPointerDownOutside?.(event);
          if (!dismissible) {
            event.preventDefault();
          }
        }}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("font-semibold", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
};
