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
          patterns: [{
            group: ["node:*", "server-only", "**/services/**", "**/app/**", "**/components/**"],
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
];

export default config;
