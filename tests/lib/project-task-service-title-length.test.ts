import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  task: {
    aggregate: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  taskRelation: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  createTaskForProject,
  type CreateTaskForProjectInput,
  updateTaskForProject,
} from "@/lib/services/project-task-service";
import { MAX_TASK_TITLE_LENGTH } from "@/lib/task-title";

function buildCreateInput(
  overrides?: Partial<CreateTaskForProjectInput>
): CreateTaskForProjectInput {
  return {
    actorUserId: "owner-1",
    projectId: "project-1",
    title: "Ship title length cap",
    description: "<p>Body</p>",
    deadlineDate: "",
    epicId: null,
    assigneeUserId: null,
    labelsJsonRaw: "",
    relatedTaskIdsJsonRaw: "",
    attachmentLinksJsonRaw: "",
    attachmentFiles: [],
    ...overrides,
  };
}

describe("task title length cap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("createTaskForProject rejects titles longer than 120 characters before touching the database", async () => {
    const result = await createTaskForProject(
      buildCreateInput({ title: "a".repeat(MAX_TASK_TITLE_LENGTH + 1) })
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "title-too-long",
    });
    expect(prismaMock.task.create).not.toHaveBeenCalled();
    expect(prismaMock.project.findFirst).not.toHaveBeenCalled();
  });

  test("updateTaskForProject rejects titles longer than 120 characters before touching the database", async () => {
    const result = await updateTaskForProject(
      "project-1",
      "task-1",
      { title: "a".repeat(MAX_TASK_TITLE_LENGTH + 1) },
      "owner-1"
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "title-too-long",
    });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
    expect(prismaMock.task.findUnique).not.toHaveBeenCalled();
  });

  test("titles of exactly 120 characters pass the create and update guards", async () => {
    const atLimitTitle = "a".repeat(MAX_TASK_TITLE_LENGTH);

    prismaMock.project.findFirst.mockResolvedValueOnce(null);
    expect(
      await createTaskForProject(buildCreateInput({ title: atLimitTitle }))
    ).toEqual({
      ok: false,
      status: 404,
      error: "project-not-found",
    });

    prismaMock.project.findFirst.mockResolvedValueOnce({
      ownerId: "owner-1",
      memberships: [],
    });
    prismaMock.task.findUnique.mockResolvedValueOnce(null);
    expect(
      await updateTaskForProject(
        "project-1",
        "task-1",
        { title: atLimitTitle },
        "owner-1"
      )
    ).toEqual({
      ok: false,
      status: 404,
      error: "Task not found",
    });
  });
});
