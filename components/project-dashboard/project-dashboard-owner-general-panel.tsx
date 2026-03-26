"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmojiInputField, EmojiTextareaField } from "@/components/ui/emoji-field";

interface ProjectDashboardOwnerGeneralPanelProps {
  nameDraft: string;
  descriptionDraft: string;
  hasProjectChanges: boolean;
  isSavingProject: boolean;
  projectError: string | null;
  onNameDraftChange: (value: string) => void;
  onDescriptionDraftChange: (value: string) => void;
  onSaveProject: () => void;
  onResetProject: () => void;
  onOpenDeleteDialog: () => void;
}

export function ProjectDashboardOwnerGeneralPanel({
  nameDraft,
  descriptionDraft,
  hasProjectChanges,
  isSavingProject,
  projectError,
  onNameDraftChange,
  onDescriptionDraftChange,
  onSaveProject,
  onResetProject,
  onOpenDeleteDialog,
}: ProjectDashboardOwnerGeneralPanelProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="space-y-4 rounded-2xl border border-border/60 bg-background/60 p-5">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">General metadata</h3>
          <p className="text-sm text-muted-foreground">
            Update the project name and description used across the workspace.
          </p>
        </div>

        <div className="grid gap-2">
          <label htmlFor="project-settings-name" className="text-sm font-medium">
            Project name
          </label>
          <EmojiInputField
            id="project-settings-name"
            value={nameDraft}
            onChange={(event) => onNameDraftChange(event.target.value)}
            minLength={2}
            maxLength={120}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor="project-settings-description" className="text-sm font-medium">
            Description
          </label>
          <EmojiTextareaField
            id="project-settings-description"
            value={descriptionDraft}
            onChange={(event) => onDescriptionDraftChange(event.target.value)}
            maxLength={500}
            rows={5}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        {projectError ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {projectError}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={onSaveProject}
            disabled={!hasProjectChanges || isSavingProject}
          >
            {isSavingProject ? "Saving..." : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onResetProject}
            disabled={isSavingProject}
          >
            Reset
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Danger zone</h3>
          <p className="text-sm text-muted-foreground">
            Deleting a project removes its tasks, context cards, and invitations.
          </p>
        </div>
        <Button type="button" variant="destructive" onClick={onOpenDeleteDialog}>
          <Trash2 className="h-4 w-4" />
          Delete project
        </Button>
      </section>
    </div>
  );
}
