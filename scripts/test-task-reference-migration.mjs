import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

// Run the committed migration against isolated old-schema fixtures. Only schema
// qualifiers change; the DDL, ordering, allocator, and RLS policies are unchanged.
export async function testTaskReferenceMigration(adminUrl, runtimeUrl) {
  const schema = `nd536_${randomUUID().replaceAll("-", "")}`;
  const role = decodeURIComponent(new URL(runtimeUrl).username);
  assert.match(role, /^[A-Za-z_][A-Za-z0-9_]*$/);
  const admin = new pg.Client({ connectionString: adminUrl });
  const clients = [];
  await admin.connect();
  async function client(actor) {
    const db = new pg.Client({ connectionString: runtimeUrl });
    await db.connect();
    clients.push(db);
    await db.query(`SET search_path = "${schema}", pg_catalog`);
    await db.query("SELECT set_config('app.user_id', $1, false)", [actor]);
    return db;
  }
  const insert = (db, id, project = "a") => db.query(
    `INSERT INTO "Task" (id, "projectId", "createdAt") VALUES ($1, $2, now()) RETURNING "referenceNumber"`,
    [id, project]
  );
  try {
    await admin.query(`CREATE SCHEMA "${schema}"; SET search_path = "${schema}", pg_catalog`);
    await admin.query(`
      CREATE FUNCTION "${schema}".current_user_id() RETURNS text LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
      CREATE TABLE "Project" (id text PRIMARY KEY, "ownerId" text NOT NULL, "updatedAt" timestamp DEFAULT '2020-01-01');
      CREATE TABLE "ProjectMembership" ("projectId" text, "userId" text, role text);
      CREATE SEQUENCE "Task_referenceNumber_seq";
      CREATE TABLE "Task" (
        id text PRIMARY KEY, "projectId" text NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
        "referenceNumber" integer NOT NULL DEFAULT nextval('"Task_referenceNumber_seq"'),
        "createdAt" timestamp NOT NULL, "archivedAt" timestamp, status text DEFAULT 'Backlog'
      );
      ALTER SEQUENCE "Task_referenceNumber_seq" OWNED BY "Task"."referenceNumber";
      CREATE UNIQUE INDEX "Task_referenceNumber_key" ON "Task"("referenceNumber");
      CREATE TABLE "Relation" ("leftId" text REFERENCES "Task"(id), "rightId" text REFERENCES "Task"(id));
      CREATE TABLE "Comment" ("taskId" text REFERENCES "Task"(id), content text);
      CREATE TABLE "ProjectActivityEvent" (id text PRIMARY KEY, domain text, payload jsonb);
      INSERT INTO "ProjectActivityEvent" VALUES
        ('old-task', 'task', '{"task":{"id":"a-first","reference":"ND-536"}}'),
        ('context', 'context', '{"text":"Historical ND-536"}');
      INSERT INTO "Project" (id,"ownerId") VALUES ('a','owner-a'), ('b','owner-b'), ('empty','owner-a');
      INSERT INTO "ProjectMembership" VALUES ('a','editor','editor'), ('a','viewer','viewer');
      INSERT INTO "Task" (id, "projectId", "referenceNumber", "createdAt", "archivedAt", status) VALUES
        ('a-z','a',900,'2020-01-01',null,'Backlog'),
        ('b-old','b',22,'2019-01-01',null,'Done'),
        ('a-first','a',536,'2019-01-01',null,'Backlog'),
        ('a-a','a',80,'2020-01-01','2020-02-01','Done');
      INSERT INTO "Relation" VALUES ('a-first','a-a');
      INSERT INTO "Comment" VALUES ('a-a','Historical ND-536');
    `);
    const migration = readFileSync(new URL("../prisma/migrations/20261108120000_nd536_project_task_references/migration.sql", import.meta.url), "utf8")
      .replaceAll("public.", `"${schema}".`)
      .replaceAll("app.", `"${schema}".`)
      .replaceAll("pg_catalog, public", `pg_catalog, "${schema}"`);
    await admin.query(migration);
    assert.deepEqual((await admin.query(`SELECT id, "referenceNumber", "legacyReferenceNumber" FROM "Task" ORDER BY id`)).rows, [
      { id: "a-a", referenceNumber: 2, legacyReferenceNumber: 80 },
      { id: "a-first", referenceNumber: 1, legacyReferenceNumber: 536 },
      { id: "a-z", referenceNumber: 3, legacyReferenceNumber: 900 },
      { id: "b-old", referenceNumber: 1, legacyReferenceNumber: 22 },
    ]);
    assert.deepEqual((await admin.query(`SELECT * FROM "Relation"`)).rows, [{ leftId: "a-first", rightId: "a-a" }]);
    assert.deepEqual((await admin.query(`SELECT * FROM "Comment"`)).rows, [{ taskId: "a-a", content: "Historical ND-536" }]);
    assert.deepEqual((await admin.query(`SELECT * FROM "ProjectActivityEvent" ORDER BY id`)).rows, [
      { id: "context", domain: "context", payload: { text: "Historical ND-536" } },
      { id: "old-task", domain: "task", payload: null },
    ]);
    assert.equal((await admin.query(`SELECT count(*)::int AS n FROM "Project" WHERE "updatedAt" > '2020-01-01'`)).rows[0].n, 2);
    assert.equal((await admin.query(`SELECT count(*)::int AS n FROM "Task" WHERE "archivedAt" IS NOT NULL`)).rows[0].n, 1);
    assert.deepEqual((await admin.query(`SELECT * FROM "TaskReferenceCounter" ORDER BY "projectId"`)).rows, [
      { projectId: "a", nextNumber: 4 }, { projectId: "b", nextNumber: 2 }, { projectId: "empty", nextNumber: 1 },
    ]);
    await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}";
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${role}";`);
    const owner = await client("owner-a");
    const editor = await client("editor");
    const viewer = await client("viewer");
    const outsider = await client("outsider");
    const absent = await client("");
    const parallel = await Promise.all(Array.from({ length: 12 }, () => client("editor")));
    const results = await Promise.all(parallel.map((db, index) => insert(db, `concurrent-${index}`)));
    assert.deepEqual(results.map(r => r.rows[0].referenceNumber).sort((a,b) => a-b), Array.from({length:12}, (_,i) => i+4));
    await owner.query("BEGIN");
    assert.equal((await insert(owner, "rolled-back")).rows[0].referenceNumber, 16);
    await owner.query("ROLLBACK");
    assert.equal((await insert(editor, "after-rollback")).rows[0].referenceNumber, 16);
    await admin.query(`DELETE FROM "Task" WHERE id='after-rollback'`);
    assert.equal((await insert(owner, "after-delete")).rows[0].referenceNumber, 17);
    // A failed insert rolls back its allocator update, even on a duplicate id.
    await assert.rejects(insert(owner, "after-delete"), { code: "23505" });
    assert.equal((await insert(owner, "after-failure")).rows[0].referenceNumber, 18);
    assert.equal((await insert(owner, "empty-first", "empty")).rows[0].referenceNumber, 1);
    await admin.query(`INSERT INTO "Project" (id,"ownerId") VALUES ('new','owner-a')`);
    const fresh = await Promise.all(parallel.slice(0, 4).map(async (db, i) => {
      await db.query("SELECT set_config('app.user_id', 'owner-a', false)");
      return insert(db, `fresh-${i}`, "new");
    }));
    assert.deepEqual(fresh.map(r=>r.rows[0].referenceNumber).sort((a,b)=>a-b), [1,2,3,4]);
    for (const db of [viewer, outsider, absent]) {
      await assert.rejects(insert(db, `forbidden-${clients.indexOf(db)}`), { code: "42501" });
      assert.equal((await db.query(`SELECT * FROM "TaskReferenceCounter"`)).rowCount, 0);
    }
    await assert.rejects(insert(owner, "cross-project", "b"), { code: "42501" });
    assert.equal((await owner.query(`DELETE FROM "TaskReferenceCounter" WHERE "projectId"='a'`)).rowCount, 0);
    for (const assignment of [`"referenceNumber"=99`, `"legacyReferenceNumber"=99`, `"projectId"='b'`, `id='changed-id'`]) {
      await assert.rejects(owner.query(`UPDATE "Task" SET ${assignment} WHERE id='a-first'`), { code: "23514" });
    }
    await assert.rejects(owner.query(`INSERT INTO "Task" (id,"projectId","createdAt","referenceNumber") VALUES ('manual','a',now(),99)`), {code:"23514"});
    // A second raw application fails transactionally instead of renumbering or
    // overwriting the legacy mapping; migrate deploy records it exactly once.
    await assert.rejects(admin.query(migration), {code:"42701"});
    await admin.query("ROLLBACK");
    assert.equal((await admin.query(`SELECT "legacyReferenceNumber" FROM "Task" WHERE id='a-first'`)).rows[0].legacyReferenceNumber, 536);
    console.log("ND-536 migration: 4 before / 4 after, deterministic ties and archives, stable relations, both unique indexes, concurrent allocation, rollback, deletion, new projects, and counter RLS verified.");
  } finally {
    await Promise.all(clients.map(db => db.end()));
    await admin.query("ROLLBACK");
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}
