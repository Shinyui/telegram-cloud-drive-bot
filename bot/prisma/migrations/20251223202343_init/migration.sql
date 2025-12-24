-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('COLLECTING', 'NAMING', 'KEYWORDS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('PHOTO', 'VIDEO', 'DOCUMENT');

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'COLLECTING',
    "currentStep" TEXT NOT NULL DEFAULT 'collecting',
    "title" TEXT,
    "keywords" TEXT[],
    "shareKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileGroup" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "groupOrder" INTEGER NOT NULL,
    "mediaGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "telegramFileId" TEXT NOT NULL,
    "fileType" "MediaType" NOT NULL,
    "fileName" TEXT,
    "fileSize" BIGINT,
    "caption" TEXT,
    "captionEntities" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "messageId" INTEGER NOT NULL,
    "chatId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_shareKey_key" ON "UploadSession"("shareKey");

-- CreateIndex
CREATE INDEX "UploadSession_userId_status_idx" ON "UploadSession"("userId", "status");

-- CreateIndex
CREATE INDEX "UploadSession_shareKey_idx" ON "UploadSession"("shareKey");

-- CreateIndex
CREATE INDEX "FileGroup_sessionId_idx" ON "FileGroup"("sessionId");

-- CreateIndex
CREATE INDEX "FileGroup_mediaGroupId_idx" ON "FileGroup"("mediaGroupId");

-- CreateIndex
CREATE INDEX "MediaFile_groupId_idx" ON "MediaFile"("groupId");

-- CreateIndex
CREATE INDEX "MediaFile_telegramFileId_idx" ON "MediaFile"("telegramFileId");

-- AddForeignKey
ALTER TABLE "FileGroup" ADD CONSTRAINT "FileGroup_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFile" ADD CONSTRAINT "MediaFile_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FileGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
