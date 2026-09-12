import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogClose: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DialogContent: ({ children }: React.PropsWithChildren) => (
    <div role="dialog">{children}</div>
  ),
  DialogDescription: ({ children }: React.PropsWithChildren) => (
    <p>{children}</p>
  ),
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

import { ProjectOffboardingDialog } from "@/components/project-dashboard/project-offboarding-dialog";

(globalThis as { React?: typeof React }).React = React;

const inventory = {
  taskAssignments: 2,
  contextCardStewardships: 1,
  meetingNoteStewardships: 3,
  meetingTodoAssignments: 4,
  total: 10,
};

describe("project-offboarding-dialog", () => {
  test("shows categorized responsibility choices in an accessible dialog", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectOffboardingDialog, {
        isOpen: true,
        variant: "remove-member",
        actorLabel: "Morgan",
        inventory,
        replacementCandidates: [
          {
            id: "owner-1",
            membershipId: "membership-owner",
            displayName: "Project Owner",
            usernameTag: "owner#1234",
            email: "owner@example.com",
            avatarSeed: "owner",
            role: "owner",
            joinedAt: "2026-09-09T10:00:00.000Z",
            isOwner: true,
          },
        ],
        suggestedReplacementUserId: "owner-1",
        isLoading: false,
        isSubmitting: false,
        error: "Choose how to resolve active responsibilities.",
        onCancel: () => {},
        onConfirm: () => {},
      })
    );

    expect(result).toContain("Remove Morgan?");
    expect(result).toContain("Active task assignments");
    expect(result).toContain("Context cards");
    expect(result).toContain("Active meeting notes");
    expect(result).toContain("Open meeting todos");
    expect(result).toContain("10 total");
    expect(result).toContain("Reassign active work");
    expect(result).toContain("Leave active work unassigned");
    expect(result).toContain('aria-label="Responsibility replacement"');
    expect(result).toContain('role="alert"');
    expect(result).toContain("min-h-11");
  });

  test("explains stay and leave outcomes for ownership transfer", () => {
    const result = renderToStaticMarkup(
      React.createElement(ProjectOffboardingDialog, {
        isOpen: true,
        variant: "transfer-owner",
        actorLabel: "Current Owner",
        transferTargetLabel: "Morgan",
        inventory: { ...inventory, total: 0 },
        replacementCandidates: [],
        isLoading: false,
        isSubmitting: false,
        error: null,
        onCancel: () => {},
        onConfirm: () => {},
      })
    );

    expect(result).toContain("Transfer ownership to Morgan?");
    expect(result).toContain("Stay as editor");
    expect(result).toContain("Leave project");
    expect(result).toContain("Transfer ownership");
  });
});
