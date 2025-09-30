-- CreateEnum
CREATE TYPE "public"."EditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "public"."ProjectShareLink" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "public"."ProjectRole" NOT NULL DEFAULT 'VIEWER',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EditRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "message" TEXT,
    "status" "public"."EditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectShareLink_token_key" ON "public"."ProjectShareLink"("token");

-- CreateIndex
CREATE INDEX "ProjectShareLink_projectId_idx" ON "public"."ProjectShareLink"("projectId");

-- CreateIndex
CREATE INDEX "EditRequest_projectId_idx" ON "public"."EditRequest"("projectId");

-- CreateIndex
CREATE INDEX "EditRequest_requesterId_idx" ON "public"."EditRequest"("requesterId");

-- CreateIndex
CREATE UNIQUE INDEX "EditRequest_projectId_requesterId_key" ON "public"."EditRequest"("projectId", "requesterId");

-- AddForeignKey
ALTER TABLE "public"."ProjectShareLink" ADD CONSTRAINT "ProjectShareLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EditRequest" ADD CONSTRAINT "EditRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EditRequest" ADD CONSTRAINT "EditRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
