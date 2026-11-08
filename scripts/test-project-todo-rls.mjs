import assert from "node:assert/strict";

export async function testProjectTodoRls({
  admin,
  runtime,
  runtimeTransaction,
  expectRlsViolation,
  ids,
}) {
  const id = `${ids.projectB}_checklist`;
  await admin.query(
    `INSERT INTO "ProjectTodo" (id, "projectId", content, "createdByUserId", "updatedAt") VALUES ($1, $2, 'Check the checklist', $3, now())`,
    [id, ids.projectB, ids.ownerB]
  );
  for (const actor of [
    undefined,
    ids.outsider,
    ids.ownerA,
    ids.ownerB,
    ids.editorB,
    ids.viewerB,
  ]) {
    const member = [ids.ownerB, ids.editorB, ids.viewerB].includes(actor);
    const writer = [ids.ownerB, ids.editorB].includes(actor);
    const rows = await runtimeTransaction(actor, () =>
      runtime.query(`SELECT id FROM "ProjectTodo" WHERE id = $1`, [id])
    );
    assert.equal(rows.rowCount, member ? 1 : 0, `checklist read: ${actor}`);
    const update = await runtimeTransaction(actor, () =>
      runtime.query(
        `UPDATE "ProjectTodo" SET "completedAt" = now() WHERE id = $1`,
        [id]
      )
    );
    assert.equal(update.rowCount, writer ? 1 : 0, `checklist update: ${actor}`);
    const remove = await runtimeTransaction(actor, () =>
      runtime.query(`DELETE FROM "ProjectTodo" WHERE id = $1`, [id])
    );
    assert.equal(
      remove.rowCount,
      actor === ids.ownerB ? 1 : 0,
      `checklist delete: ${actor}`
    );
    const insert = () =>
      runtimeTransaction(actor, () =>
        runtime.query(
          `INSERT INTO "ProjectTodo" (id, "projectId", content, "updatedAt") VALUES ($1, $2, 'New item', now())`,
          [`${id}_new`, ids.projectB]
        )
      );
    if (writer) await insert();
    else await expectRlsViolation(insert, `checklist insert: ${actor}`);
  }
  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.editorB, () =>
        runtime.query(
          `UPDATE "ProjectTodo" SET "projectId" = $1 WHERE id = $2`,
          [ids.projectA, id]
        )
      ),
    "checklist move to inaccessible project"
  );
  await runtimeTransaction(ids.ownerB, async () => {
    await runtime.query(
      `DELETE FROM "ProjectMembership" WHERE "projectId" = $1 AND "userId" = $2`,
      [ids.projectB, ids.revokedB]
    );
    await runtime.query(`SELECT set_config('app.user_id', $1, true)`, [
      ids.revokedB,
    ]);
    const rows = await runtime.query(
      `SELECT id FROM "ProjectTodo" WHERE id = $1`,
      [id]
    );
    assert.equal(rows.rowCount, 0, "revoked member cannot read checklist");
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
      0,
      "capabilities cannot elevate an editor to owner-only delete"
    );
  } finally {
    await admin.query("ROLLBACK");
  }
}
