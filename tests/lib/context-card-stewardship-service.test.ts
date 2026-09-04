import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

const rlsContextMock = vi.hoisted(() => ({ withActorRlsContext: vi.fn() }));
const projectAccessMock = vi.hoisted(() => ({
  requireAgentProjectScopes: vi.fn(),
  requireProjectRole: vi.fn(),
}));

vi.mock("@/lib/services/rls-context", () => ({
  withActorRlsContext: rlsContextMock.withActorRlsContext,
}));

vi.mock("@/lib/services/project-access-service", () => ({
  buildProjectPrincipalWhere: vi.fn(),
  requireAgentProjectScopes: projectAccessMock.requireAgentProjectScopes,
  requireProjectRole: projectAccessMock.requireProjectRole,
}));

vi.mock("@/lib/services/project-activity-service", () => ({
  touchProjectActivity: vi.fn(),
}));

import {
  assignContextCardSteward,
  getContextCardReviewThresholdDays,
  projectContextCard,
  resolveContextCardReviewState,
  type ContextCardCardRecord,
} from "@/lib/services/context-card-stewardship-service";

const referenceNowMs = new Date("2026-07-20T12:00:00.000Z").getTime();
const day = 24 * 60 * 60 * 1000;

describe("context-card review state", () => {
  test("uses the default 90 day threshold when env is unset", () => {
    const original = process.env.CONTEXT_CARD_REVIEW_THRESHOLD_DAYS;
    delete process.env.CONTEXT_CARD_REVIEW_THRESHOLD_DAYS;
    try {
      expect(getContextCardReviewThresholdDays()).toBe(90);
    } finally {
      if (original !== undefined) {
        process.env.CONTEXT_CARD_REVIEW_THRESHOLD_DAYS = original;
      }
    }
  });

  test("uses an explicit positive env override when provided", () => {
    const original = process.env.CONTEXT_CARD_REVIEW_THRESHOLD_DAYS;
    process.env.CONTEXT_CARD_REVIEW_THRESHOLD_DAYS = "30";
    try {
      expect(getContextCardReviewThresholdDays()).toBe(30);
    } finally {
      if (original !== undefined) {
        process.env.CONTEXT_CARD_REVIEW_THRESHOLD_DAYS = original;
      } else {
        delete process.env.CONTEXT_CARD_REVIEW_THRESHOLD_DAYS;
      }
    }
  });

  test("falls back to default when env override is non-positive", () => {
    const original = process.env.CONTEXT_CARD_REVIEW_THRESHOLD_DAYS;
    process.env.CONTEXT_CARD_REVIEW_THRESHOLD_DAYS = "-5";
    try {
      expect(getContextCardReviewThresholdDays()).toBe(90);
    } finally {
      if (original !== undefined) {
        process.env.CONTEXT_CARD_REVIEW_THRESHOLD_DAYS = original;
      } else {
        delete process.env.CONTEXT_CARD_REVIEW_THRESHOLD_DAYS;
      }
    }
  });

  test("marks a card as needing review past the threshold", () => {
    const updatedAt = new Date(referenceNowMs - 91 * day);
    const review = resolveContextCardReviewState({
      updatedAt,
      referenceNowMs,
    });
    expect(review.needsReview).toBe(true);
    expect(review.thresholdDays).toBe(90);
    expect(review.lastEditedAt).toEqual(updatedAt);
  });

  test("keeps a freshly edited card out of the review queue", () => {
    const updatedAt = new Date(referenceNowMs - 30 * day);
    const review = resolveContextCardReviewState({
      updatedAt,
      referenceNowMs,
    });
    expect(review.needsReview).toBe(false);
  });

  test("honors an explicit threshold override", () => {
    const updatedAt = new Date(referenceNowMs - 45 * day);
    expect(
      resolveContextCardReviewState({
        updatedAt,
        referenceNowMs,
        thresholdDays: 30,
      }).needsReview
    ).toBe(true);
    expect(
      resolveContextCardReviewState({
        updatedAt,
        referenceNowMs,
        thresholdDays: 60,
      }).needsReview
    ).toBe(false);
  });
});

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
    stewardUserId: null,
    stewardCredentialId: "cred-1",
    stewardKind: "agent",
    stewardDisplayNameSnapshot: "Release:bot",
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
    stewardUser: null,
    stewardCredential: {
      id: "cred-1",
      label: "Release:bot",
      projectId: "project-1",
      revokedAt: null,
      expiresAt: null,
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

  beforeEach(() => {
    vi.clearAllMocks();
    projectAccessMock.requireAgentProjectScopes.mockReturnValue({ ok: true });
    projectAccessMock.requireProjectRole.mockResolvedValue({ ok: true, role: "editor" });
  });

  test("captures creator, last editor, steward, and review state", () => {
    const projection = projectContextCard({
      card: baseCard,
      referenceNowMs,
    });

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
    expect(projection.steward).toMatchObject({
      kind: "agent",
      id: "cred-1",
      displayName: "Release:bot",
    });
    expect(projection.review.needsReview).toBe(true);
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
      stewardCredential: undefined,
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

    const projection = projectContextCard({
      card: cardWithoutUsers,
      referenceNowMs,
    });

    expect(projection.creator).toMatchObject({
      kind: "human",
      displayName: "Ada Lovelace",
      isAssignable: false,
    });
    expect(projection.steward).toMatchObject({
      kind: "agent",
      displayName: "Release:bot",
      isAssignable: false,
    });
    expect(projection.attachments[0].uploadedBy).toMatchObject({
      kind: "human",
      displayName: "ada",
    });
  });

  test("marks a card needing review via threshold when the env is overridden", () => {
    vi.stubEnv("CONTEXT_CARD_REVIEW_THRESHOLD_DAYS", "5");
    const freshCard: ContextCardCardRecord = {
      ...baseCard,
      updatedAt: new Date(referenceNowMs - 10 * day),
    };
    const projection = projectContextCard({
      card: freshCard,
      referenceNowMs,
    });
    expect(projection.review.needsReview).toBe(true);
    expect(projection.review.thresholdDays).toBe(5);
    vi.unstubAllEnvs();
  });

  test("preserves the last-edit timestamp during stewardship-only changes", async () => {
    const db = {
      resource: {
        findFirst: vi.fn().mockResolvedValue({
          id: baseCard.id,
          updatedAt: baseCard.updatedAt,
        }),
        update: vi.fn().mockResolvedValue({ ...baseCard, stewardKind: null }),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    rlsContextMock.withActorRlsContext.mockImplementation(
      (_actorUserId: string, callback: (client: typeof db) => unknown) => callback(db)
    );

    const result = await assignContextCardSteward({
      actorUserId: "user-1",
      projectId: "project-1",
      cardId: baseCard.id,
      steward: null,
      referenceNowMs,
    });

    expect(result.ok).toBe(true);
    expect(db.resource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ updatedAt: baseCard.updatedAt }),
      })
    );
    if (result.ok) {
      expect(result.data.lastEditedAt).toEqual(baseCard.updatedAt);
    }
  });
});
