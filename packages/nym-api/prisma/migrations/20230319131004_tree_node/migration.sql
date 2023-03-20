-- CreateTable
CREATE TABLE "TreeNode" (
    "id" SERIAL NOT NULL,
    "parent_id" INTEGER,
    "value" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TreeNode_pkey" PRIMARY KEY ("id")
);
