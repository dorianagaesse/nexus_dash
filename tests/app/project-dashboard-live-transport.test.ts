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
): ReactElement<{ broadcastEnabled?: boolean }> | null {
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
    return node as ReactElement<{ broadcastEnabled?: boolean }>;
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
    // "Default" assertions mean REALTIME_TRANSPORT is unset; the ambient value
    // may be pinned by the environment (CI pins polling for production-like
    // builds).
    vi.stubEnv("REALTIME_TRANSPORT", "");
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

  test("enables Broadcast by default in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const element = await renderDashboardElement();

    expect(
      findElement(element, ProjectLiveRefresh)?.props.broadcastEnabled
    ).toBe(true);
  });

  test("keeps polling on Vercel Preview by default", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    const element = await renderDashboardElement();

    expect(
      findElement(element, ProjectLiveRefresh)?.props.broadcastEnabled
    ).toBe(false);
  });

  test("honors an explicit polling override in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REALTIME_TRANSPORT", "polling");
    const element = await renderDashboardElement();

    expect(
      findElement(element, ProjectLiveRefresh)?.props.broadcastEnabled
    ).toBe(false);
  });
});
