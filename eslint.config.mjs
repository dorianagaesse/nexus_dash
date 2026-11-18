import { builtinModules } from "node:module";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const repoIgnorePatterns = [
  "coverage/**",
  "playwright-report/**",
  "test-results/**",
  ".vercel/**",
  "tmp/**",
  ".tmp/**",
  "storage/uploads/**",
  "prisma/dev.db",
  "prisma/dev.db-journal",
  "**/*.tsbuildinfo",
];

const taskImplementationRestriction = {
  group: ["@/lib/services/tasks", "@/lib/services/tasks/**", "**/lib/services/tasks/**"],
  message: "Use the public Task service facade instead of internal Task modules.",
};

const prismaRestrictionForUiLayers = [
  "error",
  {
    paths: [
      {
        name: "@/lib/prisma",
        message:
          "UI/page/route layers must use dedicated service modules instead of direct Prisma access.",
      },
    ],
    patterns: [taskImplementationRestriction],
  },
];

const prismaRestrictionForLibLayers = [
  "error",
  {
    paths: [
      {
        name: "@/lib/prisma",
        message: "Direct Prisma imports are restricted to lib/services/**.",
      },
    ],
  },
];

// Scope the guard to Task persistence, while allowing response.task and DTO
// destructuring. These lexical checks supplement review; they are not a type checker.
const taskDataFiles = [
  "lib/services/tasks/task-data.ts",
  "lib/services/tasks/task-command-data.ts",
  "lib/services/tasks/task-search-data.ts",
  "lib/services/tasks/task-dashboard-data.ts",
  "lib/services/tasks/task-write-data.ts",
  "lib/services/tasks/task-persistence.ts",
  "lib/services/tasks/task-projections.ts",
];
const taskDelegateNames = "^(task|taskRelation|taskAssigneeChange|taskBlockedFollowUp|taskAttachment|taskComment.*)$";
const clientNames = "^(db|tx|client|prisma)$";
const persistenceMethods = "^(findUnique.*|findFirst.*|findMany|create.*|update.*|upsert|delete.*|count|aggregate|groupBy|fields)$";
const taskPersistenceRestrictions = [
  ...["name", "value"].flatMap(key => [
    `MemberExpression[property.${key}=/${taskDelegateNames}/][object.name=/${clientNames}/]`,
    `MemberExpression[property.${key}=/${taskDelegateNames}/][object.property.name=/${clientNames}/]`,
    `MemberExpression[object.property.${key}=/${taskDelegateNames}/][property.name=/${persistenceMethods}/]`,
    `MemberExpression[object.property.${key}=/${taskDelegateNames}/][property.value=/${persistenceMethods}/]`,
    `VariableDeclarator[init.name=/${clientNames}/] > ObjectPattern > Property[key.${key}=/${taskDelegateNames}/]`,
    `VariableDeclarator[init.property.name=/${clientNames}/] > ObjectPattern > Property[key.${key}=/${taskDelegateNames}/]`,
  ]).map(selector => ({
    selector,
    message: "Task application services must use named Task data operations.",
  })),
  {
    selector: "MemberExpression[property.name=/^\\$(queryRaw|executeRaw)/], MemberExpression[property.value=/^\\$(queryRaw|executeRaw)/]",
    message: "Raw SQL belongs to data operations or the shared content revision lock.",
  },
];

const config = [
  ...nextCoreWebVitals,
  {
    ignores: repoIgnorePatterns,
  },
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["app/**/*.ts", "app/**/*.tsx", "components/**/*.ts", "components/**/*.tsx"],
    rules: {
      "no-restricted-imports": prismaRestrictionForUiLayers,
    },
  },
  {
    files: ["lib/**/*.ts", "lib/**/*.tsx"],
    ignores: ["lib/services/**/*.ts", "lib/services/**/*.tsx"],
    rules: {
      "no-restricted-imports": prismaRestrictionForLibLayers,
    },
  },
  {
    files: ["lib/task-*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...prismaRestrictionForLibLayers[1],
          paths: [
            ...prismaRestrictionForLibLayers[1].paths,
            ...builtinModules.map(name => ({
              name,
              message: "Task domain helpers must stay independent of Node built-ins.",
            })),
          ],
          patterns: [{
            group: ["node:**", "server-only", "**/services/**", "**/app/**", "**/components/**"],
            message: "Task domain helpers must stay independent of services, delivery, and UI.",
          }],
        },
      ],
    },
  },
  {
    files: ["components/kanban-board*.{ts,tsx}", "components/kanban/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...prismaRestrictionForUiLayers[1],
          patterns: [
            taskImplementationRestriction,
            {
              group: ["**/services/**"],
              message: "Kanban UI uses HTTP/domain contracts instead of server services.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/services/tasks/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{
            name: "@/lib/prisma",
            message: "Task internals must use the caller's actor-scoped DbClient.",
          }],
        },
      ],
    },
  },
  {
    files: ["lib/services/tasks/**/*.ts", "lib/services/project-task-service.ts", "lib/services/project-task-search-service.ts"],
    ignores: taskDataFiles,
    rules: { "no-restricted-syntax": ["error", ...taskPersistenceRestrictions] },
  },
  {
    files: ["lib/services/project-service.ts"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "MemberExpression[object.property.name='task'][property.name!='count'], MemberExpression[object.property.value='task'][property.name!='count']",
        message: "Project statistics may count Tasks; Task content queries belong to Task data modules.",
      }, {
        selector: "Property[key.name='tasks'][value.type='ObjectExpression']",
        message: "Keep the legacy Task dashboard projection in the Task data boundary.",
      }],
    },
  },
  {
    files: taskDataFiles,
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "MemberExpression[property.name='$transaction'], MemberExpression[property.value='$transaction']",
        message: "Task data operations must participate in the caller's transaction.",
      }],
      "no-restricted-imports": ["error", {
        paths: [{ name: "@/lib/services/rls-context", importNames: ["withActorRlsContext"], message: "The caller owns actor context and transactions; import only DbClient here." }],
        patterns: [{ group: ["@/lib/prisma", "**/prisma"], message: "Task data operations require an explicit actor-scoped DbClient." }],
      }],
    },
  },
];

export default config;
