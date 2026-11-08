import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";
import { testProjectTodoRls } from "./test-project-todo-rls.mjs";

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
  taskAgentB: `rls_task_agent_b_${suffix}`,
  taskAssigneeChangeA: `rls_task_assignee_change_a_${suffix}`,
  taskAssigneeChangeB: `rls_task_assignee_change_b_${suffix}`,
  commentA: `rls_comment_a_${suffix}`,
  commentB: `rls_comment_b_${suffix}`,
  reactionA: `rls_reaction_a_${suffix}`,
  reactionB: `rls_reaction_b_${suffix}`,
  meetingA: `rls_meeting_a_${suffix}`,
  meetingB: `rls_meeting_b_${suffix}`,
  meetingPrivateB: `rls_meeting_private_b_${suffix}`,
  meetingActionB: `rls_meeting_action_b_${suffix}`,
  meetingActionPrivateB: `rls_meeting_action_private_b_${suffix}`,
  meetingResponsibilityB: `rls_meeting_responsibility_b_${suffix}`,
  resourceB: `rls_resource_b_${suffix}`,
  participantA: `rls_participant_a_${suffix}`,
  participantB: `rls_participant_b_${suffix}`,
  participantPrivateB: `rls_participant_private_b_${suffix}`,
  meetingActionA: `rls_meeting_action_a_${suffix}`,
  meetingActionChangeA: `rls_meeting_action_change_a_${suffix}`,
  meetingActionChangeB: `rls_meeting_action_change_b_${suffix}`,
  meetingActionChangePrivateB: `rls_meeting_action_change_private_b_${suffix}`,
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

async function runtimeTransaction(actorUserId, operation, actorKind) {
  await runtime.query("BEGIN");
  try {
    if (actorUserId !== undefined) {
      await runtime.query("SELECT set_config('app.user_id', $1, true)", [
        actorUserId,
      ]);
    }
    if (actorKind !== undefined) {
      await runtime.query("SELECT set_config('app.actor_kind', $1, true)", [
        actorKind,
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

async function authenticatedRealtimeTransaction(userId, topic, operation) {
  await admin.query("BEGIN");
  try {
    await admin.query("SELECT set_config('app.user_id', '', true)");
    await admin.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await admin.query("SELECT set_config('realtime.topic', $1, true)", [topic]);
    await admin.query("SET LOCAL ROLE authenticated");
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
      ("id", "projectId", "title", "visibility", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
     VALUES
       ($1, $2, 'Meeting A', 'team', $3, $3, NOW(), NOW()),
       ($4, $5, 'Meeting B', 'team', $6, $6, NOW(), NOW()),
       ($7, $5, 'Private Meeting B', 'private', $6, $6, NOW(), NOW())`,
    [
      ids.meetingA,
      ids.projectA,
      ids.ownerA,
      ids.meetingB,
      ids.projectB,
      ids.editorB,
      ids.meetingPrivateB,
    ]
  );
  await admin.query(
    `UPDATE "Task"
     SET "assigneeUserId" = $1,
         "assigneeKind" = 'human',
         "assigneeDisplayNameSnapshot" = 'Editor B'
     WHERE "id" = $2`,
    [ids.editorB, ids.taskB]
  );
  await admin.query("SELECT set_config('app.user_id', $1, false)", [ids.editorB]);
  await admin.query(
    `UPDATE "ProjectMeetingNote"
     SET "stewardUserId" = $1,
         "stewardKind" = 'human',
         "stewardDisplayNameSnapshot" = 'Editor B'
     WHERE "id" IN ($2, $3)`,
    [ids.editorB, ids.meetingB, ids.meetingPrivateB]
  );
  await admin.query("SELECT set_config('app.user_id', '', false)");
  await admin.query(
    `INSERT INTO "ProjectMeetingNoteAction"
      ("id", "meetingNoteId", "content", "createdByUserId", "creatorKind",
       "creatorDisplayNameSnapshot", "assigneeUserId", "assigneeKind",
       "assigneeDisplayNameSnapshot", "createdAt", "updatedAt")
     VALUES
       ($1, $2, 'Responsibility B', $3, 'human', 'Editor B',
        $3, 'human', 'Editor B', NOW(), NOW()),
       ($4, $5, 'Private Responsibility B', $3, 'human', 'Editor B',
        $3, 'human', 'Editor B', NOW(), NOW())`,
    [
      ids.meetingResponsibilityB,
      ids.meetingB,
      ids.editorB,
      ids.meetingActionPrivateB,
      ids.meetingPrivateB,
    ]
  );
  await admin.query(
    `INSERT INTO "Resource"
      ("id", "type", "name", "content", "projectId", "createdByUserId",
       "creatorKind", "creatorDisplayNameSnapshot", "lastEditedByUserId",
       "lastEditorKind", "lastEditorDisplayNameSnapshot", "createdAt", "updatedAt")
     VALUES ($1, 'note', 'Resource B', 'Responsibility fixture', $2, $3,
       'human', 'Editor B', $3, 'human', 'Editor B',
       NOW(), NOW())`,
    [ids.resourceB, ids.projectB, ids.editorB]
  );
  await admin.query(
    `INSERT INTO "ProjectMeetingNoteParticipant"
      ("id", "meetingNoteId", "displayName", "position", "createdAt", "updatedAt")
     VALUES
       ($1, $2, 'Guest A', 0, NOW(), NOW()),
       ($3, $4, 'Guest B', 0, NOW(), NOW()),
       ($5, $6, 'Private Guest B', 0, NOW(), NOW())`,
    [
      ids.participantA,
      ids.meetingA,
      ids.participantB,
      ids.meetingB,
      ids.participantPrivateB,
      ids.meetingPrivateB,
    ]
  );
  await admin.query(
    `INSERT INTO "ProjectMeetingNoteAction"
      ("id", "meetingNoteId", "content", "position", "createdByUserId", "createdAt", "updatedAt")
     VALUES
       ($1, $2, 'Action A', 0, $3, NOW(), NOW()),
       ($4, $5, 'Action B', 0, $6, NOW(), NOW())`,
    [
      ids.meetingActionA,
      ids.meetingA,
      ids.ownerA,
      ids.meetingActionB,
      ids.meetingB,
      ids.ownerB,
    ]
  );
  await admin.query(
    `INSERT INTO "TaskAssigneeChange"
      ("id", "taskId", "nextAssigneeKind", "nextAssigneeUserId", "nextAssigneeDisplayNameSnapshot", "changedByKind", "changedByUserId", "changedByDisplayNameSnapshot", "createdAt")
     VALUES
       ($1, $2, 'human', $3, 'Owner A', 'human', $3, 'Owner A', NOW()),
       ($4, $5, 'human', $6, 'Owner B', 'human', $6, 'Owner B', NOW())`,
    [
      ids.taskAssigneeChangeA,
      ids.taskA,
      ids.ownerA,
      ids.taskAssigneeChangeB,
      ids.taskB,
      ids.ownerB,
    ]
  );
  await admin.query(
    `INSERT INTO "ProjectMeetingNoteActionAssigneeChange"
      ("id", "actionId", "nextAssigneeKind", "nextAssigneeUserId", "nextAssigneeDisplayNameSnapshot", "changedByKind", "changedByUserId", "changedByDisplayNameSnapshot", "createdAt")
     VALUES
       ($1, $2, 'human', $3, 'Owner A', 'human', $3, 'Owner A', NOW()),
       ($4, $5, 'human', $6, 'Owner B', 'human', $6, 'Owner B', NOW()),
       ($7, $8, 'human', $9, 'Editor B', 'human', $9, 'Editor B', NOW())`,
    [
      ids.meetingActionChangeA,
      ids.meetingActionA,
      ids.ownerA,
      ids.meetingActionChangeB,
      ids.meetingActionB,
      ids.ownerB,
      ids.meetingActionChangePrivateB,
      ids.meetingActionPrivateB,
      ids.editorB,
    ]
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
    `INSERT INTO "Task"
      ("id", "title", "status", "position", "projectId", "createdByUserId",
       "updatedByUserId", "assigneeKind", "assigneeCredentialId",
       "assigneeDisplayNameSnapshot", "createdAt", "updatedAt")
     VALUES ($1, 'Task Agent B', 'Backlog', 1, $2, $3, $3, 'agent', $4,
       'Agent B', NOW(), NOW())`,
    [ids.taskAgentB, ids.projectB, ids.ownerB, ids.credentialB]
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

  // Exercise the actual ND-654 migration against temporary tables that shadow
  // the production names. Both old project-policy values must become deny-by-default.
  await admin.query("BEGIN");
  try {
    await admin.query(`SET LOCAL search_path = pg_temp;
      CREATE TEMP TABLE "Project" (id text, "agentCanMoveTasksToDone" boolean);
      CREATE TEMP TABLE "ApiCredential" (id text, "projectId" text);
      INSERT INTO "Project" VALUES ('enabled', true), ('disabled', false);
      INSERT INTO "ApiCredential" VALUES ('trusted', 'enabled'), ('other', 'enabled'), ('denied', 'disabled');`);
    await admin.query(readFileSync(new URL(
      "../prisma/migrations/20261105140000_nd654_credential_done_permission/migration.sql", import.meta.url
    ), "utf8"));
    const migrated = await admin.query(`SELECT "canMoveTasksToDone" FROM "ApiCredential"`);
    assert.deepEqual(migrated.rows.map((row) => row.canMoveTasksToDone), [false, false, false]);
    await admin.query(`INSERT INTO "ApiCredential" (id, "projectId") VALUES ('new', 'enabled');
      UPDATE "ApiCredential" SET "canMoveTasksToDone" = true WHERE id = 'trusted';`);
    const permissions = await admin.query(`SELECT id, "canMoveTasksToDone" FROM "ApiCredential" ORDER BY id`);
    assert.deepEqual(permissions.rows, [
      { id: "denied", canMoveTasksToDone: false },
      { id: "new", canMoveTasksToDone: false },
      { id: "other", canMoveTasksToDone: false },
      { id: "trusted", canMoveTasksToDone: true },
    ]);
  } finally {
    await admin.query("ROLLBACK");
  }

  await seed();
  await testProjectTodoRls({ admin, runtime, runtimeTransaction, expectRlsViolation, ids });

  // Public current author metadata is readable by members without exposing
  // credential secrets, remains tenant-bound and outlives a deleted key.
  for (const actor of [undefined, ids.outsider, ids.ownerA, ids.editorB, ids.viewerB]) {
    const identity = await runtimeTransaction(actor, () => runtime.query(
      `SELECT id, label FROM "AgentAuthorIdentity" WHERE id = $1`, [ids.credentialB]
    ));
    assert.equal(identity.rowCount, [ids.editorB, ids.viewerB].includes(actor) ? 1 : 0);
  }
  await runtimeTransaction(ids.ownerB, async () => {
    const forged = await runtime.query(`UPDATE "AgentAuthorIdentity" SET label = 'Forged' WHERE id = $1 RETURNING id`, [ids.credentialB]);
    assert.equal(forged.rowCount, 0, "public identity is a read-only projection");
    const removed = await runtime.query(`DELETE FROM "AgentAuthorIdentity" WHERE id = $1 RETURNING id`, [ids.credentialB]);
    assert.equal(removed.rowCount, 0, "public author identity cannot be removed through the runtime role");
    await runtime.query(`UPDATE "ApiCredential" SET label = 'Current agent', "descriptiveLabels" = ARRAY['New', 'Codex'] WHERE id = $1`, [ids.credentialB]);
    const identity = await runtime.query(`SELECT label, "descriptiveLabels" FROM "AgentAuthorIdentity" WHERE id = $1`, [ids.credentialB]);
    assert.deepEqual(identity.rows, [{ label: "Current agent", descriptiveLabels: ["New", "Codex"] }]);
  });
  const authorCommentId = `rls_current_author_${suffix}`;
  const bound = await runtimeTransaction(ids.ownerB, () => runtime.query(
    `INSERT INTO "TaskComment" (id,"taskId","authorUserId","authorAgentCredentialId",content)
     VALUES ($1,$2,$3,$4,'Runtime author binding') RETURNING "authorAgentIdentityId"`,
    [`rls_runtime_author_${suffix}`, ids.taskB, ids.ownerB, ids.credentialB]
  ));
  assert.equal(bound.rows[0].authorAgentIdentityId, ids.credentialB);
  const retainedForeignId = `rls_foreign_author_${suffix}`;
  await admin.query(`INSERT INTO "AgentAuthorIdentity" (id, "projectId", label) VALUES ($1,$2,'Retained foreign author')`, [retainedForeignId, ids.projectA]);
  await assert.rejects(runtimeTransaction(ids.ownerB, () => runtime.query(
    `INSERT INTO "ApiCredential" (id, "projectId", "createdByUserId", label, "publicId", "secretHash", "updatedAt") VALUES ($1,$2,$3,'Reused identity',$4,'test-hash',NOW())`,
    [retainedForeignId, ids.projectB, ids.ownerB, `nda_${retainedForeignId}`]
  )), (error) => error.code === "23514");
  await admin.query(`INSERT INTO "TaskComment" (id, "taskId", "authorUserId", "authorAgentCredentialId", "authorAgentCredentialLabel", content)
    VALUES ($1,$2,$3,$4,'Old agent','Current author regression')`, [authorCommentId, ids.taskB, ids.ownerB, ids.credentialB]);
  await assert.rejects(runtimeTransaction(ids.ownerB, () => runtime.query(
    `UPDATE "TaskComment" SET "authorAgentIdentityId" = $1 WHERE id = $2`, [ids.credentialA, authorCommentId]
  )), (error) => error.code === "23514");
  const retainedIdentity = await adminTransaction(ids.ownerB, async () => {
    await admin.query(`UPDATE "ApiCredential" SET label = 'Retained agent', "descriptiveLabels" = ARRAY[]::varchar(40)[] WHERE id = $1`, [ids.credentialB]);
    await admin.query(`DELETE FROM "ApiCredential" WHERE id = $1`, [ids.credentialB]);
    return admin.query(`SELECT comment."authorAgentCredentialId", identity.id, identity.label, identity."descriptiveLabels"
      FROM "TaskComment" comment JOIN "AgentAuthorIdentity" identity ON identity.id = comment."authorAgentIdentityId" WHERE comment.id = $1`, [authorCommentId]);
  });
  assert.deepEqual(retainedIdentity.rows, [{ authorAgentCredentialId: null, id: ids.credentialB, label: "Retained agent", descriptiveLabels: [] }]);

  // Context attachment provenance keeps the actual agent independent of the
  // owning user, without changing the parent-resource tenant boundary.
  const attachmentId = `rls_agent_attachment_${suffix}`;
  const uploadCredentialId = `rls_upload_credential_${suffix}`;
  {
    await admin.query(`INSERT INTO "ApiCredential"
      (id, "projectId", "createdByUserId", label, "publicId", "secretHash", "updatedAt")
      VALUES ($1, $2, $3, 'Upload agent', $4, 'test-hash', NOW())`,
      [uploadCredentialId, ids.projectB, ids.ownerB, uploadCredentialId]);
    await admin.query(`INSERT INTO "ResourceAttachment"
      (id, "resourceId", "uploadedByUserId", "uploadedByCredentialId", "uploadedByKind",
       "uploadedByDisplayNameSnapshot", kind, name, url)
      VALUES ($1, $2, $3, $4, 'agent', 'Upload agent', 'link', 'Spec', 'https://example.com')`,
      [attachmentId, ids.resourceB, ids.ownerB, uploadCredentialId]);
  }
  const editorUpload = await runtimeTransaction(ids.editorB, () => runtime.query(
    `INSERT INTO "ResourceAttachment" (id, "resourceId", "uploadedByUserId", "uploadedByCredentialId", "uploadedByKind", kind, name)
     VALUES ($1, $2, $3, $4, 'agent', 'file', 'Editor upload') RETURNING id`,
    [`${attachmentId}_editor`, ids.resourceB, ids.ownerB, uploadCredentialId]));
  assert.equal(editorUpload.rowCount, 1);
  for (const actor of [ids.editorB, ids.viewerB, ids.ownerA, ids.outsider]) {
    const read = await runtimeTransaction(actor, () => runtime.query(
      `SELECT "uploadedByCredentialId", "uploadedByKind" FROM "ResourceAttachment" WHERE id = $1`, [attachmentId]));
    assert.equal(read.rowCount, [ids.editorB, ids.viewerB].includes(actor) ? 1 : 0, `attachment read for ${actor}`);
    if (read.rowCount) assert.equal(read.rows[0].uploadedByCredentialId, uploadCredentialId);
  }
  await expectRlsViolation(() => runtimeTransaction(ids.viewerB, () => runtime.query(
    `INSERT INTO "ResourceAttachment" (id, "resourceId", "uploadedByUserId", "uploadedByCredentialId", "uploadedByKind", kind, name)
     VALUES ($1, $2, $3, $4, 'agent', 'file', 'Forbidden')`,
    [`${attachmentId}_denied`, ids.resourceB, ids.viewerB, uploadCredentialId])), "viewer agent attachment insert");
  const crossAttachmentUpdate = await runtimeTransaction(ids.ownerA, () => runtime.query(
    `UPDATE "ResourceAttachment" SET name = 'Cross tenant' WHERE id = $1`, [attachmentId]));
  assert.equal(crossAttachmentUpdate.rowCount, 0);
  await admin.query(`DELETE FROM "ApiCredential" WHERE id = $1`, [uploadCredentialId]);
  const historicalAttachment = await runtimeTransaction(ids.viewerB, () => runtime.query(
    `SELECT "uploadedByCredentialId", "uploadedByKind", "uploadedByDisplayNameSnapshot" FROM "ResourceAttachment" WHERE id = $1`, [attachmentId]));
  assert.deepEqual(historicalAttachment.rows, [{ uploadedByCredentialId: null, uploadedByKind: "agent", uploadedByDisplayNameSnapshot: "Upload agent" }]);


  const hasRealtimeStub = await admin.query(
    "SELECT to_regclass('realtime.messages') IS NOT NULL AS available"
  );
  assert.equal(hasRealtimeStub.rows[0].available, true,
    "Realtime RLS stub must be installed before migrations");
  if (hasRealtimeStub.rows[0].available) {
    await admin.query(
      `INSERT INTO realtime.messages(extension, topic, event, payload, private)
       VALUES ('broadcast', $1, 'project-activity', '{}'::jsonb, true)`,
      [`project:${ids.projectA}:activity`]
    );
    const canJoin = async (userId, topic) => {
      const result = await authenticatedRealtimeTransaction(userId, topic, () =>
        admin.query("SELECT count(*)::int AS count FROM realtime.messages")
      );
      return result.rows[0].count > 0;
    };
    assert.equal(await canJoin(ids.ownerA, `project:${ids.projectA}:activity`), true);
    assert.equal(await canJoin(ids.editorB, `project:${ids.projectB}:activity`), true);
    assert.equal(await canJoin(ids.viewerB, `project:${ids.projectB}:activity`), true);
    assert.equal(await canJoin(ids.ownerA, `project:${ids.projectB}:activity`), false);
    assert.equal(await canJoin(ids.outsider, `project:${ids.projectB}:activity`), false);
    assert.equal(await canJoin(ids.ownerA, `project:missing:activity`), false);
    assert.equal(await canJoin(ids.ownerA, `project:${ids.projectA}:activity:`), false);
    assert.equal(await canJoin(ids.ownerA, `project:${ids.projectA}:wrong`), false);
    assert.equal(await canJoin(ids.ownerA, `user:${ids.ownerA}:notifications`), true);
    assert.equal(await canJoin(ids.ownerA, `user:${ids.ownerB}:notifications`), false);
    assert.equal(await canJoin(ids.ownerA, `user:${ids.ownerA}:notifications:`), false);
    await expectRlsViolation(
      () => authenticatedRealtimeTransaction(
        ids.ownerA, `project:${ids.projectA}:activity`,
        () => admin.query(
          `INSERT INTO realtime.messages(extension, topic, event, payload)
           VALUES ('broadcast', $1, 'forged', '{}'::jsonb)`,
          [`project:${ids.projectA}:activity`]
        )
      ),
      "client Broadcast publish"
    );

    await adminTransaction(ids.ownerA, async () => {
      const before = await admin.query("SELECT COALESCE(max(id), 0) AS id FROM realtime.messages");
      const version = "2026-10-03T12:00:00.000Z";
      await admin.query(`UPDATE "Project" SET "updatedAt" = $1 WHERE id = $2`, [
        version, ids.projectA,
      ]);
      await admin.query(
        `INSERT INTO "ProjectActivityEvent"
         (id, "projectId", "actorUserId", domain, action, "entityId", version, payload)
         VALUES ($1, $2, $3, 'task', 'updated', $4, $5, $6::jsonb)`,
        [`rls_realtime_event_${suffix}`, ids.projectA, ids.ownerA, ids.taskA,
          version, JSON.stringify({ title: "Changed" })]
      );
      await admin.query("SET CONSTRAINTS project_realtime_activity_signal IMMEDIATE");
      const messages = await admin.query(
        "SELECT payload FROM realtime.messages WHERE id > $1 ORDER BY id", [before.rows[0].id]
      );
      assert.equal(messages.rowCount, 1);
      assert.deepEqual(messages.rows[0].payload, {
        projectId: ids.projectA,
        version,
        serverTime: messages.rows[0].payload.serverTime,
      });
    });

    await adminTransaction(ids.ownerA, async () => {
      const before = await admin.query("SELECT COALESCE(max(id), 0) AS id FROM realtime.messages");
      await admin.query(`UPDATE "Project" SET "updatedAt" = $1 WHERE id = $2`, [
        "2026-10-03T12:01:00.000Z", ids.projectA,
      ]);
      await admin.query("SET CONSTRAINTS project_realtime_activity_signal IMMEDIATE");
      const messages = await admin.query(
        "SELECT payload FROM realtime.messages WHERE id > $1", [before.rows[0].id]
      );
      assert.equal(messages.rowCount, 1);
      assert.equal(messages.rows[0].payload.eventId, null);
      assert.equal(messages.rows[0].payload.version, "2026-10-03T12:01:00.000Z");
    });

    await adminTransaction(ids.ownerA, async () => {
      const before = await admin.query("SELECT COALESCE(max(id), 0) AS id FROM realtime.messages");
      await admin.query(
        `INSERT INTO "Notification" (id, "recipientUserId", type, title, "sourceType", "sourceId", "createdAt", "updatedAt")
         VALUES ($1::text, $3, 'test', 'First', 'test', $1::text, NOW() - interval '1 second', NOW()),
                ($2::text, $3, 'test', 'Second', 'test', $2::text, NOW(), NOW())`,
        [`rls_realtime_notification_1_${suffix}`, `rls_realtime_notification_2_${suffix}`, ids.ownerA]
      );
      const messages = await admin.query(
        "SELECT payload FROM realtime.messages WHERE id > $1 AND event = 'notification-snapshot'", [before.rows[0].id]
      );
      assert.equal(messages.rowCount, 1);
      assert.equal(messages.rows[0].payload.unreadCount >= 2, true);
      assert.deepEqual(messages.rows[0].payload.latestUnreadNotification, { title: "Second" });
    });

    await adminTransaction(ids.ownerA, async () => {
      await admin.query(`
        CREATE OR REPLACE FUNCTION realtime.send(
          payload jsonb, event text, topic text, is_private boolean
        )
        RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'send failed'; END $$
      `);
      await admin.query(`UPDATE "Project" SET "updatedAt" = NOW() WHERE id = $1`, [ids.projectA]);
      await admin.query("SET CONSTRAINTS project_realtime_activity_signal IMMEDIATE");
      const project = await admin.query(`SELECT id FROM "Project" WHERE id = $1`, [ids.projectA]);
      assert.equal(project.rowCount, 1);
    });
  }

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

  const creatorPrivateMeetingRead = await runtimeTransaction(ids.editorB, () =>
    runtime.query(
      `SELECT "id", "visibility" FROM "ProjectMeetingNote" WHERE "id" = $1`,
      [ids.meetingPrivateB]
    )
  );
  assert.equal(creatorPrivateMeetingRead.rowCount, 1);
  assert.equal(creatorPrivateMeetingRead.rows[0].visibility, "private");

  const creatorPrivateChildrenRead = await runtimeTransaction(
    ids.editorB,
    async () => {
      const participants = await runtime.query(
        `SELECT "id" FROM "ProjectMeetingNoteParticipant" WHERE "id" = $1`,
        [ids.participantPrivateB]
      );
      const actions = await runtime.query(
        `SELECT "id" FROM "ProjectMeetingNoteAction" WHERE "id" = $1`,
        [ids.meetingActionPrivateB]
      );
      const history = await runtime.query(
        `SELECT "id" FROM "ProjectMeetingNoteActionAssigneeChange" WHERE "id" = $1`,
        [ids.meetingActionChangePrivateB]
      );
      return { participants, actions, history };
    }
  );
  assert.equal(creatorPrivateChildrenRead.participants.rowCount, 1);
  assert.equal(creatorPrivateChildrenRead.actions.rowCount, 1);
  assert.equal(creatorPrivateChildrenRead.history.rowCount, 1);

  const creatorVisibilityToggle = await runtimeTransaction(
    ids.editorB,
    async () => {
      const toTeam = await runtime.query(
        `UPDATE "ProjectMeetingNote" SET "visibility" = 'team' WHERE "id" = $1 RETURNING "visibility"`,
        [ids.meetingPrivateB]
      );
      const backToPrivate = await runtime.query(
        `UPDATE "ProjectMeetingNote" SET "visibility" = 'private' WHERE "id" = $1 RETURNING "visibility"`,
        [ids.meetingPrivateB]
      );
      return { toTeam, backToPrivate };
    }
  );
  assert.equal(creatorVisibilityToggle.toTeam.rows[0].visibility, "team");
  assert.equal(
    creatorVisibilityToggle.backToPrivate.rows[0].visibility,
    "private"
  );

  for (const nonCreatorId of [ids.ownerB, ids.viewerB]) {
    const privateNoteRead = await runtimeTransaction(nonCreatorId, () =>
      runtime.query(`SELECT "id" FROM "ProjectMeetingNote" WHERE "id" = $1`, [
        ids.meetingPrivateB,
      ])
    );
    assert.equal(privateNoteRead.rowCount, 0);

    const privateParticipantRead = await runtimeTransaction(nonCreatorId, () =>
      runtime.query(
        `SELECT "id" FROM "ProjectMeetingNoteParticipant" WHERE "id" = $1`,
        [ids.participantPrivateB]
      )
    );
    assert.equal(privateParticipantRead.rowCount, 0);

    const privateActionRead = await runtimeTransaction(nonCreatorId, () =>
      runtime.query(
        `SELECT "id" FROM "ProjectMeetingNoteAction" WHERE "id" = $1`,
        [ids.meetingActionPrivateB]
      )
    );
    assert.equal(privateActionRead.rowCount, 1);

    const privateHistoryRead = await runtimeTransaction(nonCreatorId, () =>
      runtime.query(
        `SELECT "id" FROM "ProjectMeetingNoteActionAssigneeChange" WHERE "id" = $1`,
        [ids.meetingActionChangePrivateB]
      )
    );
    assert.equal(privateHistoryRead.rowCount, 1);
  }

  const sharedPrivateTodoUpdate = await runtimeTransaction(ids.ownerB, async () => {
    await runtime.query("SELECT set_config('app.allow_private_note_todo_context', 'true', true)");
    await runtime.query(`UPDATE "ProjectMeetingNote" SET "updatedByUserId" = $1 WHERE id = $2`, [ids.ownerB, ids.meetingPrivateB]);
    const action = await runtime.query(`UPDATE "ProjectMeetingNoteAction" SET "completedAt" = NOW() WHERE id = $1 RETURNING id`, [ids.meetingActionPrivateB]);
    return action;
  });
  assert.equal(sharedPrivateTodoUpdate.rowCount, 1);
  await expectRlsViolation(() => runtimeTransaction(ids.ownerB, async () => {
    await runtime.query("SELECT set_config('app.allow_private_note_todo_context', 'true', true)");
    return runtime.query(`UPDATE "ProjectMeetingNote" SET title = 'Forbidden edit' WHERE id = $1`, [ids.meetingPrivateB]);
  }), "todo context cannot edit private meeting content");
  await runtimeTransaction(ids.editorB, () => runtime.query(`UPDATE "ProjectMeetingNoteAction" SET "completedAt" = NULL WHERE id = $1`, [ids.meetingActionPrivateB]));

  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerB, () =>
        runtime.query(
          `UPDATE "ProjectMeetingNote" SET "visibility" = 'private' WHERE "id" = $1`,
          [ids.meetingB]
        )
      ),
    "non-creator meeting note visibility change"
  );

  const agentPrivateRead = await runtimeTransaction(
    ids.editorB,
    () =>
      runtime.query(`SELECT "id" FROM "ProjectMeetingNote" WHERE "id" = $1`, [
        ids.meetingPrivateB,
      ]),
    "agent"
  );
  assert.equal(agentPrivateRead.rowCount, 0);

  const agentTeamRead = await runtimeTransaction(
    ids.editorB,
    () =>
      runtime.query(`SELECT "id" FROM "ProjectMeetingNote" WHERE "id" = $1`, [
        ids.meetingB,
      ]),
    "agent"
  );
  assert.equal(agentTeamRead.rowCount, 1);

  await expectRlsViolation(
    () =>
      runtimeTransaction(
        ids.editorB,
        () =>
          runtime.query(
            `UPDATE "ProjectMeetingNote" SET "visibility" = 'private' WHERE "id" = $1`,
            [ids.meetingB]
          ),
        "agent"
      ),
    "agent meeting note visibility change"
  );

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

  const ownerATaskHistory = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(
      `SELECT "id" FROM "TaskAssigneeChange" WHERE "id" IN ($1, $2)`,
      [ids.taskAssigneeChangeA, ids.taskAssigneeChangeB]
    )
  );
  assert.deepEqual(ownerATaskHistory.rows.map((row) => row.id), [
    ids.taskAssigneeChangeA,
  ]);

  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerA, () =>
        runtime.query(
          `INSERT INTO "TaskAssigneeChange"
            ("id", "taskId", "changedByKind", "changedByUserId", "changedByDisplayNameSnapshot", "createdAt")
           VALUES ($1, $2, 'human', $3, 'Owner A', NOW())`,
          [`rls_cross_task_history_${suffix}`, ids.taskB, ids.ownerA]
        )
      ),
    "cross-project task assignee-change insert"
  );

  const editorTaskHistoryInsert = await runtimeTransaction(ids.editorB, () =>
    runtime.query(
      `INSERT INTO "TaskAssigneeChange"
        ("id", "taskId", "changedByKind", "changedByUserId", "changedByDisplayNameSnapshot", "createdAt")
       VALUES ($1, $2, 'human', $3, 'Editor B', NOW())`,
      [`rls_editor_task_history_${suffix}`, ids.taskB, ids.editorB]
    )
  );
  assert.equal(editorTaskHistoryInsert.rowCount, 1);

  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.viewerB, () =>
        runtime.query(
          `INSERT INTO "TaskAssigneeChange"
            ("id", "taskId", "changedByKind", "changedByUserId", "changedByDisplayNameSnapshot", "createdAt")
           VALUES ($1, $2, 'human', $3, 'Viewer B', NOW())`,
          [`rls_viewer_task_history_${suffix}`, ids.taskB, ids.viewerB]
        )
      ),
    "viewer task assignee-change insert"
  );

  const editorTaskHistoryUpdate = await runtimeTransaction(ids.editorB, () =>
    runtime.query(
      `UPDATE "TaskAssigneeChange" SET "changedByDisplayNameSnapshot" = 'Blocked' WHERE "id" = $1`,
      [ids.taskAssigneeChangeB]
    )
  );
  assert.equal(editorTaskHistoryUpdate.rowCount, 0);
  const editorTaskHistoryDelete = await runtimeTransaction(ids.editorB, () =>
    runtime.query(`DELETE FROM "TaskAssigneeChange" WHERE "id" = $1`, [
      ids.taskAssigneeChangeB,
    ])
  );
  assert.equal(editorTaskHistoryDelete.rowCount, 0);

  const ownerAMeetingActionHistory = await runtimeTransaction(ids.ownerA, () =>
    runtime.query(
      `SELECT "id" FROM "ProjectMeetingNoteActionAssigneeChange" WHERE "id" IN ($1, $2)`,
      [ids.meetingActionChangeA, ids.meetingActionChangeB]
    )
  );
  assert.deepEqual(ownerAMeetingActionHistory.rows.map((row) => row.id), [
    ids.meetingActionChangeA,
  ]);

  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerA, () =>
        runtime.query(
          `INSERT INTO "ProjectMeetingNoteActionAssigneeChange"
            ("id", "actionId", "changedByKind", "changedByUserId", "changedByDisplayNameSnapshot", "createdAt")
           VALUES ($1, $2, 'human', $3, 'Owner A', NOW())`,
          [`rls_cross_meeting_history_${suffix}`, ids.meetingActionB, ids.ownerA]
        )
      ),
    "cross-project meeting action assignee-change insert"
  );

  const editorMeetingActionHistoryInsert = await runtimeTransaction(
    ids.editorB,
    () =>
      runtime.query(
        `INSERT INTO "ProjectMeetingNoteActionAssigneeChange"
          ("id", "actionId", "changedByKind", "changedByUserId", "changedByDisplayNameSnapshot", "createdAt")
         VALUES ($1, $2, 'human', $3, 'Editor B', NOW())`,
        [`rls_editor_meeting_history_${suffix}`, ids.meetingActionB, ids.editorB]
      )
  );
  assert.equal(editorMeetingActionHistoryInsert.rowCount, 1);

  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.viewerB, () =>
        runtime.query(
          `INSERT INTO "ProjectMeetingNoteActionAssigneeChange"
            ("id", "actionId", "changedByKind", "changedByUserId", "changedByDisplayNameSnapshot", "createdAt")
           VALUES ($1, $2, 'human', $3, 'Viewer B', NOW())`,
          [`rls_viewer_meeting_history_${suffix}`, ids.meetingActionB, ids.viewerB]
        )
      ),
    "viewer meeting action assignee-change insert"
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
  const revokedTaskHistoryRead = await runtimeTransaction(ids.revokedB, () =>
    runtime.query(`SELECT "id" FROM "TaskAssigneeChange" WHERE "id" = $1`, [
      ids.taskAssigneeChangeB,
    ])
  );
  assert.equal(revokedTaskHistoryRead.rowCount, 0);
  const revokedMeetingHistoryRead = await runtimeTransaction(ids.revokedB, () =>
    runtime.query(
      `SELECT "id" FROM "ProjectMeetingNoteActionAssigneeChange" WHERE "id" = $1`,
      [ids.meetingActionChangeB]
    )
  );
  assert.equal(revokedMeetingHistoryRead.rowCount, 0);
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
        `SELECT "assigneeKind", "assigneeUserId", "assigneeCredentialId",
                "assigneeDisplayNameSnapshot", "createdByUserId", "updatedByUserId"
         FROM "Task" WHERE "id" = $1`,
        [ids.taskB]
      );
      const resource = await runtime.query(
        `SELECT "createdByUserId", "lastEditedByUserId"
         FROM "Resource" WHERE "id" = $1`,
        [ids.resourceB]
      );
      const note = await runtime.query(
        `SELECT "stewardUserId", "createdByUserId", "updatedByUserId"
         FROM "ProjectMeetingNote" WHERE "id" = $1`,
        [ids.meetingB]
      );
      const action = await runtime.query(
        `SELECT "assigneeKind", "assigneeUserId", "assigneeCredentialId",
                "assigneeDisplayNameSnapshot", "createdByUserId"
         FROM "ProjectMeetingNoteAction" WHERE "id" = $1`,
        [ids.meetingResponsibilityB]
      );
      const agentResolution = await runtime.query(
        `SELECT app.resolve_project_actor_responsibilities($1, 'agent', $2, 'reassign', $3) AS result`,
        [ids.projectB, ids.credentialB, ids.ownerB]
      );
      const agentTask = await runtime.query(
        `SELECT "assigneeKind", "assigneeUserId", "assigneeCredentialId",
                "assigneeDisplayNameSnapshot"
         FROM "Task" WHERE "id" = $1`,
        [ids.taskAgentB]
      );
      const privateAction = await runtime.query(`SELECT "assigneeUserId" FROM "ProjectMeetingNoteAction" WHERE id = $1`, [ids.meetingActionPrivateB]);
      assert.equal(privateAction.rows[0].assigneeUserId, ids.ownerB);
      return { resolution, task, resource, note, action, agentResolution, agentTask };
    }
  );
  assert.equal(responsibilityResolution.resolution.rows[0].result, "ok");
  assert.equal(responsibilityResolution.task.rows[0].assigneeKind, "human");
  assert.equal(responsibilityResolution.task.rows[0].assigneeUserId, ids.ownerB);
  assert.equal(
    responsibilityResolution.task.rows[0].assigneeCredentialId,
    null
  );
  assert.equal(
    responsibilityResolution.task.rows[0].assigneeDisplayNameSnapshot,
    `${ids.ownerB}@example.test`
  );
  assert.equal(responsibilityResolution.task.rows[0].createdByUserId, ids.editorB);
  assert.equal(responsibilityResolution.task.rows[0].updatedByUserId, ids.editorB);
  assert.equal(responsibilityResolution.resource.rows[0].createdByUserId, ids.editorB);
  assert.equal(responsibilityResolution.resource.rows[0].lastEditedByUserId, ids.editorB);
  assert.equal(responsibilityResolution.note.rows[0].stewardUserId, ids.ownerB);
  assert.equal(responsibilityResolution.note.rows[0].createdByUserId, ids.editorB);
  assert.equal(responsibilityResolution.note.rows[0].updatedByUserId, ids.editorB);
  assert.equal(responsibilityResolution.action.rows[0].assigneeKind, "human");
  assert.equal(responsibilityResolution.action.rows[0].assigneeUserId, ids.ownerB);
  assert.equal(
    responsibilityResolution.action.rows[0].assigneeCredentialId,
    null
  );
  assert.equal(
    responsibilityResolution.action.rows[0].assigneeDisplayNameSnapshot,
    `${ids.ownerB}@example.test`
  );
  assert.equal(responsibilityResolution.action.rows[0].createdByUserId, ids.editorB);
  const untouchedPrivateResponsibility = await admin.query(
    `SELECT note."stewardUserId", action."assigneeUserId"
     FROM "ProjectMeetingNote" note
     JOIN "ProjectMeetingNoteAction" action ON action."meetingNoteId" = note."id"
     WHERE note."id" = $1 AND action."id" = $2`,
    [ids.meetingPrivateB, ids.meetingActionPrivateB]
  );
  assert.equal(
    untouchedPrivateResponsibility.rows[0].stewardUserId,
    ids.editorB
  );
  assert.equal(
    untouchedPrivateResponsibility.rows[0].assigneeUserId,
    ids.editorB
  );
  assert.equal(
    responsibilityResolution.agentResolution.rows[0].result,
    "ok"
  );
  assert.equal(responsibilityResolution.agentTask.rows[0].assigneeKind, "human");
  assert.equal(
    responsibilityResolution.agentTask.rows[0].assigneeUserId,
    ids.ownerB
  );
  assert.equal(
    responsibilityResolution.agentTask.rows[0].assigneeCredentialId,
    null
  );
  assert.equal(
    responsibilityResolution.agentTask.rows[0].assigneeDisplayNameSnapshot,
    `${ids.ownerB}@example.test`
  );

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

  // ND-130: owners can replace scope grants atomically; other members and
  // foreign owners cannot change them. Removed scopes fail the live-token guard.
  await runtimeTransaction(ids.ownerB, async () => {
    await runtime.query(`UPDATE "ApiCredential" SET "updatedAt" = now() WHERE id = $1`, [ids.credentialB]);
    await runtime.query(`DELETE FROM "ApiCredentialScopeGrant" WHERE "credentialId" = $1`, [ids.credentialB]);
    await runtime.query(`INSERT INTO "ApiCredentialScopeGrant" ("credentialId", scope) VALUES ($1, 'meeting_read')`, [ids.credentialB]);
    const grants = await runtime.query(`SELECT scope FROM "ApiCredentialScopeGrant" WHERE "credentialId" = $1`, [ids.credentialB]);
    assert.deepEqual(grants.rows, [{ scope: "meeting_read" }]);
    for (const [scope, expected] of [["meeting_read", 1], ["meeting_write", 0]]) {
      const usage = await runtime.query(`UPDATE "ApiCredential" c SET "lastUsedAt" = now()
        WHERE c.id = $1 AND EXISTS (SELECT 1 FROM "ApiCredentialScopeGrant" g WHERE g."credentialId" = c.id AND g.scope = $2::"ApiCredentialScope")`, [ids.credentialB, scope]);
      assert.equal(usage.rowCount, expected);
    }
  });
  for (const actor of [ids.editorB, ids.viewerB, ids.ownerA]) {
    await runtimeTransaction(actor, async () => {
      const deleted = await runtime.query(`DELETE FROM "ApiCredentialScopeGrant" WHERE "credentialId" = $1`, [ids.credentialB]);
      assert.equal(deleted.rowCount, 0);
    });
    await expectRlsViolation(() => runtimeTransaction(actor, () => runtime.query(
      `INSERT INTO "ApiCredentialScopeGrant" ("credentialId", scope) VALUES ($1, 'meeting_delete')`, [ids.credentialB]
    )), "non-owner scope grant insert");
  }

  // ND-654: exercise the real credential policies under the least-privilege
  // runtime role, including transfers where the original owner stays or leaves.
  for (const previousOwnerLeaves of [false, true]) {
    await runtimeTransaction(ids.ownerB, async () => {
      // Preserve an earlier revoker too: editing a different capability must
      // not require relabeling a historical revocation as the new owner's work.
      await runtime.query(
        `UPDATE "ApiCredential" SET "revokedAt" = now(), "revokedByUserId" = $1 WHERE id = $2`,
        [ids.ownerB, ids.credentialB2]
      );
      const transfer = await runtime.query(
        `SELECT app.transfer_project_ownership($1, $2, $3, $4) AS result`,
        [ids.ownerB, ids.projectB, ids.editorB, previousOwnerLeaves]
      );
      assert.equal(transfer.rows[0].result, "ok");
      await runtime.query("SELECT set_config('app.user_id', $1, true)", [ids.editorB]);
      for (const allowed of [true, false]) {
        const updated = await runtime.query(
          `UPDATE "ApiCredential" SET "canMoveTasksToDone" = $1
           WHERE id = $2 AND "projectId" = $3
           RETURNING "createdByUserId", "canMoveTasksToDone"`,
          [allowed, ids.credentialB, ids.projectB]
        );
        assert.deepEqual(updated.rows, [{ createdByUserId: ids.ownerB, canMoveTasksToDone: allowed }]);
      }
      const other = await runtime.query(
        `SELECT "canMoveTasksToDone" FROM "ApiCredential" WHERE id = $1`, [ids.credentialB2]
      );
      assert.equal(other.rows[0].canMoveTasksToDone, false);
      const historicalRevocation = await runtime.query(
        `UPDATE "ApiCredential" SET "canMoveTasksToDone" = false WHERE id = $1 RETURNING "revokedByUserId"`,
        [ids.credentialB2]
      );
      assert.deepEqual(historicalRevocation.rows, [{ revokedByUserId: ids.ownerB }]);
      const crossProject = await runtime.query(
        `UPDATE "ApiCredential" SET "canMoveTasksToDone" = true WHERE id = $1`, [ids.credentialA]
      );
      assert.equal(crossProject.rowCount, 0);
      for (const column of ["createdByUserId", "projectId", "revokedByUserId"]) {
        await runtime.query("SAVEPOINT credential_identity");
        await expectRlsViolation(() => runtime.query(
          `UPDATE "ApiCredential" SET "${column}" = $1 WHERE id = $2`,
          [column === "projectId" ? ids.projectA : column === "revokedByUserId" ? ids.ownerA : ids.editorB, ids.credentialB]
        ), `immutable credential ${column}`);
        await runtime.query("ROLLBACK TO SAVEPOINT credential_identity");
      }
      await runtime.query("SELECT set_config('app.user_id', $1, true)", [ids.ownerB]);
      const previousOwnerWrite = await runtime.query(
        `UPDATE "ApiCredential" SET "canMoveTasksToDone" = true WHERE id = $1`, [ids.credentialB]
      );
      assert.equal(previousOwnerWrite.rowCount, 0);
      // This is also the usage guard's live-credential write: historical bearer
      // tokens stay unusable after transfer, even when the creator remains editor.
      const historicalUsage = await runtime.query(
        `UPDATE "ApiCredential" SET "lastUsedAt" = now()
         WHERE id = $1 AND "createdByUserId" = $2`, [ids.credentialB, ids.ownerB]
      );
      assert.equal(historicalUsage.rowCount, 0);
    });
  }

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

  await runtimeTransaction(ids.editorB, async () => {
    const before = await runtime.query(`SELECT "contentRevision" FROM "Task" WHERE id = $1`, [ids.taskB]);
    const metadata = await runtime.query(`UPDATE "Task" SET "updatedAt" = now() WHERE id = $1 RETURNING "contentRevision"`, [ids.taskB]);
    assert.equal(metadata.rows[0].contentRevision, before.rows[0].contentRevision);
    const changed = await runtime.query(`UPDATE "Task" SET description = 'Revision probe' WHERE id = $1 RETURNING "contentRevision"`, [ids.taskB]);
    assert.equal(changed.rows[0].contentRevision, before.rows[0].contentRevision + 1);
    const repeated = await runtime.query(`UPDATE "Task" SET title = 'Same aggregate transaction' WHERE id = $1 RETURNING "contentRevision"`, [ids.taskB]);
    assert.equal(repeated.rows[0].contentRevision, changed.rows[0].contentRevision);
  });
  await runtimeTransaction(ids.editorB, async () => {
    const before = await runtime.query(`SELECT "contentRevision" FROM "ProjectMeetingNote" WHERE id = $1`, [ids.meetingB]);
    await runtime.query(`UPDATE "ProjectMeetingNoteAction" SET content = content || ' revised' WHERE id = $1`, [ids.meetingActionB]);
    const after = await runtime.query(`SELECT "contentRevision" FROM "ProjectMeetingNote" WHERE id = $1`, [ids.meetingB]);
    assert.equal(after.rows[0].contentRevision, before.rows[0].contentRevision + 1);
  });
  const hiddenRevision = await runtimeTransaction(ids.ownerA, () => runtime.query(
    `SELECT "contentRevision" FROM "Task" WHERE id = $1 FOR UPDATE`, [ids.taskB]
  ));
  assert.equal(hiddenRevision.rowCount, 0, "conditional edit locks cannot expose another project's revision");

  // Invitation acceptance must work under the runtime role and copy the exact grant.
  // Older applications omit capabilities; reproducing that insert must fail closed.
  const capabilityInvitationId = `rls_capability_invite_${suffix}`;
  await admin.query(`UPDATE "User" SET "emailVerified"=now() WHERE id=$1`, [ids.outsider]);
  await admin.query(`INSERT INTO "ProjectInvitation"
    (id, "projectId", "invitedEmail", "invitedByUserId", role, "expiresAt", "createdAt", "updatedAt")
    VALUES ($1,$2,$3,$4,'editor',now()+interval '1 day',now(),now())`,
    [capabilityInvitationId, ids.projectA, `${ids.outsider}@example.test`, ids.ownerA]);
  for (const grants of [null, [], ["task:read", "task:write"]]) {
    await admin.query("SELECT set_config('app.user_id', $1, false)", [ids.ownerA]);
    await admin.query(`UPDATE "ProjectInvitation" SET capabilities=$2::jsonb WHERE id=$1`,
      [capabilityInvitationId, grants === null ? null : JSON.stringify(grants)]);
    await admin.query("SELECT set_config('app.user_id', '', false)");
    if (grants !== null) {
      await expectRlsViolation(() => runtimeTransaction(ids.outsider, () => runtime.query(
        `INSERT INTO "ProjectMembership" (id,"projectId","userId",role,"createdAt","updatedAt")
         VALUES ($1,$2,$3,'editor',now(),now())`,
        [`rls_invited_membership_${suffix}`, ids.projectA, ids.outsider]
      )), "accepting a custom-grant invitation without copying its grants");
    }
    await runtimeTransaction(ids.outsider, async () => {
      const membership = await runtime.query(`INSERT INTO "ProjectMembership"
        (id,"projectId","userId",role,capabilities,"createdAt","updatedAt")
        VALUES ($1,$2,$3,'editor',$4::jsonb,now(),now()) RETURNING capabilities`,
        [`rls_invited_membership_${suffix}`, ids.projectA, ids.outsider, grants === null ? null : JSON.stringify(grants)]);
      assert.deepEqual(membership.rows[0].capabilities, grants);
      const accepted = await runtime.query(`UPDATE "ProjectInvitation" SET "acceptedAt"=now()
        WHERE id=$1 AND "acceptedAt" IS NULL RETURNING id`, [capabilityInvitationId]);
      assert.equal(accepted.rowCount, 1, "recipient can finish accepting the invitation");
      const access = await runtime.query(`SELECT app.has_project_capability($1,'task:read') AS allowed`, [ids.projectA]);
      assert.equal(access.rows[0].allowed, grants === null || grants.includes("task:read"));
    });
  }

  // Owner-issued restrictions apply to parent/child reads and writes, even to assigned work.
  await runtimeTransaction(ids.ownerB, async () => {
    await runtime.query(`UPDATE "ProjectMembership" SET capabilities = '["task:read"]'::jsonb
      WHERE "projectId"=$1 AND "userId"=$2`, [ids.projectB, ids.editorB]);
    await runtime.query("SELECT set_config('app.user_id', $1, true)", [ids.editorB]);
    assert.equal((await runtime.query(`SELECT id FROM "Task" WHERE id=$1`, [ids.taskB])).rowCount, 1);
    assert.equal((await runtime.query(`UPDATE "Task" SET title='Forbidden' WHERE id=$1 RETURNING id`, [ids.taskB])).rowCount, 0);
    assert.equal((await runtime.query(`SELECT id FROM "ProjectMeetingNote" WHERE id=$1`, [ids.meetingB])).rowCount, 0);
    assert.equal((await runtime.query(`SELECT id FROM "ProjectMeetingNoteAction" WHERE id=$1`, [ids.meetingActionB])).rowCount, 0);
    assert.equal((await runtime.query(`SELECT id FROM "Resource" WHERE id=$1`, [ids.resourceB])).rowCount, 0);
    await runtime.query("SELECT set_config('app.user_id', $1, true)", [ids.ownerB]);
    await runtime.query(`UPDATE "ProjectMembership" SET capabilities = '[]'::jsonb
      WHERE "projectId"=$1 AND "userId"=$2`, [ids.projectB, ids.editorB]);
    await runtime.query("SELECT set_config('app.user_id', $1, true)", [ids.editorB]);
    assert.equal((await runtime.query(`SELECT id FROM "Task" WHERE id=$1`, [ids.taskB])).rowCount, 0);
    assert.equal((await runtime.query(`SELECT id FROM "TaskComment" WHERE id=$1`, [ids.commentB])).rowCount, 0);
    assert.equal((await runtime.query(`SELECT app.has_project_capability($1, 'task:read') AS allowed`, [ids.projectA])).rows[0].allowed, false);
    await runtime.query("SELECT set_config('app.user_id', $1, true)", [ids.ownerB]);
    assert.equal((await runtime.query(`SELECT app.has_project_capability($1, 'task:delete') AS allowed`, [ids.projectB])).rows[0].allowed, true);
  });

  console.log(
    "RLS isolation matrix passed for absent actors, cross-project CRUD, role differences, child rows, append-only assignment history, revoked membership, safe project actor reads, responsibility resolution, ownership transfer, Calendar connections/sources/preferences, and agent credentials."
  );
} finally {
  await cleanup().catch(() => undefined);
  await runtime.end();
  await admin.end();
}
