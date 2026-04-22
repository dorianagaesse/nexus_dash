import type { ProjectTaskCollaboratorRole } from "@/components/kanban-board-types";

export function formatProjectCollaboratorRole(role: ProjectTaskCollaboratorRole): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "editor":
      return "Editor";
    case "viewer":
      return "Viewer";
    default:
      return role;
  }
}
