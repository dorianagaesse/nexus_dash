import assert from "node:assert/strict";
import crypto from "node:crypto";
import process from "node:process";

import pg from "pg";

const { Client } = pg;

const adminDatabaseUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const runtimeDatabaseUrl = process.env.RLS_TEST_RUNTIME_DATABASE_URL;

if (!adminDatabaseUrl || !runtimeDatabaseUrl) {
  throw new Error(
    "RLS_TEST_ADMIN_DATABASE_URL and RLS_TEST_RUNTIME_DATABASE_URL are required."
  );
}

const suffix = crypto.randomUUID().replaceAll("-", "");
const ids = {
  ownerA: `rls_owner_a_${suffix}`,
  ownerB: `rls_owner_b_${suffix}`,
  editorB: `rls_editor_b_${suffix}`,
  viewerB: `rls_viewer_b_${suffix}`,
  revokedB: `rls_revoked_b_${suffix}`,
  outsider: `rls_outsider_${suffix}`,
  projectA: `rls_project_a_${suffix}`,
  projectB: `rls_project_b_${suffix}`,
  taskA: `rls_task_a_${suffix}`,
  taskB: `rls_task_b_${suffix}`,
  commentA: `rls_comment_a_${suffix}`,
  commentB: `rls_comment_b_${suffix}`,
  reactionA: `rls_reaction_a_${suffix}`,
  reactionB: `rls_reaction_b_${suffix}`,
  meetingA: `rls_meeting_a_${suffix}`,
  meetingB: `rls_meeting_b_${suffix}`,
  meetingActionB: `rls_meeting_action_b_${suffix}`,
  resourceB: `rls_resource_b_${suffix}`,
  participantA: `rls_participant_a_${suffix}`,
  participantB: `rls_participant_b_${suffix}`,
  credentialA: `rls_credential_a_${suffix}`,
  credentialB: `rls_credential_b_${suffix}`,
  credentialB2: `rls_credential_b2_${suffix}`,
  mentionA: `rls_mention_a_${suffix}`,
  mentionB: `rls_mention_b_${suffix}`,
  auditA: `rls_audit_a_${suffix}`,
  auditB: `rls_audit_b_${suffix}`,
  calendarA: `rls_calendar_a_${suffix}`,
  calendarB: `rls_calendar_b_${suffix}`,
  calendarSourceA: `rls_calendar_source_a_${suffix}`,
  calendarSourceB: `rls_calendar_source_b_${suffix}`,
};

const admin = new Client({ connectionString: adminDatabaseUrl });
const runtime = new Client({ connectionString: runtimeDatabaseUrl });

async function runtimeTransaction(actorUserId, operation) {
  await runtime.query("BEGIN");
  try {
    if (actorUserId !== undefined) {
      await runtime.query("SELECT set_config('app.user_id', $1, true)", [
        actorUserId,
      ]);
    }
    const result = await operation();
    await runtime.query("ROLLBACK");
    return result;
  } catch (error) {
    await runtime.query("ROLLBACK");
    throw error;
  }
}

async function adminTransaction(actorUserId, operation) {
  await admin.query("BEGIN");
  try {
    await admin.query("SELECT set_config('app.user_id', $1, true)", [
      actorUserId,
    ]);
    const result = await operation();
    await admin.query("ROLLBACK");
    return result;
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
}

async function expectRlsViolation(operation, label) {
  await assert.rejects(operation, (error) => {
    assert.equal(error?.code, "42501", `${label} should fail with RLS denial`);
    return true;
  });
}

async function seed() {
  const users = [
    ids.ownerA,
    ids.ownerB,
    ids.editorB,
    ids.viewerB,
    ids.revokedB,
    ids.outsider,
  ];
  for (const userId of users) {
    await admin.query(
      `INSERT INTO "User" ("id", "email", "createdAt", "updatedAt")
       VALUES ($1, $2, NOW(), NOW())`,
      [userId, `${userId}@example.test`]
    );
  }

  await admin.query(
    `INSERT INTO "Project" ("id", "ownerId", "name", "createdAt", "updatedAt")
     VALUES
       ($1, $2, 'RLS Project A', NOW(), NOW()),
       ($3, $4, 'RLS Project B', NOW(), NOW())`,
    [ids.projectA, ids.ownerA, ids.projectB, ids.ownerB]
  );
  await admin.query(
    `INSERT INTO "ProjectMembership" ("id", "projectId", "userId", "role", "createdAt", "updatedAt")
     VALUES
       ($1, $2, $3, 'editor', NOW(), NOW()),
       ($4, $2, $5, 'viewer', NOW(), NOW()),
       ($6, $2, $7, 'editor', NOW(), NOW())`,
    [
      `rls_membership_editor_${suffix}`,
      ids.projectB,
      ids.editorB,
      `rls_membership_viewer_${suffix}`,
      ids.viewerB,
      `rls_membership_revoked_${suffix}`,
      ids.revokedB,
    ]
  );
  await admin.query(
    `INSERT INTO "Task"
      ("id", "title", "status", "position", "projectId", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
     VALUES
       ($1, 'Task A', 'Backlog', 0, $2, $3, $3, NOW(), NOW()),
       ($4, 'Task B', 'Backlog', 0, $5, $6, $6, NOW(), NOW())`,
    [ids.taskA, ids.projectA, ids.ownerA, ids.taskB, ids.projectB, ids.editorB]
  );
  await admin.query(
    `INSERT INTO "TaskComment" ("id", "taskId", "authorUserId", "content", "createdAt")
     VALUES
       ($1, $2, $3, 'Comment A', NOW()),
       ($4, $5, $6, 'Comment B', NOW())`,
    [
      ids.commentA,
      ids.taskA,
      ids.ownerA,
      ids.commentB,
      ids.taskB,
      ids.ownerB,
    ]
  );
  await admin.query(
    `INSERT INTO "TaskCommentReaction" ("id", "commentId", "userId", "emoji", "createdAt")
     VALUES
       ($1, $2, $3, 'thumbs-up', NOW()),
       ($4, $5, $6, 'check', NOW())`,
    [
      ids.reactionA,
      ids.commentA,
      ids.ownerA,
      ids.reactionB,
      ids.commentB,
      ids.ownerB,
    ]
  );
  await admin.query(
    `INSERT INTO "ProjectMeetingNote"
      ("id", "projectId", "title", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
     VALUES
       ($1, $2, 'Meeting A', $3, $3, NOW(), NOW()),
       ($4, $5, 'Meeting B', $6, $6, NOW(), NOW())`,
    [
      ids.meetingA,
      ids.projectA,
      ids.ownerA,
      ids.meetingB,
      ids.projectB,
      ids.editorB,
    ]
  );
  await admin.query(
    `UPDATE "Task"
     SET "assigneeUserId" = $1
     WHERE "id" = $2`,
    [ids.editorB, ids.taskB]
  );
  await admin.query(
    `UPDATE "ProjectMeetingNote"
     SET "stewardUserId" = $1,
         "stewardKind" = 'human',
         "stewardDisplayNameSnapshot" = 'Editor B'
     WHERE "id" = $2`,
    [ids.editorB, ids.meetingB]
  );
  await admin.query(
    `INSERT INTO "ProjectMeetingNoteAction"
      ("id", "meetingNoteId", "content", "createdByUserId", "creatorKind",
       "creatorDisplayNameSnapshot", "assigneeUserId", "assigneeKind",
       "assigneeDisplayNameSnapshot", "createdAt", "updatedAt")
     VALUES ($1, $2, 'Responsibility B', $3, 'human', 'Editor B',
       $3, 'human', 'Editor B', NOW(), NOW())`,
    [ids.meetingActionB, ids.meetingB, ids.editorB]
  );
  await admin.query(
    `INSERT INTO "Resource"
      ("id", "type", "name", "content", "projectId", "createdByUserId",
       "creatorKind", "creatorDisplayNameSnapshot", "lastEditedByUserId",
       "lastEditorKind", "lastEditorDisplayNameSnapshot", "stewardUserId",
       "stewardKind", "stewardDisplayNameSnapshot", "createdAt", "updatedAt")
     VALUES ($1, 'note', 'Resource B', 'Responsibility fixture', $2, $3,
       'human', 'Editor B', $3, 'human', 'Editor B', $3, 'human', 'Editor B',
       NOW(), NOW())`,
    [ids.resourceB, ids.projectB, ids.editorB]
  );
  await admin.query(
    `INSERT INTO "ProjectMeetingNoteParticipant"
      ("id", "meetingNoteId", "displayName", "position", "createdAt", "updatedAt")
     VALUES
       ($1, $2, 'Guest A', 0, NOW(), NOW()),
       ($3, $4, 'Guest B', 0, NOW(), NOW())`,
    [ids.participantA, ids.meetingA, ids.participantB, ids.meetingB]
  );
  await admin.query(
    `INSERT INTO "ApiCredential"
      ("id", "projectId", "createdByUserId", "label", "publicId", "secretHash", "createdAt", "updatedAt")
     VALUES
       ($1, $2, $3, 'Agent A', $4, 'hash-a', NOW(), NOW()),
       ($5, $6, $7, 'Agent B', $8, 'hash-b', NOW(), NOW()),
       ($9, $6, $7, 'Agent B2', $10, 'hash-b2', NOW(), NOW())`,
    [
      ids.credentialA,
      ids.projectA,
      ids.ownerA,
      `nda_${ids.credentialA}`,
      ids.credentialB,
      ids.projectB,
      ids.ownerB,
      `nda_${ids.credentialB}`,
      ids.credentialB2,
      `nda_${ids.credentialB2}`,
    ]
  );
  await admin.query(
    `INSERT INTO "ApiCredentialScopeGrant" ("credentialId", "scope", "createdAt")
     VALUES
       ($1, 'task_read', NOW()),
       ($2, 'task_write', NOW())`,
    [ids.credentialA, ids.credentialB]
  );
  await admin.query(
    `INSERT INTO "AuthAuditEvent"
      ("id", "projectId", "credentialId", "actorUserId", "actorKind", "action", "createdAt")
     VALUES
       ($1, $2, $3, $4, 'human', 'credential_created', NOW()),
       ($5, $6, $7, $8, 'human', 'credential_created', NOW())`,
    [
      ids.auditA,
      ids.projectA,
      ids.credentialA,
      ids.ownerA,
      ids.auditB,
      ids.projectB,
      ids.credentialB,
      ids.ownerB,
    ]
  );
  await admin.query(
    `INSERT INTO "TaskCommentAgentMention"
      ("id", "commentId", "taskId", "agentCredentialId", "agentLabel", "createdByUserId", "createdAt")
     VALUES
       ($1, $2, $3, $4, 'Agent A', $5, NOW()),
       ($6, $7, $8, $9, 'Agent B', $10, NOW())`,
    [
      ids.mentionA,
      ids.commentA,
      ids.taskA,
      ids.credentialA,
      ids.ownerA,
      ids.mentionB,
      ids.commentB,
      ids.taskB,
      ids.credentialB,
      ids.ownerB,
    ]
  );
  await admin.query(
    `INSERT INTO "CalendarConnection"
      ("id", "userId", "provider", "providerAccountId", "accountLabel", "refreshToken", "createdAt", "updatedAt")
     VALUES
       ($1, $2, 'google', 'sub-a', 'Account A', 'refresh-a', NOW(), NOW()),
       ($3, $4, 'google', 'sub-b', 'Account B', 'refresh-b', NOW(), NOW())`,
    [ids.calendarA, ids.ownerA, ids.calendarB, ids.ownerB]
  );
  await admin.query(
    `INSERT INTO "CalendarSource"
      ("id", "userId", "connectionId", "providerCalendarId", "name", "accessRole", "isPrimary", "isSelected", "createdAt", "updatedAt")
     VALUES
       ($1, $2, $3, 'primary-a', 'Primary A', 'owner', true, true, NOW(), NOW()),
       ($4, $5, $6, 'primary-b', 'Primary B', 'owner', true, true, NOW(), NOW())`,
    [
      ids.calendarSourceA,
      ids.ownerA,
      ids.calendarA,
      ids.calendarSourceB,
      ids.ownerB,
      ids.calendarB,
    ]
  );
  await admin.query(
    `INSERT INTO "CalendarPreference"
      ("userId", "defaultConnectionId", "writeSourceId", "createdAt", "updatedAt")
     VALUES
       ($1, $2, $3, NOW(), NOW()),
       ($4, $5, $6, NOW(), NOW())`,
    [
      ids.ownerA,
      ids.calendarA,
      ids.calendarSourceA,
      ids.ownerB,
      ids.calendarB,
      ids.calendarSourceB,
    ]
  );
}

async function cleanup() {
  await admin.query(`DELETE FROM "User" WHERE "id" = ANY($1::TEXT[])`, [
    [
      ids.ownerA,
      ids.ownerB,
      ids.editorB,
      ids.viewerB,
      ids.revokedB,
      ids.outsider,
    ],
  ]);
}

await admin.connect();
await runtime.connect();

try {
  const role = await admin.query(
    `
      SELECT rolsuper, rolbypassrls
      FROM pg_roles
      WHERE rolname = $1
    `,
    [decodeURIComponent(new URL(runtimeDatabaseUrl).username)]
  );
  assert.equal(role.rowCount, 1);
  assert.equal(role.rows[0].rolsuper, false);
  assert.equal(role.rows[0].rolbypassrls, false);

  await seed();

  const noActorProjects = await runtimeTransaction(undefined, () =>
    runtime.query(`SELECT "id" FROM "Project" WHERE "id" IN ($1, $2)`, [
      ids.projectA,
      ids.projectB,
    ])
  );
  assert.equal(noActorProjects.rowCount, 0);

  const unknownActorProjects = await runtimeTransaction(ids.outsider, () =>
    runtime.query(`SELECT "id" FROM "Project" WHERE "id" IN ($1, $2)`, [
      ids.projectA,
      ids.projectB,
    ])
  );
  assert.equal(unknownActorProjects.rowCount, 0);

  const ownerAProjects = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`SELECT "id" FROM "Project" WHERE "id" IN ($1, $2)`, [
      ids.projectA,
      ids.projectB,
    ])
  );
  assert.deepEqual(ownerAProjects.rows.map((row) => row.id), [ids.projectA]);

  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerA, () =>
        runtime.query(
          `INSERT INTO "Task"
            ("id", "title", "status", "position", "projectId", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
           VALUES ($1, 'Cross tenant', 'Backlog', 0, $2, $3, $3, NOW(), NOW())`,
          [`rls_cross_insert_${suffix}`, ids.projectB, ids.ownerA]
        )
      ),
    "cross-project task insert"
  );

  const crossUpdate = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`UPDATE "Task" SET "title" = 'Blocked' WHERE "id" = $1`, [
      ids.taskB,
    ])
  );
  assert.equal(crossUpdate.rowCount, 0);

  const crossDelete = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`DELETE FROM "Task" WHERE "id" = $1`, [ids.taskB])
  );
  assert.equal(crossDelete.rowCount, 0);

  const editorRead = await runtimeTransaction(ids.editorB, () =>
    runtime.query(`SELECT "id" FROM "Task" WHERE "id" = $1`, [ids.taskB])
  );
  assert.equal(editorRead.rowCount, 1);
  const editorUpdate = await runtimeTransaction(ids.editorB, () =>
    runtime.query(`UPDATE "Task" SET "title" = 'Editor update' WHERE "id" = $1`, [
      ids.taskB,
    ])
  );
  assert.equal(editorUpdate.rowCount, 1);
  const editorDelete = await runtimeTransaction(ids.editorB, () =>
    runtime.query(`DELETE FROM "Task" WHERE "id" = $1`, [ids.taskB])
  );
  assert.equal(editorDelete.rowCount, 0);

  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.viewerB, () =>
        runtime.query(
          `INSERT INTO "Task"
            ("id", "title", "status", "position", "projectId", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
           VALUES ($1, 'Viewer insert', 'Backlog', 0, $2, $3, $3, NOW(), NOW())`,
          [`rls_viewer_insert_${suffix}`, ids.projectB, ids.viewerB]
        )
      ),
    "viewer task insert"
  );

  const viewerUpdate = await runtimeTransaction(ids.viewerB, () =>
    runtime.query(`UPDATE "Task" SET "title" = 'Viewer update' WHERE "id" = $1`, [
      ids.taskB,
    ])
  );
  assert.equal(viewerUpdate.rowCount, 0);

  const ownerAParticipants = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(
      `SELECT "id" FROM "ProjectMeetingNoteParticipant" WHERE "id" IN ($1, $2)`,
      [ids.participantA, ids.participantB]
    )
  );
  assert.deepEqual(ownerAParticipants.rows.map((row) => row.id), [
    ids.participantA,
  ]);

  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerA, () =>
        runtime.query(
          `INSERT INTO "ProjectMeetingNoteParticipant"
            ("id", "meetingNoteId", "displayName", "position", "createdAt", "updatedAt")
           VALUES ($1, $2, 'Cross-project guest', 1, NOW(), NOW())`,
          [`rls_cross_participant_${suffix}`, ids.meetingB]
        )
      ),
    "cross-project meeting participant insert"
  );

  const editorParticipantInsert = await runtimeTransaction(ids.editorB, () =>
    runtime.query(
      `INSERT INTO "ProjectMeetingNoteParticipant"
        ("id", "meetingNoteId", "displayName", "position", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Editor guest', 1, NOW(), NOW())`,
      [`rls_editor_participant_${suffix}`, ids.meetingB]
    )
  );
  assert.equal(editorParticipantInsert.rowCount, 1);

  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.viewerB, () =>
        runtime.query(
          `INSERT INTO "ProjectMeetingNoteParticipant"
            ("id", "meetingNoteId", "displayName", "position", "createdAt", "updatedAt")
           VALUES ($1, $2, 'Viewer guest', 1, NOW(), NOW())`,
          [`rls_viewer_participant_${suffix}`, ids.meetingB]
        )
      ),
    "viewer meeting participant insert"
  );

  for (const memberId of [ids.editorB, ids.viewerB]) {
    const directCredentialRead = await runtimeTransaction(memberId, () =>
      runtime.query(`SELECT "id" FROM "ApiCredential" WHERE "projectId" = $1`, [
        ids.projectB,
      ])
    );
    assert.equal(directCredentialRead.rowCount, 0);

    const safeActorRead = await runtimeTransaction(memberId, () =>
      runtime.query(
        `SELECT "kind", "actorId", "label"
         FROM app.list_project_actors($1)`,
        [ids.projectB]
      )
    );
    assert.equal(
      safeActorRead.rows.some(
        (row) => row.kind === "agent" && row.actorId === ids.credentialB
      ),
      true
    );
    assert.equal(
      safeActorRead.rows.some((row) => row.actorId === ids.credentialA),
      false
    );
  }

  const crossProjectActorRead = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`SELECT "actorId" FROM app.list_project_actors($1)`, [
      ids.projectB,
    ])
  );
  assert.equal(crossProjectActorRead.rowCount, 0);

  const absentActorRead = await runtimeTransaction(undefined, () =>
    runtime.query(`SELECT "actorId" FROM app.list_project_actors($1)`, [
      ids.projectB,
    ])
  );
  assert.equal(absentActorRead.rowCount, 0);

  await admin.query(
    `DELETE FROM "ProjectMembership" WHERE "projectId" = $1 AND "userId" = $2`,
    [ids.projectB, ids.revokedB]
  );
  const revokedRead = await runtimeTransaction(ids.revokedB, () =>
    runtime.query(`SELECT "id" FROM "Task" WHERE "id" = $1`, [ids.taskB])
  );
  assert.equal(revokedRead.rowCount, 0);
  const revokedParticipantRead = await runtimeTransaction(ids.revokedB, () =>
    runtime.query(
      `SELECT "id" FROM "ProjectMeetingNoteParticipant" WHERE "id" = $1`,
      [ids.participantB]
    )
  );
  assert.equal(revokedParticipantRead.rowCount, 0);
  const revokedActorRead = await runtimeTransaction(ids.revokedB, () =>
    runtime.query(`SELECT "actorId" FROM app.list_project_actors($1)`, [
      ids.projectB,
    ])
  );
  assert.equal(revokedActorRead.rowCount, 0);

  const crossReactionRead = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`SELECT "id" FROM "TaskCommentReaction" WHERE "id" = $1`, [
      ids.reactionB,
    ])
  );
  assert.equal(crossReactionRead.rowCount, 0);
  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerA, () =>
        runtime.query(
          `INSERT INTO "TaskCommentReaction"
            ("id", "commentId", "userId", "emoji", "createdAt")
           VALUES ($1, $2, $3, 'blocked', NOW())`,
          [`rls_cross_reaction_${suffix}`, ids.commentB, ids.ownerA]
        )
      ),
    "cross-project reaction insert"
  );
  const crossReactionDelete = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`DELETE FROM "TaskCommentReaction" WHERE "id" = $1`, [
      ids.reactionB,
    ])
  );
  assert.equal(crossReactionDelete.rowCount, 0);

  const crossAgentMentionRead = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(
      `SELECT "id" FROM "TaskCommentAgentMention" WHERE "id" = $1`,
      [ids.mentionB]
    )
  );
  assert.equal(crossAgentMentionRead.rowCount, 0);

  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerA, () =>
        runtime.query(
          `INSERT INTO "TaskCommentAgentMention"
            ("id", "commentId", "taskId", "agentCredentialId", "agentLabel", "createdByUserId", "createdAt")
           VALUES ($1, $2, $3, $4, 'Cross agent', $5, NOW())`,
          [
            `rls_cross_agent_mention_${suffix}`,
            ids.commentB,
            ids.taskB,
            ids.credentialB,
            ids.ownerA,
          ]
        )
      ),
    "cross-project agent mention insert"
  );

  // The actor owns commentA's project, so only the comment/task pairing
  // invariant can reject this row: without it the mention would surface in
  // project B's task history. credentialB2 avoids the seeded (commentA,
  // credentialA) unique pair so the pairing clause is the rejecting guard.
  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerA, () =>
        runtime.query(
          `INSERT INTO "TaskCommentAgentMention"
            ("id", "commentId", "taskId", "agentCredentialId", "agentLabel", "createdByUserId", "createdAt")
           VALUES ($1, $2, $3, $4, 'Mismatched agent', $5, NOW())`,
          [
            `rls_mismatched_agent_mention_${suffix}`,
            ids.commentA,
            ids.taskB,
            ids.credentialB2,
            ids.ownerA,
          ]
        )
      ),
    "agent mention insert pairing a comment with another project's task"
  );

  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.editorB, () =>
        runtime.query(
          `INSERT INTO "TaskCommentAgentMention"
            ("id", "commentId", "taskId", "agentCredentialId", "agentLabel", "createdByUserId", "createdAt")
           VALUES ($1, $2, $3, $4, 'Misattributed agent', $5, NOW())`,
          [
            `rls_misattributed_agent_mention_${suffix}`,
            ids.commentB,
            ids.taskB,
            ids.credentialB,
            ids.ownerB,
          ]
        )
      ),
    "agent mention insert on behalf of another actor"
  );

  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.viewerB, () =>
        runtime.query(
          `INSERT INTO "TaskCommentAgentMention"
            ("id", "commentId", "taskId", "agentCredentialId", "agentLabel", "createdByUserId", "createdAt")
           VALUES ($1, $2, $3, $4, 'Viewer agent', $5, NOW())`,
          [
            `rls_viewer_agent_mention_${suffix}`,
            ids.commentB,
            ids.taskB,
            ids.credentialB,
            ids.viewerB,
          ]
        )
      ),
    "viewer agent mention insert"
  );

  const editorAgentMentionInsert = await runtimeTransaction(ids.editorB, () =>
    runtime.query(
      `INSERT INTO "TaskCommentAgentMention"
        ("id", "commentId", "taskId", "agentCredentialId", "agentLabel", "createdByUserId", "createdAt")
       VALUES ($1, $2, $3, $4, 'Agent B2', $5, NOW())`,
      [
        `rls_editor_agent_mention_${suffix}`,
        ids.commentB,
        ids.taskB,
        ids.credentialB2,
        ids.editorB,
      ]
    )
  );
  assert.equal(editorAgentMentionInsert.rowCount, 1);

  const viewerAgentMentionRead = await runtimeTransaction(ids.viewerB, () =>
    runtime.query(
      `SELECT "id" FROM "TaskCommentAgentMention" WHERE "id" = $1`,
      [ids.mentionB]
    )
  );
  assert.equal(viewerAgentMentionRead.rowCount, 1);

  const ownerBAgentMentions = await runtimeTransaction(ids.ownerB, () =>
    runtime.query(
      `SELECT "id" FROM "TaskCommentAgentMention" WHERE "id" IN ($1, $2)`,
      [ids.mentionA, ids.mentionB]
    )
  );
  assert.deepEqual(ownerBAgentMentions.rows.map((row) => row.id), [
    ids.mentionB,
  ]);

  const crossAgentMentionDelete = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`DELETE FROM "TaskCommentAgentMention" WHERE "id" = $1`, [
      ids.mentionB,
    ])
  );
  assert.equal(crossAgentMentionDelete.rowCount, 0);

  const editorOtherActorMentionDelete = await runtimeTransaction(
    ids.editorB,
    () =>
      runtime.query(`DELETE FROM "TaskCommentAgentMention" WHERE "id" = $1`, [
        ids.mentionB,
      ])
  );
  assert.equal(editorOtherActorMentionDelete.rowCount, 0);

  const ownerBOwnMentionDelete = await runtimeTransaction(ids.ownerB, () =>
    runtime.query(`DELETE FROM "TaskCommentAgentMention" WHERE "id" = $1`, [
      ids.mentionB,
    ])
  );
  assert.equal(ownerBOwnMentionDelete.rowCount, 1);

  const ownerACredentials = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`SELECT "id" FROM "ApiCredential" WHERE "id" IN ($1, $2)`, [
      ids.credentialA,
      ids.credentialB,
    ])
  );
  assert.deepEqual(ownerACredentials.rows.map((row) => row.id), [
    ids.credentialA,
  ]);
  const ownerAScopes = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(
      `SELECT "credentialId" FROM "ApiCredentialScopeGrant"
       WHERE "credentialId" IN ($1, $2)`,
      [ids.credentialA, ids.credentialB]
    )
  );
  assert.deepEqual(ownerAScopes.rows.map((row) => row.credentialId), [
    ids.credentialA,
  ]);
  const ownerAAudit = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`SELECT "id" FROM "AuthAuditEvent" WHERE "id" IN ($1, $2)`, [
      ids.auditA,
      ids.auditB,
    ])
  );
  assert.deepEqual(ownerAAudit.rows.map((row) => row.id), [ids.auditA]);

  const ownerACalendarCredentials = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(
      `SELECT "id" FROM "CalendarConnection" WHERE "id" IN ($1, $2)`,
      [ids.calendarA, ids.calendarB]
    )
  );
  assert.deepEqual(ownerACalendarCredentials.rows.map((row) => row.id), [
    ids.calendarA,
  ]);

  const crossCalendarUpdate = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(
      `UPDATE "CalendarConnection" SET "accountLabel" = 'blocked' WHERE "id" = $1`,
      [ids.calendarB]
    )
  );
  assert.equal(crossCalendarUpdate.rowCount, 0);

  const crossCalendarDelete = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`DELETE FROM "CalendarConnection" WHERE "id" = $1`, [
      ids.calendarB,
    ])
  );
  assert.equal(crossCalendarDelete.rowCount, 0);

  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerA, () =>
        runtime.query(
          `INSERT INTO "CalendarConnection"
            ("id", "userId", "provider", "providerAccountId", "accountLabel", "refreshToken", "createdAt", "updatedAt")
           VALUES ($1, $2, 'google', 'blocked-sub', 'Blocked', 'blocked', NOW(), NOW())`,
          [`rls_cross_calendar_${suffix}`, ids.ownerB]
        )
      ),
    "cross-user calendar credential insert"
  );

  const ownerASources = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`SELECT "id" FROM "CalendarSource" WHERE "id" IN ($1, $2)`, [
      ids.calendarSourceA,
      ids.calendarSourceB,
    ])
  );
  assert.deepEqual(ownerASources.rows.map((row) => row.id), [ids.calendarSourceA]);

  const crossSourceUpdate = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`UPDATE "CalendarSource" SET "isSelected" = false WHERE "id" = $1`, [
      ids.calendarSourceB,
    ])
  );
  assert.equal(crossSourceUpdate.rowCount, 0);

  const ownerAPreferences = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`SELECT "userId" FROM "CalendarPreference" WHERE "userId" IN ($1, $2)`, [
      ids.ownerA,
      ids.ownerB,
    ])
  );
  assert.deepEqual(ownerAPreferences.rows.map((row) => row.userId), [ids.ownerA]);

  const crossCredentialUpdate = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(`UPDATE "ApiCredential" SET "label" = 'Cross' WHERE "id" = $1`, [
      ids.credentialB,
    ])
  );
  assert.equal(crossCredentialUpdate.rowCount, 0);

  const forbiddenResponsibilityResolution = await runtimeTransaction(
    ids.ownerA,
    () =>
      runtime.query(
        `SELECT app.resolve_project_actor_responsibilities($1, 'human', $2, 'reassign', $3) AS result`,
        [ids.projectB, ids.editorB, ids.ownerB]
      )
  );
  assert.equal(forbiddenResponsibilityResolution.rows[0].result, "forbidden");

  const responsibilityResolution = await runtimeTransaction(
    ids.ownerB,
    async () => {
      const resolution = await runtime.query(
        `SELECT app.resolve_project_actor_responsibilities($1, 'human', $2, 'reassign', $3) AS result`,
        [ids.projectB, ids.editorB, ids.ownerB]
      );
      const task = await runtime.query(
        `SELECT "assigneeUserId", "createdByUserId", "updatedByUserId"
         FROM "Task" WHERE "id" = $1`,
        [ids.taskB]
      );
      const resource = await runtime.query(
        `SELECT "stewardUserId", "createdByUserId", "lastEditedByUserId"
         FROM "Resource" WHERE "id" = $1`,
        [ids.resourceB]
      );
      const note = await runtime.query(
        `SELECT "stewardUserId", "createdByUserId", "updatedByUserId"
         FROM "ProjectMeetingNote" WHERE "id" = $1`,
        [ids.meetingB]
      );
      const action = await runtime.query(
        `SELECT "assigneeUserId", "createdByUserId"
         FROM "ProjectMeetingNoteAction" WHERE "id" = $1`,
        [ids.meetingActionB]
      );
      return { resolution, task, resource, note, action };
    }
  );
  assert.equal(responsibilityResolution.resolution.rows[0].result, "ok");
  assert.equal(responsibilityResolution.task.rows[0].assigneeUserId, ids.ownerB);
  assert.equal(responsibilityResolution.task.rows[0].createdByUserId, ids.editorB);
  assert.equal(responsibilityResolution.task.rows[0].updatedByUserId, ids.editorB);
  assert.equal(responsibilityResolution.resource.rows[0].stewardUserId, ids.ownerB);
  assert.equal(responsibilityResolution.resource.rows[0].createdByUserId, ids.editorB);
  assert.equal(responsibilityResolution.resource.rows[0].lastEditedByUserId, ids.editorB);
  assert.equal(responsibilityResolution.note.rows[0].stewardUserId, ids.ownerB);
  assert.equal(responsibilityResolution.note.rows[0].createdByUserId, ids.editorB);
  assert.equal(responsibilityResolution.note.rows[0].updatedByUserId, ids.editorB);
  assert.equal(responsibilityResolution.action.rows[0].assigneeUserId, ids.ownerB);
  assert.equal(responsibilityResolution.action.rows[0].createdByUserId, ids.editorB);

  const forbiddenOwnershipTransfer = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(
      `SELECT app.transfer_project_ownership($1, $2, $3, false) AS result`,
      [ids.ownerA, ids.projectB, ids.editorB]
    )
  );
  assert.equal(forbiddenOwnershipTransfer.rows[0].result, "forbidden");

  const ownershipTransfer = await runtimeTransaction(ids.ownerB, async () => {
    const transfer = await runtime.query(
      `SELECT app.transfer_project_ownership($1, $2, $3, false) AS result`,
      [ids.ownerB, ids.projectB, ids.editorB]
    );
    const project = await runtime.query(
      `SELECT "ownerId" FROM "Project" WHERE "id" = $1`,
      [ids.projectB]
    );
    return { transfer, project };
  });
  assert.equal(ownershipTransfer.transfer.rows[0].result, "ok");
  assert.equal(ownershipTransfer.project.rows[0].ownerId, ids.editorB);

  const ownershipState = await adminTransaction(ids.ownerB, async () => {
    const transfer = await admin.query(
      `SELECT app.transfer_project_ownership($1, $2, $3, false) AS result`,
      [ids.ownerB, ids.projectB, ids.editorB]
    );
    const memberships = await admin.query(
      `SELECT "userId", role FROM "ProjectMembership"
       WHERE "projectId" = $1 AND role = 'owner'`,
      [ids.projectB]
    );
    const previousOwner = await admin.query(
      `SELECT role FROM "ProjectMembership"
       WHERE "projectId" = $1 AND "userId" = $2`,
      [ids.projectB, ids.ownerB]
    );
    return { transfer, memberships, previousOwner };
  });
  assert.equal(ownershipState.transfer.rows[0].result, "ok");
  assert.deepEqual(ownershipState.memberships.rows, [
    { userId: ids.editorB, role: "owner" },
  ]);
  assert.equal(ownershipState.previousOwner.rows[0].role, "editor");

  const ownershipTransferAndLeave = await adminTransaction(ids.ownerB, async () => {
    const transfer = await admin.query(
      `SELECT app.transfer_project_ownership($1, $2, $3, true) AS result`,
      [ids.ownerB, ids.projectB, ids.editorB]
    );
    const previousOwner = await admin.query(
      `SELECT role FROM "ProjectMembership"
       WHERE "projectId" = $1 AND "userId" = $2`,
      [ids.projectB, ids.ownerB]
    );
    return { transfer, previousOwner };
  });
  assert.equal(ownershipTransferAndLeave.transfer.rows[0].result, "ok");
  assert.equal(ownershipTransferAndLeave.previousOwner.rowCount, 0);

  const exchangeLookup = await runtimeTransaction(undefined, () =>
    runtime.query(
      `SELECT "id", "project_id", "created_by_user_id", "scopes"
       FROM app.get_agent_credential_for_exchange($1)`,
      [`nda_${ids.credentialB}`]
    )
  );
  assert.equal(exchangeLookup.rowCount, 1);
  assert.equal(exchangeLookup.rows[0].id, ids.credentialB);
  assert.equal(exchangeLookup.rows[0].project_id, ids.projectB);
  assert.deepEqual(exchangeLookup.rows[0].scopes, ["task_write"]);

  const missingLookup = await runtimeTransaction(undefined, () =>
    runtime.query(
      `SELECT "id" FROM app.get_agent_credential_for_exchange($1)`,
      [`nda_missing_${suffix}`]
    )
  );
  assert.equal(missingLookup.rowCount, 0);

  console.log(
    "RLS isolation matrix passed for absent actors, cross-project CRUD, role differences, child rows, revoked membership, safe project actor reads, responsibility resolution, ownership transfer, Calendar connections/sources/preferences, and agent credentials."
  );
} finally {
  await cleanup().catch(() => undefined);
  await runtime.end();
  await admin.end();
}
