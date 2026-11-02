// Public Task application-service seam. Internal use cases keep authorization,
// actor-scoped transactions, and side-effect ordering together.
export { MAX_BULK_TASK_OPERATIONS } from "@/lib/task-bulk";
export {
  listProjectKanbanTasks,
  getProjectKanbanTaskById,
  type TaskListAssigneeFilter,
  type TaskListFilters,
} from "./tasks/task-read-use-cases";
export type { ProjectKanbanTaskRecord } from "./tasks/task-projections";
export type {
  InvalidRelatedTaskDiagnostic,
  ReorderColumnPayload,
  ReorderPayload,
  UpdateTaskPayload,
  CreateTaskForProjectInput,
  UpdatedTaskPayload,
  TaskStatusTransitionPayload,
} from "./tasks/task-types";
export {
  validateTaskCreateFieldTypes,
  parseTaskAssigneeInput,
  isValidReorderPayload,
  isTaskStatusTransitionPayload,
} from "./tasks/task-input";
export {
  createTaskForProject,
  updateTaskForProject,
} from "./tasks/task-write-use-cases";
export {
  reorderProjectTasks,
  moveTaskStatusForProject,
  archiveTaskForProject,
  unarchiveTaskForProject,
  deleteTaskForProject,
} from "./tasks/task-lifecycle-use-cases";
