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
];

export default config;
