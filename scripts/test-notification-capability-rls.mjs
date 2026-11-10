import assert from "node:assert/strict";

export async function testNotificationCapabilityRls({ admin, runtime, runtimeTransaction, expectRlsViolation, ids }) {
  const notificationId = `${ids.projectB}_restricted_notice`;
  const metadata = JSON.stringify({ projectId: ids.projectB, taskId: ids.taskB, taskTitle: "Restricted title" });
  const original = await admin.query(`SELECT capabilities FROM "ProjectMembership" WHERE "projectId"=$1 AND "userId"=$2`, [ids.projectB, ids.editorB]);
  await admin.query(`INSERT INTO "Notification" (id, "recipientUserId", type, title, "sourceType", "sourceId", metadata, "updatedAt")
    VALUES ($1,$2,'task_assignment','Restricted title','task_assignment',$3,$4::jsonb,now())`, [notificationId, ids.editorB, notificationId, metadata]);
  let previousVersion = 0;
  try {
    for (const [capabilities, readable] of [[null, true], [[], false], [["meeting:read"], false], [["task:read"], true]]) {
      await admin.query(`UPDATE "ProjectMembership" SET capabilities=$1::jsonb WHERE "projectId"=$2 AND "userId"=$3`, [capabilities === null ? null : JSON.stringify(capabilities), ids.projectB, ids.editorB]);
      const rows = await runtimeTransaction(ids.editorB, () => runtime.query(`SELECT title FROM "Notification" WHERE id=$1`, [notificationId]));
      assert.equal(rows.rowCount, readable ? 1 : 0);
      const snapshot = (await admin.query(`SELECT app.build_notification_realtime_snapshot($1) AS data`, [ids.editorB])).rows[0].data;
      assert.equal(JSON.stringify(snapshot).includes("Restricted title"), readable);
      assert.ok(Date.parse(snapshot.version) >= previousVersion, "access changes cannot regress the client cursor");
      previousVersion = Date.parse(snapshot.version);
      const insert = () => runtimeTransaction(ids.ownerB, () => runtime.query(
        `INSERT INTO "Notification" (id, "recipientUserId", type, title, "sourceType", "sourceId", metadata, "updatedAt")
         VALUES ($1,$2,'task_assignment','New restricted title','task_assignment',$3,$4::jsonb,now())`,
        [`${notificationId}_new`, ids.editorB, ids.taskB, metadata]));
      if (readable) await insert();
      else await expectRlsViolation(insert, "notification creation without recipient task-read");
    }
    await admin.query(`UPDATE "ProjectMembership" SET capabilities='[]'::jsonb WHERE "projectId"=$1 AND "userId"=$2`, [ids.projectB, ids.ownerB]);
    assert.equal((await admin.query(`SELECT app.notification_recipient_can_read($1,'task_assignment',$2::jsonb) AS allowed`, [ids.ownerB, metadata])).rows[0].allowed, true, "owner identity retains access");
    assert.equal((await admin.query(`SELECT app.notification_recipient_can_read($1,'project_invitation',$2::jsonb) AS allowed`, [ids.outsider, metadata])).rows[0].allowed, true, "invitations are not gated by module grants");
  } finally {
    await admin.query(`DELETE FROM "Notification" WHERE id=$1`, [notificationId]);
    await admin.query(`UPDATE "ProjectMembership" SET capabilities=$1::jsonb WHERE "projectId"=$2 AND "userId"=$3`, [original.rows[0].capabilities === null ? null : JSON.stringify(original.rows[0].capabilities), ids.projectB, ids.editorB]);
    await admin.query(`UPDATE "ProjectMembership" SET capabilities=NULL WHERE "projectId"=$1 AND "userId"=$2`, [ids.projectB, ids.ownerB]);
  }
}
