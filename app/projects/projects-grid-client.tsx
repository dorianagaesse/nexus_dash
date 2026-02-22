"use client";

import Link from "next/link";
import { type RefObject, useMemo, useRef, useState } from "react";
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
  taskCount: number;
  resourceCount: number;
}

interface ProjectsGridClientProps {
  projects: ProjectGridItem[];
  onUpdateProject: (formData: FormData) => Promise<void>;
  onDeleteProject: (formData: FormData) => Promise<void>;
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
  onUpdateProject: (formData: FormData) => Promise<void>;
  onDeleteProject: (formData: FormData) => Promise<void>;
}

function ProjectCard({ project, onUpdateProject, onDeleteProject }: ProjectCardProps) {
  const [nameDraft, setNameDraft] = useState(project.name);
  const [descriptionDraft, setDescriptionDraft] = useState(project.description ?? "");
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);

  const deleteFormRef = useRef<HTMLFormElement | null>(null);
  const optionsMenuRef = useDismissibleMenu<HTMLDivElement>(isOptionsMenuOpen, () =>
    setIsOptionsMenuOpen(false)
  );

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
    setIsEditMode(true);
    setIsOptionsMenuOpen(false);
  };

  const handleCancelEdit = () => {
    resetDrafts();
    setIsEditMode(false);
  };

  const handleConfirmDelete = async () => {
    if (!deleteFormRef.current || isDeleteSubmitting) {
      return;
    }

    setIsDeleteSubmitting(true);
    deleteFormRef.current.requestSubmit();
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
          {!isEditMode ? (
            <>
              <CardTitle onDoubleClick={handleStartEdit}>{project.name}</CardTitle>
              <CardDescription>Updated {project.updatedAtLabel}</CardDescription>
            </>
          ) : (
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
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild>
            <Link href={`/projects/${project.id}`}>
              Open dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>

          <form action={onUpdateProject} className="grid gap-3">
            <input type="hidden" name="projectId" value={project.id} />
            {!isEditMode ? (
              <div className="grid gap-2">
                <label className="text-sm font-medium">Description</label>
                <p
                  className="min-h-16 whitespace-pre-wrap rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground"
                  onDoubleClick={handleStartEdit}
                >
                  {descriptionPreview}
                </p>
              </div>
            ) : (
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
            )}

            {isEditMode ? (
              <div className="flex flex-wrap items-center gap-2">
                {canSave ? (
                  <Button type="submit" variant="secondary">
                    <Pencil className="h-4 w-4" />
                    Save changes
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" onClick={handleCancelEdit}>
                  Cancel
                </Button>
              </div>
            ) : null}
          </form>

          <form ref={deleteFormRef} action={onDeleteProject} className="hidden">
            <input type="hidden" name="projectId" value={project.id} />
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
