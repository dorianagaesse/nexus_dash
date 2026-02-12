"use client";

import { useState } from "react";
import { PlusSquare, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CreateProjectDialogProps {
  action: (formData: FormData) => Promise<void>;
}

export function CreateProjectDialog({ action }: CreateProjectDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setIsOpen(true)}>
        <PlusSquare className="h-4 w-4" />
        Create project
      </Button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <Card
            className="w-full max-w-lg"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg">Create project</CardTitle>
              <Button type="button" variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form action={action} className="grid gap-4">
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
                    placeholder="Optional project context..."
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button type="submit">Create project</Button>
                  <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
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
