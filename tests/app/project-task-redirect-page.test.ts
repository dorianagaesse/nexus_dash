import { describe, expect, test, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import ProjectTaskRedirectPage from "@/app/projects/[projectId]/tasks/[taskId]/page";

describe("project task redirect page", () => {
  test("redirects stale task detail links to the dashboard task target", async () => {
    redirectMock.mockImplementationOnce((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    await expect(
      ProjectTaskRedirectPage({
        params: Promise.resolve({
          projectId: "project 1",
          taskId: "task/1",
        }),
      })
    ).rejects.toThrow(
      "NEXT_REDIRECT:/projects/project%201?taskId=task%2F1"
    );

    expect(redirectMock).toHaveBeenCalledWith(
      "/projects/project%201?taskId=task%2F1"
    );
  });
});
