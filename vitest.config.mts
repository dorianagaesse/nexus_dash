import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      include: [
        "app/api/auth/google/route.ts",
        "app/api/auth/callback/google/route.ts",
        "app/api/calendar/events/route.ts",
        "app/api/calendar/events/[eventId]/route.ts",
        "app/api/projects/[projectId]/tasks/[taskId]/attachments/route.ts",
        "app/api/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/route.ts",
        "app/api/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/download/route.ts",
        "app/api/projects/[projectId]/context-cards/[cardId]/attachments/route.ts",
        "app/api/projects/[projectId]/context-cards/[cardId]/attachments/[attachmentId]/route.ts",
        "app/api/projects/[projectId]/context-cards/[cardId]/attachments/[attachmentId]/download/route.ts",
        "app/api/projects/[projectId]/tasks/reorder/route.ts",
        "app/api/projects/[projectId]/tasks/[taskId]/route.ts",
        "lib/context-card-colors.ts",
        "lib/google-calendar.ts",
        "lib/rich-text.ts",
        "lib/task-attachment.ts",
        "lib/task-label.ts",
        "lib/task-status.ts",
      ],
      thresholds: {
        lines: 85,
        branches: 80,
        functions: 85,
        statements: 85,
      },
    },
  },
});
