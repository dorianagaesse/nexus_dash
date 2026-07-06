"use client";

import { useState } from "react";
import { PlusSquare, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmojiInputField, EmojiTextareaField } from "@/components/ui/emoji-field";

interface CreateProjectDialogProps {
  action: (formData: FormData) => Promise<void>;
}

export function CreateProjectDialog({ action }: CreateProjectDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="w-full sm:w-auto">
          <PlusSquare className="h-4 w-4" />
          Create project
        </Button>
      </DialogTrigger>

      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden sm:max-h-[calc(100dvh-2rem)]"
      >
            <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0">
              <DialogTitle className="text-lg">Create project</DialogTitle>
              <Button type="button" variant="ghost" size="icon" onClick={() => setIsOpen(false)} aria-label="Close create project">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto">
              <form
                action={action}
                className="grid gap-4"
                onSubmit={() => setIsOpen(false)}
              >
                <div className="grid gap-2">
                  <label htmlFor="create-name" className="text-sm font-medium">
                    Name
                  </label>
                  <EmojiInputField
                    id="create-name"
                    autoFocus
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="NexusDash MVP"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>

                <div className="grid gap-2">
                  <label htmlFor="create-description" className="text-sm font-medium">
                    Description
                  </label>
                  <EmojiTextareaField
                    id="create-description"
                    name="description"
                    rows={3}
                    maxLength={500}
                    placeholder="Optional project context..."
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                  <Button type="submit" className="w-full sm:w-auto">
                    Create project
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsOpen(false)}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
      </DialogContent>
    </Dialog>
  );
}
