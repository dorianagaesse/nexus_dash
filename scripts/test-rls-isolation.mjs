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
  participantA: `rls_participant_a_${suffix}`,
  participantB: `rls_participant_b_${suffix}`,
  credentialA: `rls_credential_a_${suffix}`,
  credentialB: `rls_credential_b_${suffix}`,
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
    [ids.taskA, ids.projectA, ids.ownerA, ids.taskB, ids.projectB, ids.ownerB]
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
      ids.ownerB,
    ]
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
       ($5, $6, $7, 'Agent B', $8, 'hash-b', NOW(), NOW())`,
    [
      ids.credentialA,
      ids.projectA,
      ids.ownerA,
      `nda_${ids.credentialA}`,
      ids.credentialB,
      ids.projectB,
      ids.ownerB,
      `nda_${ids.credentialB}`,
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
    "RLS isolation matrix passed for absent actors, cross-project CRUD, role differences, child rows, revoked membership, Calendar connections/sources/preferences, and agent credentials."
  );
} finally {
  await cleanup().catch(() => undefined);
  await runtime.end();
  await admin.end();
}
