-- CreateTable
CREATE TABLE "TaskCommentReaction" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskCommentReaction_commentId_userId_emoji_key" ON "TaskCommentReaction"("commentId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "TaskCommentReaction_commentId_idx" ON "TaskCommentReaction"("commentId");

-- CreateIndex
CREATE INDEX "TaskCommentReaction_userId_idx" ON "TaskCommentReaction"("userId");

-- AddForeignKey
ALTER TABLE "TaskCommentReaction" ADD CONSTRAINT "TaskCommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentReaction" ADD CONSTRAINT "TaskCommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
