import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: vi.fn(),
}));

vi.mock("@/lib/services/project-access-service", () => ({
  buildProjectPrincipalWhere: vi.fn(),
  requireAgentProjectScopes: vi.fn(),
  requireProjectRole: vi.fn(),
}));

import {
  projectContextCard,
  type ContextCardCardRecord,
} from "@/lib/services/context-card-projection-service";

const referenceNowMs = new Date("2026-07-20T12:00:00.000Z").getTime();
const day = 24 * 60 * 60 * 1000;

describe("context-card projection", () => {
  const baseCard: ContextCardCardRecord = {
    id: "card-1",
    projectId: "project-1",
    updatedAt: new Date(referenceNowMs - 100 * day),
    createdByUserId: "user-1",
    createdByCredentialId: null,
    creatorKind: "human",
    creatorDisplayNameSnapshot: "Ada Lovelace",
    lastEditedByUserId: "user-1",
    lastEditedByCredentialId: null,
    lastEditorKind: "human",
    lastEditorDisplayNameSnapshot: "Ada Lovelace",
    createdByUser: {
      id: "user-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      username: "ada",
      usernameDiscriminator: "0001",
      avatarSeed: "seed-ada",
    },
    lastEditedByUser: {
      id: "user-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      username: "ada",
      usernameDiscriminator: "0001",
      avatarSeed: "seed-ada",
    },
    attachments: [
      {
        id: "att-1",
        kind: "link",
        name: "Design spec",
        url: "https://example.com/spec",
        mimeType: null,
        sizeBytes: null,
        uploadedByUserId: "user-1",
        uploadedByKind: "human",
        uploadedByDisplayNameSnapshot: "ada",
        createdAt: new Date(referenceNowMs - 10 * day),
        uploadedBy: {
          id: "user-1",
          name: "Ada Lovelace",
          email: "ada@example.com",
          username: "ada",
          usernameDiscriminator: "0001",
          avatarSeed: "seed-ada",
        },
      },
    ],
  };

  test("captures creator, last editor, and attachment uploader", () => {
    const projection = projectContextCard({ card: baseCard });

    expect(projection.creator).toMatchObject({
      kind: "human",
      id: "user-1",
      displayName: "ada",
    });
    expect(projection.lastEditor).toMatchObject({
      kind: "human",
      id: "user-1",
      displayName: "ada",
    });
    expect(projection.attachments).toHaveLength(1);
    expect(projection.attachments[0].uploadedBy).toMatchObject({
      kind: "human",
      id: "user-1",
    });
  });

  test("falls back to display snapshots when actor rows are missing", () => {
    const cardWithoutUsers: ContextCardCardRecord = {
      ...baseCard,
      createdByUser: undefined,
      lastEditedByUser: undefined,
      attachments: [
        {
          id: "att-1",
          kind: "link",
          name: "Design spec",
          url: "https://example.com/spec",
          mimeType: null,
          sizeBytes: null,
          uploadedByUserId: "user-1",
          uploadedByKind: "human",
          uploadedByDisplayNameSnapshot: "ada",
          createdAt: new Date(referenceNowMs - 10 * day),
          uploadedBy: undefined,
        },
      ],
    };

    const projection = projectContextCard({ card: cardWithoutUsers });

    expect(projection.creator).toMatchObject({
      kind: "human",
      displayName: "Ada Lovelace",
      isAssignable: false,
    });
    expect(projection.attachments[0].uploadedBy).toMatchObject({
      kind: "human",
      displayName: "ada",
    });
  });

  test("returns null editor projection when no editor provenance exists", () => {
    const cardWithoutEditor: ContextCardCardRecord = {
      ...baseCard,
      lastEditedByUserId: null,
      lastEditedByCredentialId: null,
      lastEditorKind: null,
      lastEditorDisplayNameSnapshot: null,
      lastEditedByUser: undefined,
    };

    const projection = projectContextCard({ card: cardWithoutEditor });

    expect(projection.lastEditor).toBeNull();
  });
});
