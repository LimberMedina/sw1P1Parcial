-- CreateTable
CREATE TABLE "public"."DiagramVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagramVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiagramVersion_projectId_createdAt_idx" ON "public"."DiagramVersion"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."DiagramVersion" ADD CONSTRAINT "DiagramVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
