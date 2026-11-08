import assert from "node:assert/strict";

export async function testProjectTodoRls({ admin, runtime, runtimeTransaction, expectRlsViolation, ids }) {
  const id = `${ids.projectB}_personal`;
  await admin.query(
    `INSERT INTO "ProjectTodo" (id, "projectId", content, "createdByUserId", "updatedAt") VALUES ($1, $2, 'Private editor item', $3, now())`,
    [id, ids.projectB, ids.editorB]
  );
  for (const actor of [undefined, ids.outsider, ids.ownerA, ids.ownerB, ids.editorB, ids.viewerB]) {
    const own = actor === ids.editorB;
    const writer = [ids.ownerB, ids.editorB].includes(actor);
    const rows = await runtimeTransaction(actor, () => runtime.query(`SELECT id FROM "ProjectTodo" WHERE id = $1`, [id]));
    assert.equal(rows.rowCount, own ? 1 : 0, `personal read: ${actor}`);
    const update = await runtimeTransaction(actor, () => runtime.query(`UPDATE "ProjectTodo" SET "completedAt" = now() WHERE id = $1`, [id]));
    assert.equal(update.rowCount, own ? 1 : 0, `personal update: ${actor}`);
    const remove = await runtimeTransaction(actor, () => runtime.query(`DELETE FROM "ProjectTodo" WHERE id = $1`, [id]));
    assert.equal(remove.rowCount, own ? 1 : 0, `personal delete: ${actor}`);
    const insert = () => runtimeTransaction(actor, () => runtime.query(
      `INSERT INTO "ProjectTodo" (id, "projectId", content, "createdByUserId", "updatedAt") VALUES ($1, $2, 'New item', $3, now())`,
      [`${id}_new`, ids.projectB, actor ?? null]));
    if (writer) await insert();
    else await expectRlsViolation(insert, `personal insert: ${actor}`);
  }
  for (const [column, value] of [["projectId", ids.projectA], ["createdByUserId", ids.ownerB]]) {
    await expectRlsViolation(() => runtimeTransaction(ids.editorB, () => runtime.query(
      `UPDATE "ProjectTodo" SET "${column}" = $1 WHERE id = $2`, [value, id])), `cannot transfer private ${column}`);
  }
  await expectRlsViolation(() => runtimeTransaction(ids.ownerB, () => runtime.query(
    `INSERT INTO "ProjectTodo" (id, "projectId", content, "createdByUserId", "updatedAt") VALUES ($1, $2, 'Forged', $3, now())`,
    [`${id}_forged`, ids.projectB, ids.editorB])), "owner cannot impersonate private creator");
  const agentRows = await runtimeTransaction(ids.editorB, () => runtime.query(`SELECT id FROM "ProjectTodo" WHERE id=$1`, [id]), "agent");
  assert.equal(agentRows.rowCount, 0, "owner-attributed agent cannot access human personal todos");
  await runtimeTransaction(ids.ownerB, async () => {
    await runtime.query(`DELETE FROM "ProjectMembership" WHERE "projectId"=$1 AND "userId"=$2`, [ids.projectB, ids.editorB]);
    await runtime.query("SELECT set_config('app.user_id', $1, true)", [ids.editorB]);
    assert.equal((await runtime.query(`SELECT id FROM "ProjectTodo" WHERE id=$1`, [id])).rowCount, 0, "revoked creator loses access");
  });
  // Install a contract double transactionally: prove a capability provider
  // arriving after the checklist migration takes effect without another deploy.
  const role = (await runtime.query("SELECT current_user AS name")).rows[0]
    .name;
  await admin.query("BEGIN");
  try {
    await admin.query(`CREATE OR REPLACE FUNCTION app.has_project_capability(target_project_id TEXT, capability TEXT)
      RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
        SELECT capability = ANY(string_to_array(current_setting('app.test_todo_capabilities', true), ','))
      $$`);
    await admin.query(`SET LOCAL ROLE "${role.replaceAll('"', '""')}"`);
    await admin.query("SELECT set_config('app.user_id', $1, true)", [
      ids.editorB,
    ]);
    for (const grants of ["", "task:read", "task:read,task:write"]) {
      await admin.query(
        "SELECT set_config('app.test_todo_capabilities', $1, true)",
        [grants]
      );
      const rows = await admin.query(
        `SELECT id FROM "ProjectTodo" WHERE id = $1`,
        [id]
      );
      assert.equal(rows.rowCount, grants.includes("task:read") ? 1 : 0);
      const update = await admin.query(
        `UPDATE "ProjectTodo" SET content = 'Capability check' WHERE id = $1`,
        [id]
      );
      assert.equal(update.rowCount, grants.includes("task:write") ? 1 : 0);
    }
    await admin.query(
      "SELECT set_config('app.test_todo_capabilities', 'task:read,task:write,task:delete', true)"
    );
    const remove = await admin.query(
      `DELETE FROM "ProjectTodo" WHERE id = $1`,
      [id]
    );
    assert.equal(
      remove.rowCount,
      1,
      "creator can delete their own private todo with write capability"
    );
  } finally {
    await admin.query("ROLLBACK");
  }
}
