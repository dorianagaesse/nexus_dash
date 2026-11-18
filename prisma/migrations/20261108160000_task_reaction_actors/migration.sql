ALTER TABLE "TaskCommentReaction"
  ADD COLUMN "actorKind" "ProjectActorKind" NOT NULL DEFAULT 'human',
  ADD COLUMN "actorCredentialId" TEXT,
  ADD COLUMN "actorDisplayNameSnapshot" VARCHAR(80) NOT NULL DEFAULT 'Unknown actor';
UPDATE "TaskCommentReaction" r SET "actorDisplayNameSnapshot" = LEFT(COALESCE(NULLIF(u.username, ''), NULLIF(u.name, ''), NULLIF(split_part(u.email, '@', 1), ''), 'Unknown actor'), 80)
FROM "User" u WHERE u.id = r."userId";
ALTER TABLE "TaskCommentReaction" ADD CONSTRAINT "TaskCommentReaction_actorCredentialId_fkey" FOREIGN KEY ("actorCredentialId") REFERENCES "ApiCredential"(id) ON DELETE SET NULL ON UPDATE CASCADE;
DROP INDEX "TaskCommentReaction_commentId_userId_emoji_key";
CREATE UNIQUE INDEX "TaskCommentReaction_human_comment_user_emoji_key" ON "TaskCommentReaction"("commentId", "userId", emoji) WHERE "actorKind" = 'human';
CREATE UNIQUE INDEX "TaskCommentReaction_commentId_actorCredentialId_key" ON "TaskCommentReaction"("commentId", "actorCredentialId");
