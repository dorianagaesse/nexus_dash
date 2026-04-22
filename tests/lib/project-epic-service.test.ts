import { beforeEach, describe, expect, test, vi } from "vitest";

const projectAccessServiceMock = vi.hoisted(() => ({
  requireAgentProjectScopes: vi.fn(),
  requireProjectRole: vi.fn(),
}));

const rlsContextMock = vi.hoisted(() => ({
  withActorRlsContext: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logServerError: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  epic: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/services/project-access-service", () => ({
  requireAgentProjectScopes: projectAccessServiceMock.requireAgentProjectScopes,
  requireProjectRole: projectAccessServiceMock.requireProjectRole,
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: rlsContextMock.withActorRlsContext,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: loggerMock.logServerError,
}));

import {
  createProjectEpic,
  updateProjectEpic,
} from "@/lib/services/project-epic-service";

describe("project-epic-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    projectAccessServiceMock.requireAgentProjectScopes.mockReturnValue({ ok: true });
    projectAccessServiceMock.requireProjectRole.mockResolvedValue({
      ok: true,
      role: "owner",
    });
    rlsContextMock.withActorRlsContext.mockImplementation(
      async (_actorUserId: string, operation: (db: typeof dbMock) => unknown) =>
        operation(dbMock)
    );
  });

  test("maps concurrent create uniqueness failures to epic-name-conflict", async () => {
    dbMock.epic.findFirst.mockResolvedValueOnce(null);
    dbMock.epic.create.mockRejectedValueOnce({ code: "P2002" });

    const result = await createProjectEpic({
      actorUserId: "user-1",
      projectId: "project-1",
      name: "Launch workspace",
      description: "Deliver the workspace launch slice.",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "epic-name-conflict",
    });
    expect(loggerMock.logServerError).not.toHaveBeenCalled();
  });

  test("maps concurrent update uniqueness failures to epic-name-conflict", async () => {
    dbMock.epic.findFirst
      .mockResolvedValueOnce({ id: "epic-1" })
      .mockResolvedValueOnce(null);
    dbMock.epic.update.mockRejectedValueOnce({ code: "P2002" });

    const result = await updateProjectEpic({
      actorUserId: "user-1",
      projectId: "project-1",
      epicId: "epic-1",
      name: "Launch workspace",
      description: "Refine the launch scope.",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "epic-name-conflict",
    });
    expect(loggerMock.logServerError).not.toHaveBeenCalled();
  });
});
