import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(repoRoot, "prisma", "schema.prisma");
const inventoryPath = path.join(repoRoot, "prisma", "rls-inventory.json");
const migrationsPath = path.join(repoRoot, "prisma", "migrations");

const allowedClassifications = new Set([
  "project-scoped-direct-rls",
  "user-scoped-direct-rls",
  "system-operational-exempt",
  "indirect-project-derived",
]);
const allowedEnforcement = new Set(["rls", "service", "operational"]);

function readModelNames(schema) {
  return Array.from(schema.matchAll(/^model\s+([A-Za-z][A-Za-z0-9_]*)\s*\{/gm), (match) => match[1]);
}

function readMigrationSql(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directory, entry.name, "migration.sql"))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
}

export function validateRlsInventory({
  schema = fs.readFileSync(schemaPath, "utf8"),
  inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8")),
  migrationSql = readMigrationSql(migrationsPath),
} = {}) {
  const errors = [];
  const schemaModels = readModelNames(schema);
  const entries = Array.isArray(inventory.models) ? inventory.models : [];
  const entriesByModel = new Map();

  for (const entry of entries) {
    if (!entry || typeof entry.model !== "string") {
      errors.push("Every inventory entry must declare a model.");
      continue;
    }
    if (entriesByModel.has(entry.model)) {
      errors.push(`Duplicate inventory entry: ${entry.model}.`);
      continue;
    }
    entriesByModel.set(entry.model, entry);

    if (!allowedClassifications.has(entry.classification)) {
      errors.push(`${entry.model} has invalid classification ${String(entry.classification)}.`);
    }
    if (!allowedEnforcement.has(entry.enforcement)) {
      errors.push(`${entry.model} has invalid enforcement ${String(entry.enforcement)}.`);
    }
    if (typeof entry.owner !== "string" || !entry.owner.trim()) {
      errors.push(`${entry.model} must declare an enforcement owner.`);
    }
    if (typeof entry.rationale !== "string" || !entry.rationale.trim()) {
      errors.push(`${entry.model} must declare a rationale.`);
    }
    if (
      entry.classification === "system-operational-exempt" &&
      entry.enforcement === "rls"
    ) {
      errors.push(`${entry.model} cannot be both operationally exempt and RLS-enforced.`);
    }
    if (
      (entry.classification === "project-scoped-direct-rls" ||
        entry.classification === "user-scoped-direct-rls") &&
      entry.enforcement !== "rls"
    ) {
      errors.push(`${entry.model} is classified as direct RLS but enforcement is not rls.`);
    }
  }

  for (const model of schemaModels) {
    if (!entriesByModel.has(model)) {
      errors.push(`Prisma model ${model} is missing from prisma/rls-inventory.json.`);
    }
  }
  for (const model of entriesByModel.keys()) {
    if (!schemaModels.includes(model)) {
      errors.push(`Inventory model ${model} does not exist in prisma/schema.prisma.`);
    }
  }

  for (const [model, entry] of entriesByModel) {
    if (entry.enforcement !== "rls") continue;
    const enablePattern = new RegExp(
      `ALTER\\s+TABLE\\s+"${model}"\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      "i"
    );
    const forcePattern = new RegExp(
      `ALTER\\s+TABLE\\s+"${model}"\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      "i"
    );
    if (!enablePattern.test(migrationSql)) {
      errors.push(`${model} is marked RLS-enforced but no ENABLE RLS migration was found.`);
    }
    if (!forcePattern.test(migrationSql)) {
      errors.push(`${model} is marked RLS-enforced but no FORCE RLS migration was found.`);
    }
  }

  return errors;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const errors = validateRlsInventory();
  if (errors.length > 0) {
    console.error("RLS inventory validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    "RLS inventory covers every Prisma model and matches committed policy migrations."
  );
}
