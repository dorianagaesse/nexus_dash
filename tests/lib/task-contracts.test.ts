import { describe, expect, test } from "vitest";

import { buildAgentOpenApiDocument } from "@/lib/agent-onboarding";
import { MAX_ATTACHMENT_FILE_SIZE_BYTES } from "@/lib/task-attachment";
import {
  buildProjectActorReferenceInputOpenApiSchema,
  buildTaskBulkOpenApiSchemas,
  buildTaskCreateRequestOpenApiProperties,
  buildTaskCreateRequestOpenApiSchema,
  buildTaskReorderRequestOpenApiSchema,
  buildTaskStatusTransitionRequestOpenApiSchema,
  buildTaskUpdateRequestOpenApiProperties,
  buildTaskUpdateRequestOpenApiSchema,
  isCreateTaskCommand,
  isTaskStatusTransitionPayload,
  isUpdateTaskCommand,
  isValidReorderPayload,
  parseBulkTaskOperations,
  parseCreateTaskInput,
  parseCreateTaskJsonInput,
  parseCreateTaskMultipartInput,
  parseMultipartTaskAssigneeInput,
  parseTaskAssigneeInput,
  parseTaskDeadlineInput,
  parseTaskLabelsInput,
  parseUpdateTaskJsonInput,
  TASK_CREATE_FIELD_NAMES,
  TASK_UPDATE_FIELD_NAMES,
  taskBulkRequestContract,
  taskCreateContract,
  taskReorderContract,
  taskStatusTransitionContract,
  taskUpdateContract,
  toCreateTaskServiceInput,
  toUpdateTaskServiceInput,
  validateTaskCreateFieldTypes,
} from "@/lib/task-contracts";

describe("lib/task-contracts", () => {
  describe("labels contract (valid and malformed)", () => {
    test("normalizes, deduplicates case-insensitively, truncates, and caps string label arrays", () => {
      const overlongLabel = "x".repeat(55);
      const parsed = parseTaskLabelsInput({
        labels: [
          "  Frontend ",
          "frontend",
          "QA",
          overlongLabel,
          "l4",
          "l5",
          "l6",
          "l7",
          "l8",
          "l9-dropped",
        ],
      });

      expect(parsed.labels).toHaveLength(8);
      expect(parsed.labels[0]).toBe("Frontend");
      expect(parsed.labels[1]).toBe("QA");
      expect(parsed.labels[2]).toBe("x".repeat(40));
      expect(parsed.labels).not.toContain("l9-dropped");
      expect(parsed.serializedLabels).toBe(JSON.stringify(parsed.labels));
    });

    test("parses JSON-encoded label arrays and handles malformed or non-string entries safely", () => {
      expect(
        parseTaskLabelsInput({ labels: '[" backend ", "Backend", "api"]' })
      ).toEqual({
        labels: ["backend", "api"],
        serializedLabels: '["backend","api"]',
      });

      expect(parseTaskLabelsInput({ labels: "[malformed-json" })).toEqual({
        labels: [],
        serializedLabels: null,
      });

      expect(parseTaskLabelsInput({ labels: '{"not":"an-array"}' })).toEqual({
        labels: [],
        serializedLabels: null,
      });

      expect(
        parseTaskLabelsInput({ labels: ["valid", 42, null, "   ", "second"] })
      ).toEqual({
        labels: ["valid", "second"],
        serializedLabels: '["valid","second"]',
      });
    });

    test("supports legacy singular label fallback and update clearing vs omission", () => {
      expect(parseTaskLabelsInput({ label: "  urgent  " })).toEqual({
        labels: ["urgent"],
        serializedLabels: '["urgent"]',
      });

      expect(
        parseTaskLabelsInput({ labels: ["canonical"], label: "legacy" })
      ).toEqual({
        labels: ["canonical"],
        serializedLabels: '["canonical"]',
      });

      const clearedUpdate = parseUpdateTaskJsonInput({ labels: [] });
      expect(clearedUpdate.ok).toBe(true);
      if (clearedUpdate.ok) {
        expect(clearedUpdate.data.labels).toEqual({
          labels: [],
          serializedLabels: null,
        });
      }

      const omittedUpdate = parseUpdateTaskJsonInput({ title: "Keep labels" });
      expect(omittedUpdate.ok).toBe(true);
      if (omittedUpdate.ok) {
        expect(omittedUpdate.data.labels).toBeUndefined();
      }
    });
  });

  describe("relations contract (valid and malformed)", () => {
    test("parses valid relatedTaskIds on create from array or JSON string and deduplicates", () => {
      const fromArray = parseCreateTaskJsonInput({
        title: "Create with relations",
        relatedTaskIds: [" task-1 ", "task-2", "task-1", "   "],
      });
      expect(fromArray.ok).toBe(true);
      if (fromArray.ok) {
        expect(fromArray.data.relatedTaskIds).toEqual(["task-1", "task-2"]);
        expect(fromArray.data.relatedTaskIdsJsonRaw).toBe(
          '[" task-1 ","task-2","task-1","   "]'
        );
      }

      const formData = new FormData();
      formData.set("title", "Multipart relations");
      formData.set("relatedTaskIds", '["task-a","task-b","task-a"]');
      const fromMultipart = parseCreateTaskMultipartInput(formData);
      expect(fromMultipart.ok).toBe(true);
      if (fromMultipart.ok) {
        expect(fromMultipart.data.relatedTaskIds).toEqual(["task-a", "task-b"]);
      }
    });

    test("rejects malformed relatedTaskIds on create", () => {
      for (const badRelated of [
        123,
        { id: "task-1" },
        "[invalid-json",
        '{"not":"array"}',
      ]) {
        const result = parseCreateTaskJsonInput({
          title: "Bad relations",
          relatedTaskIds: badRelated,
        });
        expect(result).toEqual({
          ok: false,
          status: 400,
          error: "related-tasks-invalid",
        });
      }
    });

    test("supports preserve, replace, and additive patch relation modes on update", () => {
      const preserved = parseUpdateTaskJsonInput({ title: "No relation keys" });
      expect(preserved.ok).toBe(true);
      if (preserved.ok) {
        expect(preserved.data.relatedTasks).toEqual({ mode: "preserve" });
      }

      const replaced = parseUpdateTaskJsonInput({
        relatedTaskIds: [" task-1 ", "task-2", "task-1"],
      });
      expect(replaced.ok).toBe(true);
      if (replaced.ok) {
        expect(replaced.data.relatedTasks).toEqual({
          mode: "replace",
          relatedTaskIds: ["task-1", "task-2"],
        });
      }

      const patched = parseUpdateTaskJsonInput({
        addRelatedTaskIds: [" task-a ", "task-b"],
        removeRelatedTaskIds: [" task-c "],
      });
      expect(patched.ok).toBe(true);
      if (patched.ok) {
        expect(patched.data.relatedTasks).toEqual({
          mode: "patch",
          addRelatedTaskIds: ["task-a", "task-b"],
          removeRelatedTaskIds: ["task-c"],
        });
      }
    });

    test("rejects relation mode conflicts, overlapping add/remove IDs, blank entries, and self removal", () => {
      expect(
        parseUpdateTaskJsonInput({
          relatedTaskIds: ["task-1"],
          addRelatedTaskIds: ["task-2"],
        })
      ).toEqual({
        ok: false,
        status: 400,
        error: "related-tasks-mode-conflict",
      });

      expect(
        parseUpdateTaskJsonInput({
          relatedTaskIds: [],
          removeRelatedTaskIds: ["task-2"],
        })
      ).toEqual({
        ok: false,
        status: 400,
        error: "related-tasks-mode-conflict",
      });

      expect(
        parseUpdateTaskJsonInput({
          addRelatedTaskIds: ["task-1", "task-2"],
          removeRelatedTaskIds: [" task-2 "],
        })
      ).toEqual({
        ok: false,
        status: 400,
        error: "related-tasks-operation-conflict",
      });

      for (const invalidPayload of [
        { relatedTaskIds: "not-an-array" },
        { relatedTaskIds: ["task-1", 99] },
        { addRelatedTaskIds: "not-an-array" },
        { addRelatedTaskIds: ["   "] },
        { removeRelatedTaskIds: [null] },
      ]) {
        expect(parseUpdateTaskJsonInput(invalidPayload)).toEqual({
          ok: false,
          status: 400,
          error: "related-tasks-invalid",
        });
      }

      expect(
        parseUpdateTaskJsonInput(
          { removeRelatedTaskIds: ["task-self"] },
          { taskId: "task-self" }
        )
      ).toEqual({
        ok: false,
        status: 400,
        error: "related-tasks-invalid",
        invalidRelatedTask: {
          id: "task-self",
          reason: "self",
        },
      });
    });
  });

  describe("assignees contract (valid and malformed)", () => {
    test("parses human and agent ProjectActorReference inputs and legacy assigneeUserId", () => {
      expect(
        parseTaskAssigneeInput({
          assignee: { kind: "human", id: " user-1 " },
        })
      ).toEqual({ kind: "human", id: "user-1" });

      expect(
        parseTaskAssigneeInput({
          assignee: { kind: "agent", id: " cred-1 " },
        })
      ).toEqual({ kind: "agent", id: "cred-1" });

      expect(
        parseTaskAssigneeInput({
          assigneeUserId: " user-legacy ",
        })
      ).toEqual({ kind: "human", id: "user-legacy" });

      expect(
        parseTaskAssigneeInput({
          assignee: null,
          assigneeUserId: "user-legacy",
        })
      ).toBeNull();
    });

    test("validates multipart assigneeKind/assigneeId pairs and legacy fallback", () => {
      const validForm = new FormData();
      validForm.set("assigneeKind", "agent");
      validForm.set("assigneeId", "cred-9");
      expect(parseMultipartTaskAssigneeInput(validForm)).toEqual({
        assignee: { kind: "agent", id: "cred-9" },
        invalid: false,
      });

      const legacyForm = new FormData();
      legacyForm.set("assigneeUserId", "user-4");
      expect(parseMultipartTaskAssigneeInput(legacyForm)).toEqual({
        assignee: { kind: "human", id: "user-4" },
        invalid: false,
      });

      const missingIdForm = new FormData();
      missingIdForm.set("title", "Task");
      missingIdForm.set("assigneeKind", "human");
      expect(parseCreateTaskMultipartInput(missingIdForm)).toEqual({
        ok: false,
        status: 400,
        error: "assignee-invalid",
      });

      const missingKindForm = new FormData();
      missingKindForm.set("title", "Task");
      missingKindForm.set("assigneeId", "user-1");
      expect(parseCreateTaskMultipartInput(missingKindForm)).toEqual({
        ok: false,
        status: 400,
        error: "assignee-invalid",
      });
    });

    test("rejects malformed assignee and assigneeUserId values across create and update", () => {
      for (const badBody of [
        { title: "Task", assignee: "user-1" },
        { title: "Task", assignee: { kind: "robot", id: "bot-1" } },
        { title: "Task", assignee: { kind: "human", id: "   " } },
        { title: "Task", assigneeUserId: 123 },
      ]) {
        expect(parseCreateTaskJsonInput(badBody)).toEqual({
          ok: false,
          status: 400,
          error: "assignee-invalid",
        });
        expect(parseUpdateTaskJsonInput(badBody)).toEqual({
          ok: false,
          status: 400,
          error: "assignee-invalid",
        });
      }

      const preservedUpdate = parseUpdateTaskJsonInput({ title: "No assignee" });
      expect(preservedUpdate.ok).toBe(true);
      if (preservedUpdate.ok) {
        expect(preservedUpdate.data.assignee).toBeUndefined();
      }

      const clearedUpdate = parseUpdateTaskJsonInput({ assignee: null });
      expect(clearedUpdate.ok).toBe(true);
      if (clearedUpdate.ok) {
        expect(clearedUpdate.data.assignee).toBeNull();
      }
    });

    test("parses valid YYYY-MM-DD dates and distinguishes omitted vs cleared values", () => {
      const parsed = parseTaskDeadlineInput("2026-04-30", {
        preserveWhenMissing: true,
      });
      expect(parsed).toEqual({
        ok: true,
        data: {
          provided: true,
          deadlineDate: "2026-04-30",
          deadlineAt: new Date("2026-04-30T00:00:00.000Z"),
        },
      });

      expect(
        parseTaskDeadlineInput(undefined, { preserveWhenMissing: true })
      ).toEqual({
        ok: true,
        data: {
          provided: false,
          deadlineDate: null,
          deadlineAt: null,
        },
      });

      expect(
        parseTaskDeadlineInput(null, { preserveWhenMissing: true })
      ).toEqual({
        ok: true,
        data: {
          provided: true,
          deadlineDate: null,
          deadlineAt: null,
        },
      });

      expect(
        parseTaskDeadlineInput("   ", { preserveWhenMissing: false })
      ).toEqual({
        ok: true,
        data: {
          provided: true,
          deadlineDate: null,
          deadlineAt: null,
        },
      });
    });

    test("rejects non-string and impossible calendar dates", () => {
      for (const badDeadline of [
        12345,
        { date: "2026-04-30" },
        "2026/04/30",
        "2026-02-30",
        "2026-04-31",
        "2026-13-01",
        "2026-00-10",
        "not-a-date",
      ]) {
        expect(
          parseTaskDeadlineInput(badDeadline, { preserveWhenMissing: true })
        ).toEqual({
          ok: false,
          status: 400,
          error: "deadline-invalid",
        });
      }
    });
  });

  describe("descriptions contract (valid and malformed)", () => {
    test("sanitizes rich text HTML, strips scripts, and normalizes empty content to null", () => {
      const created = parseCreateTaskJsonInput({
        title: "Rich text task",
        description:
          "  <p>Hello <strong>world</strong><script>alert(1)</script></p>  ",
      });
      expect(created.ok).toBe(true);
      if (created.ok) {
        expect(created.data.description).toBe(
          "<p>Hello <strong>world</strong><script>alert(1)</script></p>"
        );
        expect(created.data.normalizedDescription).toBe(
          "<p>Hello <strong>world</strong></p>"
        );
      }

      const emptyHtmlUpdate = parseUpdateTaskJsonInput({
        description: "<p>   </p>",
      });
      expect(emptyHtmlUpdate.ok).toBe(true);
      if (emptyHtmlUpdate.ok) {
        expect(emptyHtmlUpdate.data.description).toBeNull();
      }

      const omittedUpdate = parseUpdateTaskJsonInput({
        title: "Preserve description",
      });
      expect(omittedUpdate.ok).toBe(true);
      if (omittedUpdate.ok) {
        expect(omittedUpdate.data.description).toBeUndefined();
      }
    });
  });

  describe("attachmentLinks and attachmentFiles contract (valid and malformed)", () => {
    test("normalizes valid attachmentLinks from array or JSON string and defaults hostname name", () => {
      const created = parseCreateTaskJsonInput({
        title: "Task with links",
        attachmentLinks: [
          { name: "  Design Doc ", url: "https://example.com/design" },
          { name: "   ", url: "https://docs.example.org/runbook" },
        ],
      });
      expect(created.ok).toBe(true);
      if (created.ok) {
        expect(created.data.attachmentLinks).toEqual([
          { name: "Design Doc", url: "https://example.com/design" },
          { name: "docs.example.org", url: "https://docs.example.org/runbook" },
        ]);
      }

      const updated = parseUpdateTaskJsonInput({
        attachmentLinks: [
          { name: "PR", url: "https://github.com/org/repo/pull/1" },
        ],
      });
      expect(updated.ok).toBe(true);
      if (updated.ok) {
        expect(updated.data.attachmentLinks).toEqual([
          { name: "PR", url: "https://github.com/org/repo/pull/1" },
        ]);
      }
    });

    test("rejects malformed attachmentLinks across create and update", () => {
      for (const badLinks of [
        "https://example.com",
        123,
        [null],
        [{ name: "Missing URL", url: "   " }],
        [{ name: "Script URL", url: "javascript:alert(1)" }],
        [{ name: "FTP URL", url: "ftp://files.example.com/archive.zip" }],
      ]) {
        expect(
          parseCreateTaskJsonInput({
            title: "Bad link task",
            attachmentLinks: badLinks,
          })
        ).toEqual({
          ok: false,
          status: 400,
          error: "attachment-link-invalid",
        });

        expect(
          parseUpdateTaskJsonInput({
            attachmentLinks: badLinks,
          })
        ).toEqual({
          ok: false,
          status: 400,
          error: "attachment-link-invalid",
        });
      }

      const badMultipart = new FormData();
      badMultipart.set("title", "Bad multipart links");
      badMultipart.set("attachmentLinks", "{bad-json");
      expect(parseCreateTaskMultipartInput(badMultipart)).toEqual({
        ok: false,
        status: 400,
        error: "attachment-link-invalid",
      });
    });

    test("validates multipart attachmentFiles for agent restriction, MIME type, and file size", () => {
      const agentForm = new FormData();
      agentForm.set("title", "Agent file upload");
      agentForm.append(
        "attachmentFiles",
        new File(["hello"], "note.txt", { type: "text/plain" })
      );
      expect(
        parseCreateTaskMultipartInput(agentForm, { isAgentRequest: true })
      ).toEqual({
        ok: false,
        status: 400,
        error: "agent-file-attachments-not-supported",
      });

      const badMimeForm = new FormData();
      badMimeForm.set("title", "Bad mime upload");
      badMimeForm.append(
        "attachmentFiles",
        new File(["binary"], "malware.exe", {
          type: "application/x-msdownload",
        })
      );
      expect(parseCreateTaskMultipartInput(badMimeForm)).toEqual({
        ok: false,
        status: 400,
        error: "attachment-file-type-invalid",
      });

      const oversizedFile = new File(["x"], "huge.pdf", {
        type: "application/pdf",
      });
      Object.defineProperty(oversizedFile, "size", {
        value: MAX_ATTACHMENT_FILE_SIZE_BYTES + 1,
      });
      const oversizedForm = new FormData();
      oversizedForm.set("title", "Oversized upload");
      oversizedForm.append("attachmentFiles", oversizedFile);
      expect(parseCreateTaskMultipartInput(oversizedForm)).toEqual({
        ok: false,
        status: 400,
        error: "attachment-file-too-large",
      });
    });
  });

  describe("service command adapters, bulk/status/reorder schemas, and OpenAPI parity", () => {
    test("preserves enumerable route call shapes while attaching non-enumerable parsed commands", () => {
      const parsedCreate = parseCreateTaskJsonInput({
        title: "  Contract Task  ",
        description: "  <p>Body</p>  ",
        deadlineDate: "2026-05-01",
        epicId: " epic-1 ",
        assignee: { kind: "human", id: "user-1" },
        labels: ["contract"],
        relatedTaskIds: ["task-2"],
        attachmentLinks: [{ name: "Doc", url: "https://example.com" }],
      });
      expect(parsedCreate.ok).toBe(true);
      if (!parsedCreate.ok) return;

      const serviceCreateInput = toCreateTaskServiceInput(parsedCreate.data, {
        actorUserId: "actor-1",
        projectId: "proj-1",
        agentAccess: undefined,
      });

      expect(Object.keys(serviceCreateInput)).toEqual([
        "actorUserId",
        "projectId",
        "title",
        "description",
        "deadlineDate",
        "epicId",
        "assignee",
        "labelsJsonRaw",
        "relatedTaskIdsJsonRaw",
        "attachmentLinksJsonRaw",
        "attachmentFiles",
        "agentAccess",
      ]);
      expect(isCreateTaskCommand(serviceCreateInput)).toBe(true);
      expect(parseCreateTaskInput(serviceCreateInput)).toEqual({
        ok: true,
        data: serviceCreateInput,
      });

      // Legacy and direct TaskCreateInputShape paths through parseCreateTaskInput
      expect(
        parseCreateTaskInput({
          title: "Legacy input",
          description: "",
          deadlineDate: "",
          epicId: null,
          assignee: null,
          labelsJsonRaw: '["legacy"]',
          relatedTaskIdsJsonRaw: "",
          attachmentLinksJsonRaw: "",
          attachmentFiles: [],
        }).ok
      ).toBe(true);
      expect(
        parseCreateTaskInput({
          title: "Direct input shape",
          labels: ["direct"],
        }).ok
      ).toBe(true);

      const rawPatch = { title: "Updated title", epicId: "  epic-2  " };
      const parsedUpdate = parseUpdateTaskJsonInput(rawPatch, { taskId: "t-1" });
      expect(parsedUpdate.ok).toBe(true);
      if (!parsedUpdate.ok) return;

      const serviceUpdateInput = toUpdateTaskServiceInput(
        rawPatch,
        parsedUpdate.data
      );
      expect(Object.keys(serviceUpdateInput)).toEqual(["title", "epicId"]);
      expect(isUpdateTaskCommand(parsedUpdate.data)).toBe(true);
      expect(
        parseUpdateTaskJsonInput(serviceUpdateInput, { taskId: "t-1" })
      ).toEqual({
        ok: true,
        data: parsedUpdate.data,
      });

      // Deferred title-length check when validateTitleLength is false at route boundary
      const deferredShortTitle = parseUpdateTaskJsonInput(
        { title: "a" },
        { taskId: "t-1", validateTitleLength: false }
      );
      expect(deferredShortTitle.ok).toBe(true);
      if (deferredShortTitle.ok) {
        const wrappedShort = toUpdateTaskServiceInput(
          { title: "a" },
          deferredShortTitle.data
        );
        expect(parseUpdateTaskJsonInput(wrappedShort, { taskId: "t-1" })).toEqual(
          {
            ok: false,
            status: 400,
            error: "Task title must be at least 2 characters",
          }
        );
      }
    });

    test("validates status transition, reorder, and bulk contracts", () => {
      expect(taskCreateContract.is({ title: "Valid" })).toBe(true);
      expect(taskCreateContract.is({ title: "x" })).toBe(false);
      expect(taskUpdateContract.is({ title: "Valid" })).toBe(true);
      expect(taskUpdateContract.is(null)).toBe(false);

      expect(
        taskStatusTransitionContract.parse({ status: "In Progress", position: 0 })
      ).toEqual({
        ok: true,
        data: { status: "In Progress", position: 0 },
      });
      expect(
        taskStatusTransitionContract.parse({ status: "Invalid" })
      ).toEqual({
        ok: false,
        status: 400,
        error: "Invalid payload",
      });
      expect(
        isTaskStatusTransitionPayload({ status: "Done", position: -1 })
      ).toBe(false);

      expect(
        taskReorderContract.parse({
          columns: [{ status: "Backlog", taskIds: ["t1", "t2"] }],
        })
      ).toEqual({
        ok: true,
        data: {
          columns: [{ status: "Backlog", taskIds: ["t1", "t2"] }],
        },
      });
      expect(
        taskReorderContract.parse({
          columns: [
            { status: "Backlog", taskIds: ["t1"] },
            { status: "Done", taskIds: ["t1"] },
          ],
        })
      ).toEqual({
        ok: false,
        status: 400,
        error: "Invalid payload",
      });
      expect(isValidReorderPayload({ columns: "nope" })).toBe(false);

      expect(
        taskBulkRequestContract.parse({
          operations: [
            { type: "create", task: { title: "Create one" } },
            { type: "update", taskId: "t1", changes: { title: "Update one" } },
            { type: "status", taskId: "t1", status: "Done", position: 1 },
          ],
        }).ok
      ).toBe(true);
      expect(parseBulkTaskOperations({ operations: [] })).toBeNull();
      expect(validateTaskCreateFieldTypes({ epicId: 99 })).toBe("epic-invalid");
    });

    test("keeps OpenAPI task request schemas aligned with runtime contract field sets", () => {
      expect(Object.keys(buildTaskCreateRequestOpenApiProperties())).toEqual([
        ...TASK_CREATE_FIELD_NAMES,
      ]);
      expect(Object.keys(buildTaskUpdateRequestOpenApiProperties())).toEqual([
        ...TASK_UPDATE_FIELD_NAMES,
      ]);

      const openApi = buildAgentOpenApiDocument("https://nexus-dash.app");
      const schemas = openApi.components.schemas;

      expect(schemas.ProjectActorReferenceInput).toEqual(
        buildProjectActorReferenceInputOpenApiSchema()
      );
      expect(schemas.TaskCreateRequest).toEqual(
        buildTaskCreateRequestOpenApiSchema()
      );
      expect(schemas.TaskUpdateRequest).toEqual(
        buildTaskUpdateRequestOpenApiSchema()
      );
      expect(schemas.TaskReorderRequest).toEqual(
        buildTaskReorderRequestOpenApiSchema()
      );
      expect(schemas.TaskStatusTransitionRequest).toEqual(
        buildTaskStatusTransitionRequestOpenApiSchema()
      );

      const bulkSchemas = buildTaskBulkOpenApiSchemas();
      expect(schemas.TaskBulkRequest).toEqual(bulkSchemas.TaskBulkRequest);
      expect(schemas.TaskBulkCreateOperation).toEqual(
        bulkSchemas.TaskBulkCreateOperation
      );
      expect(schemas.TaskBulkUpdateOperation).toEqual(
        bulkSchemas.TaskBulkUpdateOperation
      );
      expect(schemas.TaskBulkStatusOperation).toEqual(
        bulkSchemas.TaskBulkStatusOperation
      );
    });
  });
});
