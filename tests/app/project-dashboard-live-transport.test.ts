import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

const serverGuardMock = vi.hoisted(() => ({
  requireSessionUserIdFromServer: vi.fn(),
}));

const projectServiceMock = vi.hoisted(() => ({
  getProjectSummaryById: vi.fn(),
  listProjectCollaborators: vi.fn(),
}));

vi.mock("@/lib/auth/server-guard", () => ({
  requireSessionUserIdFromServer: serverGuardMock.requireSessionUserIdFromServer,
}));

vi.mock("@/lib/services/project-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/project-service")>();
  return {
    ...actual,
    getProjectSummaryById: projectServiceMock.getProjectSummaryById,
    listProjectCollaborators: projectServiceMock.listProjectCollaborators,
  };
});

import ProjectDashboardPage from "@/app/projects/[projectId]/page";
import { ProjectLiveRefresh } from "@/components/project-live-refresh";

function findElement(
  node: ReactNode,
  type: unknown
): ReactElement<{ streamEnabled?: boolean }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) {
        return found;
      }
    }

    return null;
  }

  if (!isValidElement(node)) {
    return null;
  }

  if (node.type === type) {
    return node as ReactElement<{ streamEnabled?: boolean }>;
  }

  const children = (node.props as { children?: ReactNode }).children;
  return children === undefined ? null : findElement(children, type);
}

async function renderDashboardElement() {
  return ProjectDashboardPage({
    params: Promise.resolve({ projectId: "project-1" }),
    searchParams: Promise.resolve({}),
  });
}

describe("project dashboard realtime transport wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverGuardMock.requireSessionUserIdFromServer.mockResolvedValue("user-1");
    projectServiceMock.getProjectSummaryById.mockResolvedValue({
      id: "project-1",
      name: "Alpha",
      description: null,
      ownerId: "user-1",
      updatedAt: new Date("2026-09-20T08:00:00.000Z"),
      memberships: [],
      stats: {
        trackedTasks: 0,
        openTasks: 0,
        completedTasks: 0,
        contextCards: 0,
        meetingNotes: 0,
        attachmentCount: 0,
        isCalendarConnected: false,
      },
    });
    projectServiceMock.listProjectCollaborators.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("enables the activity stream by default outside preview", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const element = await renderDashboardElement();

    expect(findElement(element, ProjectLiveRefresh)?.props.streamEnabled).toBe(
      true
    );
  });

  test("disables the activity stream on Vercel Preview by default", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    const element = await renderDashboardElement();

    expect(findElement(element, ProjectLiveRefresh)?.props.streamEnabled).toBe(
      false
    );
  });
});
