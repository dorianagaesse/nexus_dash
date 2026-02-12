"use client";

import { useState } from "react";
import { PlusSquare, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CreateTaskDialogProps {
  action: (formData: FormData) => Promise<void>;
}

export function CreateTaskDialog({ action }: CreateTaskDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setIsOpen(true)}>
        <PlusSquare className="h-4 w-4" />
        New task
      </Button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg">Create task</CardTitle>
              <Button type="button" variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form action={action} className="grid gap-4">
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
                  <label htmlFor="task-label" className="text-sm font-medium">
                    Label
                  </label>
                  <input
                    id="task-label"
                    name="label"
                    maxLength={50}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="Frontend"
                  />
                </div>

                <div className="grid gap-2">
                  <label htmlFor="task-description" className="text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    id="task-description"
                    name="description"
                    rows={4}
                    maxLength={500}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Optional implementation notes..."
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button type="submit">Create task</Button>
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
