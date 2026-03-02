"use client";

import { useState, type FormEvent } from "react";
import { PlusSquare, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CreateProjectDialogProps {
  onCreateProject: (input: { name: string; description: string }) => Promise<void>;
}

export function CreateProjectDialog({ onCreateProject }: CreateProjectDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resetDraft = () => {
    setName("");
    setDescription("");
    setSubmitError(null);
  };

  const closeDialog = () => {
    resetDraft();
    setIsOpen(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      setSubmitError("Project name must be at least 2 characters long.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onCreateProject({
        name: normalizedName,
        description: description.trim(),
      });
      closeDialog();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create project. Please retry.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          resetDraft();
          setIsOpen(true);
        }}
      >
        <PlusSquare className="h-4 w-4" />
        Create project
      </Button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDialog();
            }
          }}
        >
          <Card
            className="w-full max-w-lg"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg">Create project</CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeDialog}
                disabled={isSubmitting}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={handleSubmit}>
                <div className="grid gap-2">
                  <label htmlFor="create-name" className="text-sm font-medium">
                    Name
                  </label>
                  <input
                    id="create-name"
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="NexusDash MVP"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>

                <div className="grid gap-2">
                  <label htmlFor="create-description" className="text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    id="create-description"
                    name="description"
                    rows={3}
                    maxLength={500}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Optional project context..."
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating..." : "Create project"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                </div>
                {submitError ? (
                  <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {submitError}
                  </p>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
