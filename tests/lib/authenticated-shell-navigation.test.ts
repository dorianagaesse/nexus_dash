import { describe, expect, test } from "vitest";

import {
  buildAuthenticatedDestinationHref,
  buildNotificationTargetHref,
  isDestinationCurrent,
  normalizeAuthenticatedReturnToPath,
  resolveContextualReturnDestination,
  resolvePreservedOrigin,
} from "@/lib/navigation/authenticated-shell";

describe("authenticated shell navigation", () => {
  test("preserves project query and hash state through account detours", () => {
    const origin = "/projects/project-1?taskId=task-7#kanban";
    const notificationsHref = buildAuthenticatedDestinationHref(
      "/account/notifications",
      origin
    );

    expect(notificationsHref).toBe(
      "/account/notifications?returnTo=%2Fprojects%2Fproject-1%3FtaskId%3Dtask-7%23kanban"
    );
    expect(resolvePreservedOrigin(notificationsHref)).toBe(origin);
    expect(
      buildAuthenticatedDestinationHref("/account/settings", notificationsHref)
    ).toBe(
      "/account/settings?returnTo=%2Fprojects%2Fproject-1%3FtaskId%3Dtask-7%23kanban"
    );
  });

  test("carries notification-list context into task targets", () => {
    expect(
      buildNotificationTargetHref(
        "/projects/project-1?taskId=task-7",
        "/account/notifications?returnTo=%2Fprojects%2Fproject-1"
      )
    ).toBe(
      "/projects/project-1?taskId=task-7&returnTo=%2Faccount%2Fnotifications%3FreturnTo%3D%252Fprojects%252Fproject-1"
    );
  });

  test("rejects external, protocol-relative, API, and unrelated return paths", () => {
    expect(normalizeAuthenticatedReturnToPath("https://evil.test")).toBe(
      "/projects"
    );
    expect(normalizeAuthenticatedReturnToPath("//evil.test/path")).toBe(
      "/projects"
    );
    expect(normalizeAuthenticatedReturnToPath("/api/account/profile")).toBe(
      "/projects"
    );
    expect(normalizeAuthenticatedReturnToPath("/account/settings")).toBe(
      "/projects"
    );
    expect(
      buildNotificationTargetHref(
        "/api/account/profile",
        "/account/notifications"
      )
    ).toBe(
      "/projects?returnTo=%2Faccount%2Fnotifications"
    );
  });

  test("provides predictable direct-entry and contextual labels", () => {
    expect(resolvePreservedOrigin("/account/settings")).toBe("/projects");
    expect(
      resolveContextualReturnDestination(undefined, {
        href: "/account",
        label: "Account",
      })
    ).toEqual({ href: "/account", label: "Account" });
    expect(
      resolveContextualReturnDestination("/account/notifications", {
        href: "/projects",
        label: "Projects",
      })
    ).toEqual({
      href: "/account/notifications",
      label: "Return to notifications",
    });
  });

  test("marks only the matching primary destination current", () => {
    expect(isDestinationCurrent("/projects/project-1", "/projects")).toBe(true);
    expect(
      isDestinationCurrent("/account/settings/developers", "/account/settings")
    ).toBe(true);
    expect(isDestinationCurrent("/account/settings", "/account")).toBe(false);
  });
});
