"use client";

import { useMemo, useState } from "react";
import { Link2, Paperclip, PlusSquare, Trash2, Upload, X } from "lucide-react";

import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MAX_TASK_LABELS,
  getTaskLabelColor,
  normalizeTaskLabel,
} from "@/lib/task-label";

interface CreateTaskDialogProps {
  action: (formData: FormData) => Promise<void>;
  existingLabels: string[];
}

interface PendingAttachmentLink {
  id: string;
  url: string;
}

function createLocalId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function CreateTaskDialog({
  action,
  existingLabels,
}: CreateTaskDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [isLinkComposerOpen, setIsLinkComposerOpen] = useState(false);
  const [attachmentLinks, setAttachmentLinks] = useState<PendingAttachmentLink[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);

  const resetDraft = () => {
    setDescription("");
    setLabels([]);
    setLabelInput("");
    setLinkUrl("");
    setIsLinkComposerOpen(false);
    setAttachmentLinks([]);
    setSelectedFiles([]);
    setFileInputKey((previous) => previous + 1);
  };

  const openDialog = () => {
    resetDraft();
    setIsOpen(true);
  };

  const closeDialog = () => {
    resetDraft();
    setIsOpen(false);
  };

  const handleAddLink = () => {
    const nextUrl = linkUrl.trim();
    if (!nextUrl) {
      return;
    }

    setAttachmentLinks((previous) => [
      {
        id: createLocalId(),
        url: nextUrl,
      },
      ...previous,
    ]);
    setLinkUrl("");
    setIsLinkComposerOpen(false);
  };

  const handleRemoveLink = (linkId: string) => {
    setAttachmentLinks((previous) => previous.filter((link) => link.id !== linkId));
  };

  const serializedLinks = JSON.stringify(
    attachmentLinks.map((link) => ({
      name: "",
      url: link.url,
    }))
  );

  const serializedLabels = JSON.stringify(labels);

  const labelSuggestions = useMemo(() => {
    const query = labelInput.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const selected = new Set(labels.map((label) => label.toLowerCase()));
    return existingLabels
      .filter((label) => label.toLowerCase().startsWith(query))
      .filter((label) => !selected.has(label.toLowerCase()))
      .slice(0, 6);
  }, [existingLabels, labelInput, labels]);

  const addLabel = (value: string) => {
    const normalizedLabel = normalizeTaskLabel(value);
    if (!normalizedLabel) {
      return;
    }

    if (labels.length >= MAX_TASK_LABELS) {
      return;
    }

    if (labels.some((label) => label.toLowerCase() === normalizedLabel.toLowerCase())) {
      setLabelInput("");
      return;
    }

    setLabels((previous) => [...previous, normalizedLabel]);
    setLabelInput("");
  };

  const removeLabel = (labelToRemove: string) => {
    setLabels((previous) => previous.filter((label) => label !== labelToRemove));
  };

  return (
    <>
      <Button type="button" onClick={openDialog}>
        <PlusSquare className="h-4 w-4" />
        New task
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
              <CardTitle className="text-lg">Create task</CardTitle>
              <Button type="button" variant="ghost" size="icon" onClick={closeDialog}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form
                action={action}
                className="grid gap-4"
                encType="multipart/form-data"
                onSubmit={() => setIsOpen(false)}
              >
                <div className="grid gap-2">
                  <label htmlFor="task-title" className="text-sm font-medium">
                    Title
                  </label>
                  <input
                    id="task-title"
                    name="title"
                    required
                    minLength={2}
                    maxLength={120}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="Implement drag sorting"
                  />
                </div>

                <div className="grid gap-2">
                  <label htmlFor="task-label-input" className="text-sm font-medium">
                    Labels
                  </label>
                  <div className="rounded-md border border-input bg-background p-2">
                    <div className="flex flex-wrap gap-2">
                      {labels.map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-slate-900"
                          style={{ backgroundColor: getTaskLabelColor(label) }}
                        >
                          {label}
                          <button
                            type="button"
                            className="rounded-sm p-0.5 hover:bg-slate-900/10"
                            onClick={() => removeLabel(label)}
                            aria-label={`Remove label ${label}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        id="task-label-input"
                        value={labelInput}
                        onChange={(event) => setLabelInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === ",") {
                            event.preventDefault();
                            addLabel(labelInput);
                          }
                        }}
                        maxLength={60}
                        className="h-8 min-w-[160px] flex-1 bg-transparent px-1 text-sm outline-none"
                        placeholder={
                          labels.length >= MAX_TASK_LABELS
                            ? "Label limit reached"
                            : "Type label and press Enter"
                        }
                        disabled={labels.length >= MAX_TASK_LABELS}
                      />
                    </div>
                  </div>
                  {labelSuggestions.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {labelSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => addLabel(suggestion)}
                          className="rounded-full border border-border/70 bg-background px-2 py-1 text-xs text-foreground hover:bg-muted"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <input type="hidden" name="labels" value={serializedLabels} />
                </div>

                <div className="grid gap-2">
                  <label htmlFor="task-description" className="text-sm font-medium">
                    Description
                  </label>
                  <RichTextEditor
                    id="task-description"
                    value={description}
                    onChange={setDescription}
                    placeholder="Optional implementation notes..."
                  />
                  <input type="hidden" name="description" value={description} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={isLinkComposerOpen ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setIsLinkComposerOpen((previous) => !previous)}
                      aria-label="Add attachment link"
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                    <input
                      key={fileInputKey}
                      id="task-create-attachment-files"
                      type="file"
                      name="attachmentFiles"
                      multiple
                      onChange={(event) =>
                        setSelectedFiles(Array.from(event.target.files ?? []))
                      }
                      className="hidden"
                    />
                    <Button type="button" variant="ghost" size="icon" asChild>
                      <label
                        htmlFor="task-create-attachment-files"
                        aria-label="Upload attachment files"
                        className="cursor-pointer"
                      >
                        <Upload className="h-4 w-4" />
                      </label>
                    </Button>
                  </div>

                  {isLinkComposerOpen ? (
                    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background p-2">
                      <input
                        value={linkUrl}
                        onChange={(event) => setLinkUrl(event.target.value)}
                        placeholder="https://..."
                        className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-xs"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        onClick={handleAddLink}
                        disabled={!linkUrl.trim()}
                        aria-label="Confirm attachment link"
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}

                  {attachmentLinks.length > 0 ? (
                    <div className="space-y-2">
                      {attachmentLinks.map((link) => (
                        <div
                          key={link.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-foreground">
                              {link.url}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveLink(link.id)}
                            aria-label="Remove staged link"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {selectedFiles.length > 0 ? (
                    <div className="space-y-2 rounded-md border border-border/60 bg-background p-2">
                      {selectedFiles.map((file) => (
                        <p
                          key={`${file.name}-${file.size}`}
                          className="truncate text-[11px] text-muted-foreground"
                        >
                          <Paperclip className="mr-1 inline h-3 w-3" />
                          {file.name}
                        </p>
                      ))}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setSelectedFiles([]);
                          setFileInputKey((previous) => previous + 1);
                        }}
                        aria-label="Clear selected files"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}

                  <input type="hidden" name="attachmentLinks" value={serializedLinks} />
                </div>

                <div className="flex items-center gap-2">
                  <Button type="submit">Create task</Button>
                  <Button type="button" variant="ghost" onClick={closeDialog}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
