import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

export async function verifyAgentRuntimeIsolation({
  admin,
  runtime,
  runtimeTransaction,
  expectRlsViolation,
  ids,
}) {
  const device = `device_${ids.credentialA}`;
  const pending = `pending_${ids.credentialA}`;
  const credential = `proof_${ids.credentialA}`;
  const session = `session_${ids.credentialA}`;
  const proofHash = createHash("sha256").update(randomBytes(32)).digest("hex");
  const pairingHash = createHash("sha256")
    .update(randomBytes(32))
    .digest("hex");
  await admin.query(
    `INSERT INTO "AgentRuntimeDevice" (id, "identityId", "authorizedByUserId", name, scopes, "pairingExpiresAt", "expiresAt", "authorizedAt")
    VALUES ($1, $2, $3, 'Laptop', ARRAY['task_read']::"ApiCredentialScope"[], now() + interval '10 minutes', now() + interval '90 days', now())`,
    [device, ids.credentialA, ids.ownerA]
  );
  await admin.query(
    `INSERT INTO "AgentRuntimeDevice" (id, "identityId", "authorizedByUserId", name, scopes, "pairingHash", "pairingExpiresAt", "expiresAt")
    VALUES ($1, $2, $4, 'Pairing', ARRAY['task_read']::"ApiCredentialScope"[], $3, now() + interval '10 minutes', now() + interval '90 days')`,
    [pending, ids.credentialA, pairingHash, ids.ownerA]
  );
  await admin.query(
    `INSERT INTO "AgentRuntimeCredential" (id, "deviceId", "tokenHash", "expiresAt") VALUES ($1, $2, $3, now() + interval '90 days')`,
    [credential, device, proofHash]
  );
  await admin.query(
    `INSERT INTO "AgentRuntimeSession" (id, "deviceId", client, scopes, "expiresAt") VALUES ($1, $2, 'Codex', ARRAY['task_read']::"ApiCredentialScope"[], now() + interval '12 hours')`,
    [session, device]
  );

  for (const [table, id] of [
    ["AgentRuntimeDevice", device],
    ["AgentRuntimeCredential", credential],
    ["AgentRuntimeSession", session],
  ]) {
    const owner = await runtimeTransaction(ids.ownerA, () =>
      runtime.query(`SELECT id FROM "${table}" WHERE id = $1`, [id])
    );
    assert.equal(owner.rowCount, 1);
    for (const actor of [
      undefined,
      ids.outsider,
      ids.ownerB,
      ids.editorB,
      ids.viewerB,
    ]) {
      const hidden = await runtimeTransaction(actor, () =>
        runtime.query(`SELECT id FROM "${table}" WHERE id = $1`, [id])
      );
      assert.equal(hidden.rowCount, 0, `${table} must be hidden from ${actor}`);
      for (const sql of [
        `DELETE FROM "${table}" WHERE id = $1`,
        `UPDATE "${table}" SET id = id WHERE id = $1`,
      ]) {
        const blocked = await runtimeTransaction(actor, () =>
          runtime.query(sql, [id])
        );
        assert.equal(blocked.rowCount, 0);
      }
    }
  }
  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerB, () =>
        runtime.query(
          `INSERT INTO "AgentRuntimeDevice" (id, "identityId", "authorizedByUserId", name, scopes, "pairingExpiresAt", "expiresAt") VALUES ('foreign-device', $1, $2, 'Foreign', ARRAY['task_read']::"ApiCredentialScope"[], now(), now())`,
          [ids.credentialA, ids.ownerB]
        )
      ),
    "cross-project device insert"
  );
  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerB, () =>
        runtime.query(
          `INSERT INTO "AgentRuntimeCredential" (id, "deviceId", "tokenHash", "expiresAt") VALUES ('foreign-proof', $1, 'foreign', now())`,
          [device]
        )
      ),
    "cross-project proof insert"
  );
  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerB, () =>
        runtime.query(
          `INSERT INTO "AgentRuntimeSession" (id, "deviceId", client, scopes, "expiresAt") VALUES ('foreign-session', $1, 'Foreign', ARRAY['task_read']::"ApiCredentialScope"[], now())`,
          [device]
        )
      ),
    "cross-project session insert"
  );
  await expectRlsViolation(
    () =>
      runtimeTransaction(ids.ownerA, () =>
        runtime.query(
          `UPDATE "AgentRuntimeDevice" SET "identityId" = $1 WHERE id = $2`,
          [ids.credentialB, device]
        )
      ),
    "immutable identity binding"
  );
  for (const table of ["AgentRuntimeCredential", "AgentRuntimeSession"]) {
    await expectRlsViolation(
      () =>
        runtimeTransaction(ids.ownerA, () =>
          runtime.query(`UPDATE "${table}" SET "deviceId" = $1 WHERE id = $2`, [
            pending,
            table === "AgentRuntimeCredential" ? credential : session,
          ])
        ),
      "immutable device binding"
    );
  }
  const lookup = (hash, pairing = false) =>
    runtime.query("SELECT * FROM app.resolve_agent_runtime_proof($1, $2)", [
      hash,
      pairing,
    ]);
  for (const [hash, pairing, expected] of [
    [proofHash, false, device],
    [pairingHash, true, pending],
  ]) {
    const found = await runtimeTransaction(undefined, () =>
      lookup(hash, pairing)
    );
    assert.deepEqual(found.rows, [
      { device_id: expected, owner_id: ids.ownerA },
    ]);
  }
  for (const [hash, pairing] of [
    [proofHash, true],
    [pairingHash, false],
    [device, false],
    ["0".repeat(64), false],
  ]) {
    assert.equal(
      (await runtimeTransaction(undefined, () => lookup(hash, pairing)))
        .rowCount,
      0
    );
  }
  await runtimeTransaction(ids.ownerA, async () => {
    await runtime.query(
      `UPDATE "AgentRuntimeDevice" SET "revokedAt" = now() WHERE id = $1`,
      [device]
    );
    assert.equal((await lookup(proofHash)).rowCount, 0);
  });
  await runtimeTransaction(ids.ownerA, async () => {
    await runtime.query(
      `UPDATE "AgentRuntimeCredential" SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`,
      [credential]
    );
    assert.equal((await lookup(proofHash)).rowCount, 0);
  });
  console.log(
    "ND-658 runtime RLS matrix passed: owner-only CRUD, immutable bindings, exact-proof bootstrap, revocation and expiry."
  );
}
