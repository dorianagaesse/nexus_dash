"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AlertTriangle,
  Check,
  Circle,
  ExternalLink,
  GripHorizontal,
  ListTodo,
  RotateCcw,
  X,
} from "lucide-react";

import type { ProjectMeetingNotePanelNote } from "@/components/meeting-todos/meeting-note-types";
import { MeetingTodoAssigneeChipReadonly } from "@/components/meeting-todos/meeting-todo-assignee-chip";
import { MeetingTodoActorIdentity } from "@/components/meeting-todos/meeting-todo-actor-control";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  buildProjectMeetingTodos,
  isMeetingTodoAssignedToUser,
  type ProjectMeetingTodo,
} from "@/lib/meeting-todo";
import { cn } from "@/lib/utils";

interface MeetingTodoQuickDialogProps {
  notes: ProjectMeetingNotePanelNote[];
  canEdit: boolean;
  currentActorUserId: string;
  referenceNowMs: number;
  pendingActionId: string | null;
  onOpenMeeting: (note: ProjectMeetingNotePanelNote) => void;
  onSetCompleted: (todo: ProjectMeetingTodo, completed: boolean) => void;
}

interface DialogPosition {
  left: number;
  top: number;
}

interface DragState {
  pointerId: number;
  originClientX: number;
  originClientY: number;
  originPosition: DialogPosition;
  hasMoved: boolean;
}

interface MovementAnnouncement {
  id: number;
  message: string;
}

const DIALOG_EDGE_PADDING = 16;
export const PANEL_POSITION_STORAGE_KEY =
  "nexusdash.meeting-todos.panel-position";
const KEYBOARD_MOVE_STEP = 16;
const KEYBOARD_MOVE_LARGE_STEP = 48;
const POINTER_DRAG_THRESHOLD = 4;
const PANEL_ANIMATION_DURATION_MS = 220;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function clampMeetingTodoDialogPosition({
  desiredPosition,
  currentPosition,
  dialogRect,
  viewportWidth,
  viewportHeight,
}: {
  desiredPosition: DialogPosition;
  currentPosition: DialogPosition;
  dialogRect: Pick<DOMRect, "left" | "right" | "top" | "bottom">;
  viewportWidth: number;
  viewportHeight: number;
}): DialogPosition {
  // The panel rect is offset from the stored position by the fixed layout
  // anchoring (viewport center minus panel size), so the allowed range is
  // expressed relative to the current position and rect.
  const minimumLeft =
    currentPosition.left - (dialogRect.left - DIALOG_EDGE_PADDING);
  const maximumLeft =
    currentPosition.left +
    (viewportWidth - DIALOG_EDGE_PADDING - dialogRect.right);
  const minimumTop =
    currentPosition.top - (dialogRect.top - DIALOG_EDGE_PADDING);
  const maximumTop =
    currentPosition.top +
    (viewportHeight - DIALOG_EDGE_PADDING - dialogRect.bottom);

  return {
    left:
      maximumLeft >= minimumLeft
        ? clamp(desiredPosition.left, minimumLeft, maximumLeft)
        : currentPosition.left,
    top:
      maximumTop >= minimumTop
        ? clamp(desiredPosition.top, minimumTop, maximumTop)
        : currentPosition.top,
  };
}

export function readStoredMeetingTodoDialogPosition(): DialogPosition | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(PANEL_POSITION_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as Partial<DialogPosition> | null;
    if (
      !parsed ||
      !Number.isFinite(parsed.left) ||
      !Number.isFinite(parsed.top)
    ) {
      return null;
    }

    return { left: parsed.left as number, top: parsed.top as number };
  } catch {
    return null;
  }
}

function storeMeetingTodoDialogPosition(position: DialogPosition) {
  try {
    window.localStorage.setItem(
      PANEL_POSITION_STORAGE_KEY,
      JSON.stringify(position)
    );
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); the panel
    // still works, it just opens centered again.
  }
}

function TodoCompletionButton({
  todo,
  canEdit,
  pendingActionId,
  onSetCompleted,
}: {
  todo: ProjectMeetingTodo;
  canEdit: boolean;
  pendingActionId: string | null;
  onSetCompleted: (todo: ProjectMeetingTodo, completed: boolean) => void;
}) {
  const isCompleted = todo.action.completedAt !== null;
  const isPending = pendingActionId === todo.action.id;

  if (!canEdit) {
    return (
      <span className="inline-flex h-11 w-11 items-center justify-center text-muted-foreground">
        {isCompleted ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => onSetCompleted(todo, !isCompleted)}
      aria-label={
        isCompleted
          ? `Reopen todo: ${todo.action.content}`
          : `Complete todo: ${todo.action.content}`
      }
      className={cn(
        "inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60",
        isCompleted
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
      )}
    >
      {isCompleted ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
    </button>
  );
}

function OpenTodoItem({
  todo,
  canEdit,
  pendingActionId,
  onOpenMeeting,
  onSetCompleted,
}: {
  todo: ProjectMeetingTodo;
  canEdit: boolean;
  pendingActionId: string | null;
  onOpenMeeting: (note: ProjectMeetingNotePanelNote) => void;
  onSetCompleted: (todo: ProjectMeetingTodo, completed: boolean) => void;
}) {
  return (
    <li
      className={cn(
        "flex gap-2 border-b border-border/50 px-4 py-3 last:border-0",
        todo.isOverdue && "bg-amber-500/[0.07]"
      )}
    >
      <TodoCompletionButton
        todo={todo}
        canEdit={canEdit}
        pendingActionId={pendingActionId}
        onSetCompleted={onSetCompleted}
      />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex min-h-11 min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenMeeting(todo.note)}
            title={todo.action.content}
            className="min-w-0 flex-1 rounded-lg py-1 text-left transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="block truncate text-sm font-medium leading-5 text-foreground">
              {todo.action.content}
            </span>
            <span className="inline-flex max-w-full items-center gap-1 text-xs font-medium text-muted-foreground">
              <span className="truncate">{todo.note.title}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </span>
          </button>
          <span className="shrink-0">
            <MeetingTodoAssigneeChipReadonly actor={todo.action.assignee ?? null} />
          </span>
        </div>
        {todo.isOverdue ? (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-200">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Overdue
          </span>
        ) : null}
      </div>
    </li>
  );
}

function CompletedTodoRow({
  todo,
  canEdit,
  pendingActionId,
  onOpenMeeting,
  onSetCompleted,
}: {
  todo: ProjectMeetingTodo;
  canEdit: boolean;
  pendingActionId: string | null;
  onOpenMeeting: (note: ProjectMeetingNotePanelNote) => void;
  onSetCompleted: (todo: ProjectMeetingTodo, completed: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-2 border-t border-border/50 px-4 py-2.5">
      <TodoCompletionButton
        todo={todo}
        canEdit={canEdit}
        pendingActionId={pendingActionId}
        onSetCompleted={onSetCompleted}
      />
      <button
        type="button"
        onClick={() => onOpenMeeting(todo.note)}
        title={todo.action.content}
        className="min-h-11 min-w-0 flex-1 rounded-lg py-1 text-left transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-xs font-medium text-muted-foreground line-through">
            {todo.action.content}
          </span>
          <span className="shrink-0 leading-none">
            <MeetingTodoAssigneeChipReadonly actor={todo.action.assignee ?? null} bordered={false} />
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            {todo.note.title}
          </span>
          {todo.action.completedBy ? (
            <span className="shrink-0 leading-none">
              <MeetingTodoActorIdentity
                actor={todo.action.completedBy}
                prefix="Completed by"
                compact
              />
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

export function MeetingTodoQuickDialog({
  notes,
  canEdit,
  currentActorUserId,
  referenceNowMs,
  pendingActionId,
  onOpenMeeting,
  onSetCompleted,
}: MeetingTodoQuickDialogProps) {
  const todos = useMemo(() => {
    const projectTodos = buildProjectMeetingTodos(notes, referenceNowMs);
    const isOwnTodo = (todo: ProjectMeetingTodo) =>
      isMeetingTodoAssignedToUser(todo.action.assignee, currentActorUserId);
    return {
      open: projectTodos.open.filter(isOwnTodo),
      completed: projectTodos.completed.filter(isOwnTodo),
    };
  }, [notes, referenceNowMs, currentActorUserId]);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<DialogPosition>({ left: 0, top: 0 });
  const [triggerAnimationPosition, setTriggerAnimationPosition] =
    useState<DialogPosition>({ left: 0, top: 0 });
  const [movementAnnouncement, setMovementAnnouncement] =
    useState<MovementAnnouncement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef(position);
  const dragStateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const hasPositionedRef = useRef(false);
  const isOpeningRef = useRef(false);
  const overdueCount = todos.open.filter((todo) => todo.isOverdue).length;

  const applyPosition = useCallback((nextPosition: DialogPosition) => {
    if (
      positionRef.current.left === nextPosition.left &&
      positionRef.current.top === nextPosition.top
    ) {
      return;
    }

    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }, []);

  const getProjectRect = useCallback(
    () => document.querySelector<HTMLElement>("[data-project-page]")?.getBoundingClientRect() ?? null,
    []
  );

  const captureTriggerAnimationPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    setTriggerAnimationPosition({
      left: triggerRect.left + triggerRect.width / 2 - window.innerWidth / 2,
      top: triggerRect.top + triggerRect.height / 2 - window.innerHeight / 2,
    });
  }, []);

  const closePanel = useCallback(() => {
    captureTriggerAnimationPosition();
    setIsOpen(false);
  }, [captureTriggerAnimationPosition]);

  const clampPosition = useCallback((desiredPosition: DialogPosition) => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return desiredPosition;
    }

    return clampMeetingTodoDialogPosition({
      desiredPosition,
      currentPosition: positionRef.current,
      dialogRect: dialog.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
  }, []);

  const storeCurrentPosition = useCallback(() => {
    storeMeetingTodoDialogPosition(positionRef.current);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      dragStateRef.current = null;
      suppressClickRef.current = false;
      isOpeningRef.current = false;
      setIsDragging(false);
      return undefined;
    }

    const desktopMediaQuery = window.matchMedia("(min-width: 1024px)");
    const ensureContained = () => {
      if (isOpeningRef.current) {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      applyPosition(clampPosition(positionRef.current));
    };
    const handleDesktopChange = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        closePanel();
      }
    };
    const containmentTimerId = window.setTimeout(() => {
      isOpeningRef.current = false;
      ensureContained();
    }, PANEL_ANIMATION_DURATION_MS);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(ensureContained);
    if (dialogRef.current) {
      resizeObserver?.observe(dialogRef.current);
    }
    window.addEventListener("resize", ensureContained);
    window.addEventListener("scroll", ensureContained, { passive: true });
    desktopMediaQuery.addEventListener("change", handleDesktopChange);

    return () => {
      window.clearTimeout(containmentTimerId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", ensureContained);
      window.removeEventListener("scroll", ensureContained);
      desktopMediaQuery.removeEventListener("change", handleDesktopChange);
    };
  }, [applyPosition, clampPosition, closePanel, isOpen]);

  const moveDialog = useCallback(
    (desiredPosition: DialogPosition) => {
      applyPosition(clampPosition(desiredPosition));
    },
    [applyPosition, clampPosition]
  );

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    suppressClickRef.current = false;
    dragStateRef.current = {
      pointerId: event.pointerId,
      originClientX: event.clientX,
      originClientY: event.clientY,
      originPosition: positionRef.current,
      hasMoved: false,
    };
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.originClientX;
    const deltaY = event.clientY - dragState.originClientY;
    if (
      !dragState.hasMoved &&
      Math.hypot(deltaX, deltaY) < POINTER_DRAG_THRESHOLD
    ) {
      return;
    }

    if (!dragState.hasMoved) {
      dragState.hasMoved = true;
      suppressClickRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    }

    event.preventDefault();
    moveDialog({
      left: dragState.originPosition.left + deltaX,
      top: dragState.originPosition.top + deltaY,
    });
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);

    if (!dragState.hasMoved) {
      suppressClickRef.current = false;
      return;
    }

    storeCurrentPosition();
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handleDragCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    suppressClickRef.current = false;
    handleDragEnd(event);
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) {
      return;
    }

    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleMoveKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? KEYBOARD_MOVE_LARGE_STEP : KEYBOARD_MOVE_STEP;
    const movementByKey: Record<string, DialogPosition> = {
      ArrowLeft: { left: -step, top: 0 },
      ArrowRight: { left: step, top: 0 },
      ArrowUp: { left: 0, top: -step },
      ArrowDown: { left: 0, top: step },
    };
    const movement = movementByKey[event.key];
    if (!movement) {
      return;
    }

    event.preventDefault();
    moveDialog({
      left: positionRef.current.left + movement.left,
      top: positionRef.current.top + movement.top,
    });
    storeCurrentPosition();
    setMovementAnnouncement((current) => ({
      id: (current?.id ?? 0) + 1,
      message: `Todos panel moved ${event.key.replace("Arrow", "").toLowerCase()}.`,
    }));
  };

  if (todos.open.length === 0 && todos.completed.length === 0) {
    return null;
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      captureTriggerAnimationPosition();
      if (!hasPositionedRef.current) {
        const storedPosition = readStoredMeetingTodoDialogPosition();
        if (storedPosition) {
          applyPosition(storedPosition);
        } else {
          const projectRect = getProjectRect();
          const visibleProjectLeft = projectRect
            ? Math.max(
                DIALOG_EDGE_PADDING,
                projectRect.left + DIALOG_EDGE_PADDING
              )
            : DIALOG_EDGE_PADDING;
          const visibleProjectRight = projectRect
            ? Math.min(
                window.innerWidth - DIALOG_EDGE_PADDING,
                projectRect.right - DIALOG_EDGE_PADDING
              )
            : window.innerWidth - DIALOG_EDGE_PADDING;
          applyPosition({
            left:
              (visibleProjectLeft + visibleProjectRight) / 2 -
              window.innerWidth / 2,
            top: positionRef.current.top,
          });
        }
        hasPositionedRef.current = true;
      }
      isOpeningRef.current = true;
      setMovementAnnouncement(null);
      setIsOpen(true);
      return;
    }

    closePanel();
  };
  const openSourceMeeting = (note: ProjectMeetingNotePanelNote) => {
    closePanel();
    onOpenMeeting(note);
  };
  const triggerAccessibleName = `Todos, ${todos.open.length} open${
    overdueCount > 0 ? `, ${overdueCount} overdue` : ""
  }`;
  const content = (
    <Dialog modal={false} open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={triggerAccessibleName}
          style={{ right: DIALOG_EDGE_PADDING }}
          className="fixed bottom-6 z-[var(--layer-floating)] hidden min-h-11 touch-manipulation items-center gap-2 rounded-full border border-border/70 bg-background/95 px-4 py-2 text-sm font-semibold text-foreground shadow-[0_18px_48px_-20px_rgba(15,23,42,0.72)] backdrop-blur transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none lg:inline-flex print:hidden"
        >
          <ListTodo className="h-4 w-4" aria-hidden />
          <span>Todos</span>
          <span
            className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-primary"
            aria-hidden
          >
            {todos.open.length}
          </span>
          {overdueCount > 0 ? (
            <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
          ) : null}
        </button>
      </DialogTrigger>

      <DialogContent
        ref={dialogRef}
        data-meeting-todo-panel
        aria-modal="false"
        presentation="centered"
        overlayClassName="hidden"
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragCancel}
        onClickCapture={handleClickCapture}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (
            typeof window.matchMedia !== "function" ||
            window.matchMedia("(min-width: 1024px)").matches
          ) {
            triggerRef.current?.focus();
          }
        }}
        className={cn(
          "hidden max-h-[min(42rem,calc(100dvh-2rem))] max-w-md cursor-grab flex-col overflow-hidden rounded-2xl border-border/70 bg-background p-0 shadow-[0_34px_96px_-34px_rgba(15,23,42,0.75)] lg:flex",
          isDragging && "cursor-grabbing select-none transition-none"
        )}
        style={{
          "--meeting-todo-position-x": `${position.left}px`,
          "--meeting-todo-position-y": `${position.top}px`,
          "--meeting-todo-trigger-x": `${triggerAnimationPosition.left}px`,
          "--meeting-todo-trigger-y": `${triggerAnimationPosition.top}px`,
          transform: `translate(calc(-50% + ${position.left}px), calc(-50% + ${position.top}px))`,
        } as CSSProperties}
      >
        <header className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <ListTodo className="h-4 w-4 shrink-0" aria-hidden />
                <DialogTitle className="text-base font-semibold">Meeting todos</DialogTitle>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {todos.open.length} open
                </span>
                {overdueCount > 0 ? (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-200">
                    {overdueCount} overdue
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="Move meeting todos panel with arrow keys"
                aria-describedby="meeting-todo-dialog-description"
                onKeyDown={handleMoveKeyDown}
                className="inline-flex h-11 w-11 cursor-grab items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
              >
                <GripHorizontal className="h-4 w-4" aria-hidden />
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full"
                onClick={closePanel}
                aria-label="Close meeting todos"
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
          <DialogDescription
            id="meeting-todo-dialog-description"
            className="sr-only"
          >
            Meeting todo panel. Drag anywhere to move it. Use the move control
            and arrow keys for keyboard movement.
          </DialogDescription>
          <span className="sr-only" role="status" aria-live="polite">
            {movementAnnouncement ? (
              <span key={movementAnnouncement.id}>
                {movementAnnouncement.message}
              </span>
            ) : null}
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {todos.open.length > 0 ? (
            <ul aria-label="Open meeting todos">
              {todos.open.map((todo) => (
                <OpenTodoItem
                  key={todo.action.id}
                  todo={todo}
                  canEdit={canEdit}
                  pendingActionId={pendingActionId}
                  onOpenMeeting={openSourceMeeting}
                  onSetCompleted={onSetCompleted}
                />
              ))}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-200">
                <Check className="h-5 w-5" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-medium">All caught up.</p>
            </div>
          )}

          {todos.completed.length > 0 ? (
            <section aria-label="Recently completed meeting todos" className="bg-muted/10">
              <div className="border-t border-border/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Recently completed
              </div>
              <ul>
                {todos.completed.slice(0, 1).map((todo) => (
                  <CompletedTodoRow
                    key={todo.action.id}
                    todo={todo}
                    canEdit={canEdit}
                    pendingActionId={pendingActionId}
                    onOpenMeeting={openSourceMeeting}
                    onSetCompleted={onSetCompleted}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {!canEdit ? (
          <footer className="border-t border-border/60 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
            View-only project
          </footer>
        ) : null}
      </DialogContent>
    </Dialog>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
