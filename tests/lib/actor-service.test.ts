import { beforeEach, describe, expect, test, vi } from "vitest";

const envServerMock = vi.hoisted(() => ({
  getOptionalServerEnv: vi.fn<(name: string) => string | null | undefined>(),
  getRuntimeEnvironment: vi.fn<
    () => "development" | "production" | "test" | "staging"
  >(),
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    user: {
      upsert: vi.fn(),
    },
  },
}));

const loggerMock = vi.hoisted(() => ({
  logServerWarning: vi.fn(),
}));

vi.mock("@/lib/env.server", () => envServerMock);
vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/observability/logger", () => loggerMock);

async function importActorService() {
  return import("@/lib/services/actor-service");
}

describe("actor-service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    envServerMock.getOptionalServerEnv.mockReturnValue(null);
    envServerMock.getRuntimeEnvironment.mockReturnValue("test");
    prismaMock.prisma.user.upsert.mockResolvedValue({ id: "user" });
  });

  test("returns preferred actor in test env without persistence", async () => {
    const { resolveActorUserId } = await importActorService();

    const actorUserId = await resolveActorUserId({ preferredUserId: "  user-123  " });

    expect(actorUserId).toBe("user-123");
    expect(prismaMock.prisma.user.upsert).not.toHaveBeenCalled();
  });

  test("uses upsert for legacy actor in non-production env", async () => {
    envServerMock.getRuntimeEnvironment.mockReturnValue("development");
    const { resolveActorUserId } = await importActorService();

    const actorUserId = await resolveActorUserId({ preferredUserId: "legacy-user-1" });

    expect(actorUserId).toBe("legacy-user-1");
    expect(prismaMock.prisma.user.upsert).toHaveBeenCalledWith({
      where: { id: "legacy-user-1" },
      update: {},
      create: {
        id: "legacy-user-1",
        name: "Legacy Actor (legacy-user-)",
      },
    });
  });

  test("logs production bootstrap fallback warning once", async () => {
    envServerMock.getRuntimeEnvironment.mockReturnValue("production");
    const { resolveActorUserId } = await importActorService();

    const firstActor = await resolveActorUserId();
    const secondActor = await resolveActorUserId();

    expect(firstActor).toBe("bootstrap-owner");
    expect(secondActor).toBe("bootstrap-owner");
    expect(loggerMock.logServerWarning).toHaveBeenCalledTimes(1);
    expect(loggerMock.logServerWarning).toHaveBeenCalledWith(
      "resolveActorUserId.productionBootstrapFallback",
      "Auth bootstrap fallback is active in production. TASK-046 auth middleware is not enabled yet."
    );
  });
});
