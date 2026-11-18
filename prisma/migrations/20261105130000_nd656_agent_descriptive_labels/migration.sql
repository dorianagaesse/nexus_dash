-- Descriptive metadata is independent of credential names, scopes and task labels.
ALTER TABLE "ApiCredential"
ADD COLUMN "descriptiveLabels" VARCHAR(40)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(40)[];

-- Preserve attribution as it was when a comment was posted, including after deletion.
ALTER TABLE "TaskComment"
ADD COLUMN "authorAgentCredentialDescriptiveLabels" VARCHAR(40)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(40)[];
