"use client";

import Link from "next/link";
import { type FormEvent, type RefObject, useEffect, useMemo, useState } from "react";
import { ArrowRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDismissibleMenu } from "@/lib/hooks/use-dismissible-menu";

export interface ProjectGridItem {
  id: string;
  name: string;
  description: string | null;
  updatedAtLabel: string;
  updatedAtIso?: string;
  taskCount: number;
  resourceCount: number;
}

interface ProjectsGridClientProps {
  projects: ProjectGridItem[];
  onUpdateProject: (input: {
    projectId: string;
    name: string;
    description: string;
  }) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
}

export function ProjectsGridClient({
  projects,
  onUpdateProject,
  onDeleteProject,
}: ProjectsGridClientProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onUpdateProject={onUpdateProject}
          onDeleteProject={onDeleteProject}
        />
      ))}
    </div>
  );
}

interface ProjectCardProps {
  project: ProjectGridItem;
  onUpdateProject: (input: {
    projectId: string;
    name: string;
    description: string;
  }) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
}

function ProjectCard({ project, onUpdateProject, onDeleteProject }: ProjectCardProps) {
  const [nameDraft, setNameDraft] = useState(project.name);
  const [descriptionDraft, setDescriptionDraft] = useState(project.description ?? "");
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);
  const [isSaveSubmitting, setIsSaveSubmitting] = useState(false);
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const optionsMenuRef = useDismissibleMenu<HTMLDivElement>(isOptionsMenuOpen, () =>
    setIsOptionsMenuOpen(false)
  );

  useEffect(() => {
    if (isEditMode) {
      return;
    }

    setNameDraft(project.name);
    setDescriptionDraft(project.description ?? "");
  }, [isEditMode, project.description, project.name]);

  const persistedName = project.name.trim();
  const persistedDescription = (project.description ?? "").trim();
  const nextName = nameDraft.trim();
  const nextDescription = descriptionDraft.trim();
  const isDirty = nextName !== persistedName || nextDescription !== persistedDescription;
  const canSave = isDirty && nextName.length >= 2;

  const descriptionPreview = useMemo(() => {
    if (persistedDescription.length > 0) {
      return persistedDescription;
    }
    return "No description.";
  }, [persistedDescription]);

  const resetDrafts = () => {
    setNameDraft(project.name);
    setDescriptionDraft(project.description ?? "");
  };

  const handleStartEdit = () => {
    setMutationError(null);
    setIsEditMode(true);
    setIsOptionsMenuOpen(false);
  };

  const handleCancelEdit = () => {
    resetDrafts();
    setMutationError(null);
    setIsEditMode(false);
  };

  const handleSubmitUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaveSubmitting || !canSave) {
      return;
    }

    setIsSaveSubmitting(true);
    setMutationError(null);
    try {
      await onUpdateProject({
        projectId: project.id,
        name: nextName,
        description: nextDescription,
      });
      setIsEditMode(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not update project. Please retry.";
      setMutationError(message);
    } finally {
      setIsSaveSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (isDeleteSubmitting) {
      return;
    }

    setIsDeleteSubmitting(true);
    setMutationError(null);
    try {
      await onDeleteProject(project.id);
      setIsDeleteDialogOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not delete project. Please retry.";
      setMutationError(message);
    } finally {
      setIsDeleteSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {project.taskCount} task{project.taskCount === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline">
                {project.resourceCount} resource
                {project.resourceCount === 1 ? "" : "s"}
              </Badge>
            </div>
            {!isEditMode ? (
              <ProjectOptionsMenu
                isOpen={isOptionsMenuOpen}
                menuRef={optionsMenuRef}
                onToggle={() => setIsOptionsMenuOpen((previous) => !previous)}
                onEdit={handleStartEdit}
                onDelete={() => {
                  setIsOptionsMenuOpen(false);
                  setIsDeleteDialogOpen(true);
                }}
              />
            ) : null}
          </div>
          <CardTitle
            onDoubleClick={(event) => {
              event.stopPropagation();
              handleStartEdit();
            }}
          >
            {project.name}
          </CardTitle>
          <CardDescription>Updated {project.updatedAtLabel}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild>
            <Link href={`/projects/${project.id}`}>
              Open dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>

          <form
            className="grid gap-3"
            onSubmit={(event) => void handleSubmitUpdate(event)}
          >
            {isEditMode ? (
              <>
                <div className="grid gap-2">
                  <label htmlFor={`name-${project.id}`} className="text-sm font-medium">
                    Name
                  </label>
                  <input
                    id={`name-${project.id}`}
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor={`description-${project.id}`} className="text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    id={`description-${project.id}`}
                    name="description"
                    rows={3}
                    maxLength={500}
                    value={descriptionDraft}
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </>
            ) : (
              <div className="grid gap-2">
                <label className="text-sm font-medium">Description</label>
                <p
                  className="min-h-16 whitespace-pre-wrap rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground"
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    handleStartEdit();
                  }}
                >
                  {descriptionPreview}
                </p>
              </div>
            )}

            {isEditMode ? (
              <div className="flex flex-wrap items-center gap-2">
                {canSave ? (
                  <Button type="submit" variant="secondary" disabled={isSaveSubmitting}>
                    <Pencil className="h-4 w-4" />
                    {isSaveSubmitting ? "Saving..." : "Save changes"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  disabled={isSaveSubmitting}
                >
                  Cancel
                </Button>
              </div>
            ) : null}
            {mutationError ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {mutationError}
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        title="Delete project"
        description={`Delete \"${project.name}\"? This action cannot be undone.`}
        confirmLabel="Delete project"
        isConfirming={isDeleteSubmitting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if (isDeleteSubmitting) {
            return;
          }
          setIsDeleteDialogOpen(false);
        }}
      />
    </>
  );
}

interface ProjectOptionsMenuProps {
  isOpen: boolean;
  menuRef: RefObject<HTMLDivElement>;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ProjectOptionsMenu({
  isOpen,
  menuRef,
  onToggle,
  onEdit,
  onDelete,
}: ProjectOptionsMenuProps) {
  return (
    <div ref={menuRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Project options"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {isOpen ? (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-border/70 bg-background p-1 shadow-md">
          <Button type="button" variant="ghost" className="w-full justify-start" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}
