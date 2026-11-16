import assert from "node:assert/strict";

export async function testMeetingScreenshotRls({
  admin,
  runtime,
  runtimeTransaction,
  expectRlsViolation,
  ids,
}) {
  const prefix = `${ids.projectB}_screenshot`;
  const insert = `INSERT INTO "MeetingNoteScreenshot" (id, "projectId", "noteId", section, "uploadedByUserId", name, "storageKey", "mimeType", "sizeBytes") VALUES ($1, $2, $3, 'input', $4, 'shot.png', $1, 'image/png', 10)`;
  for (const [name, noteId, uploader] of [
    ["team", ids.meetingB, ids.ownerB],
    ["private", ids.meetingPrivateB, ids.ownerB],
    ["draft", null, ids.editorB],
  ]) {
    await admin.query(insert, [
      `${prefix}_${name}`,
      ids.projectB,
      noteId,
      uploader,
    ]);
  }
  for (const actor of [
    undefined,
    ids.outsider,
    ids.ownerA,
    ids.ownerB,
    ids.editorB,
    ids.viewerB,
    ids.revokedB,
  ]) {
    const member = [
      ids.ownerB,
      ids.editorB,
      ids.viewerB,
      ids.revokedB,
    ].includes(actor);
    const writer = [ids.ownerB, ids.editorB, ids.revokedB].includes(actor);
    for (const name of ["team", "private", "draft"]) {
      const visible =
        member &&
        (name === "team" ||
          (name === "private" ? actor === ids.editorB : actor === ids.editorB));
      const rows = await runtimeTransaction(actor, () =>
        runtime.query(`SELECT id FROM "MeetingNoteScreenshot" WHERE id = $1`, [
          `${prefix}_${name}`,
        ])
      );
      assert.equal(rows.rowCount, visible ? 1 : 0, `${actor} reads ${name}`);
      const removed = await runtimeTransaction(actor, () =>
        runtime.query(`DELETE FROM "MeetingNoteScreenshot" WHERE id = $1`, [
          `${prefix}_${name}`,
        ])
      );
      assert.equal(
        removed.rowCount,
        visible && writer ? 1 : 0,
        `${actor} removes ${name}`
      );
    }
    const create = () =>
      runtimeTransaction(actor, () =>
        runtime.query(insert, [
          `${prefix}_new`,
          ids.projectB,
          null,
          actor ?? ids.outsider,
        ])
      );
    if (writer) await create();
    else await expectRlsViolation(create, `${actor} uploads`);
  }
  const bind = await runtimeTransaction(ids.editorB, () =>
    runtime.query(
      `UPDATE "MeetingNoteScreenshot" SET "noteId" = $1 WHERE id = $2`,
      [ids.meetingB, `${prefix}_draft`]
    )
  );
  assert.equal(bind.rowCount, 1, "editor can bind own draft to team note");
  await admin.query(insert, [
    `${prefix}_owner_draft`,
    ids.projectB,
    null,
    ids.ownerB,
  ]);
  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerB, () =>
        runtime.query(
          `UPDATE "MeetingNoteScreenshot" SET "noteId" = $1 WHERE id = $2`,
          [ids.meetingPrivateB, `${prefix}_owner_draft`]
        )
      ),
    "owner cannot bind to another user's private note"
  );
  await assert.rejects(
    () =>
      runtimeTransaction(ids.editorB, () =>
        runtime.query(
          `UPDATE "MeetingNoteScreenshot" SET "noteId" = $1 WHERE id = $2`,
          [ids.meetingA, `${prefix}_draft`]
        )
      ),
    "composite FK rejects cross-project note"
  );
  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.editorB, () =>
        runtime.query(
          `UPDATE "MeetingNoteScreenshot" SET "projectId" = $1 WHERE id = $2`,
          [ids.projectA, `${prefix}_draft`]
        )
      ),
    "draft project is immutable"
  );
  for (const name of ["private", "draft"]) {
    const rows = await runtimeTransaction(
      ids.ownerB,
      async () => {
        await runtime.query(
          "SELECT set_config('app.allow_private_note_todo_context', 'true', true)"
        );
        return runtime.query(
          `SELECT id FROM "MeetingNoteScreenshot" WHERE id = $1`,
          [`${prefix}_${name}`]
        );
      },
      "agent"
    );
    assert.equal(
      rows.rowCount,
      0,
      "agents and todo context never reveal private images or drafts"
    );
  }
  await runtimeTransaction(ids.editorB, async () => {
    const before = (
      await runtime.query(
        `SELECT "contentRevision" FROM "ProjectMeetingNote" WHERE id = $1`,
        [ids.meetingB]
      )
    ).rows[0].contentRevision;
    await runtime.query(
      `UPDATE "MeetingNoteScreenshot" SET "noteId" = $1 WHERE id = $2`,
      [ids.meetingB, `${prefix}_draft`]
    );
    const after = (
      await runtime.query(
        `SELECT "contentRevision" FROM "ProjectMeetingNote" WHERE id = $1`,
        [ids.meetingB]
      )
    ).rows[0].contentRevision;
    assert.equal(
      after,
      before + 1,
      "screenshot-only binding advances parent revision"
    );
  });
  await admin.query(
    `UPDATE "ProjectMembership" SET capabilities = '[]'::jsonb WHERE "projectId" = $1 AND "userId" = $2`,
    [ids.projectB, ids.editorB]
  );
  assert.equal(
    (
      await runtimeTransaction(ids.editorB, () =>
        runtime.query(
          `SELECT id FROM "MeetingNoteScreenshot" WHERE "projectId" = $1`,
          [ids.projectB]
        )
      )
    ).rowCount,
    0,
    "module-restricted editor cannot read screenshots"
  );
  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.editorB, () =>
        runtime.query(insert, [
          `${prefix}_denied`,
          ids.projectB,
          null,
          ids.editorB,
        ])
      ),
    "module-restricted editor cannot upload"
  );
  await admin.query(
    `UPDATE "ProjectMembership" SET capabilities = NULL WHERE "projectId" = $1 AND "userId" = $2`,
    [ids.projectB, ids.editorB]
  );
  await runtimeTransaction(ids.ownerB, async () => {
    await runtime.query(
      `DELETE FROM "ProjectMembership" WHERE "projectId" = $1 AND "userId" = $2`,
      [ids.projectB, ids.revokedB]
    );
    await runtime.query("SELECT set_config('app.user_id', $1, true)", [
      ids.revokedB,
    ]);
    assert.equal(
      (
        await runtime.query(
          `SELECT id FROM "MeetingNoteScreenshot" WHERE "projectId" = $1`,
          [ids.projectB]
        )
      ).rowCount,
      0,
      "revoked membership loses screenshot access"
    );
  });
  await admin.query(
    `DELETE FROM "MeetingNoteScreenshot" WHERE "projectId" = $1`,
    [ids.projectB]
  );
  console.log(
    "Meeting screenshot RLS: project roles, private/team/draft visibility, binding, and revisions passed."
  );
}
