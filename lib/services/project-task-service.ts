// Public Task application-service seam. Internal use cases keep authorization,
// actor-scoped transactions, and side-effect ordering together.
export { MAX_BULK_TASK_OPERATIONS } from "@/lib/task-bulk";
export { type CreateTaskForProjectInput, type UpdatedTaskPayload } from "./tasks/task-types";
export { createTaskForProject, updateTaskForProject } from "./tasks/task-write-use-cases";
export {
  reorderProjectTasks,
  moveTaskStatusForProject,
  archiveTaskForProject,
  unarchiveTaskForProject,
  deleteTaskForProject,
} from "./tasks/task-lifecycle-use-cases";
export {
  isTaskStatusTransitionPayload,
  isValidReorderPayload,
  parseTaskAssigneeInput,
  validateTaskCreateFieldTypes,
  type CreateTaskCommand,
  type InvalidRelatedTaskDiagnostic,
  type ReorderColumnPayload,
  type ReorderPayload,
  type TaskStatusTransitionPayload,
  type UpdateTaskCommand,
  type UpdateTaskPayload,
} from "@/lib/task-contracts";
