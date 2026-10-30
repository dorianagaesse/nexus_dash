// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { ConflictReview } from "@/components/live-save/conflict-review";
import type { LiveSaveConflict } from "@/lib/live-save/types";
interface Fields extends Record<string, unknown> {
  title: string;
  description: string;
  labels: string[];
  priority: string;
}

const conflict: LiveSaveConflict<Fields> = {
  base: { title: "Original", description: "Base description", labels: ["a"], priority: "low" },
  local: { title: "My title", description: "My draft text", labels: ["a", "mine"], priority: "low" },
  latest: { title: "Their title", description: "Their description", labels: ["a"], priority: "high" },
  latestRevision: "r7",
  changedLocally: ["title", "description", "labels"],
  changedOnServer: ["title", "description", "priority"],
  conflictingFields: ["title", "description"],
};


test.each([false,true])("internal conflicts never render recovery choices (pending=%s)",pending=>{
 const container=document.createElement("div"); const root=createRoot(container); const onResolve=vi.fn();
 act(()=>root.render(<ConflictReview conflict={conflict} pending={pending} onResolve={onResolve}/>)); expect(container.innerHTML).toBe(""); expect(onResolve).not.toHaveBeenCalled(); act(()=>root.unmount());
});
