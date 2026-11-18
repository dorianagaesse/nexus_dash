export const PROJECT_TODO_CONTENT_LIMIT = 500;

export interface ProjectTodoItem {
  id: string;
  content: string;
  completedAt: string | null;
  createdByUserId: string | null;
  revision: number;
}

export interface ProjectTodoList {
  todos: ProjectTodoItem[];
  canEdit: boolean;
  canDelete: boolean;
}

export function normalizeProjectTodoContent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const content = value.trim();
  return content && content.length <= PROJECT_TODO_CONTENT_LIMIT
    ? content
    : null;
}
