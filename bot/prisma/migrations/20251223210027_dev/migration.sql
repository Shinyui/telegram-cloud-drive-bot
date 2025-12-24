/*
  Warnings:

  - The values [NAMING,KEYWORDS] on the enum `SessionStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `groupId` on the `MediaFile` table. All the data in the column will be lost.
  - You are about to drop the column `currentStep` on the `UploadSession` table. All the data in the column will be lost.
  - You are about to drop the column `keywords` on the `UploadSession` table. All the data in the column will be lost.
  - You are about to drop the column `shareKey` on the `UploadSession` table. All the data in the column will be lost.
  - You are about to drop the `FileGroup` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[shareCode]` on the table `UploadSession` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `sessionId` to the `MediaFile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MediaType" ADD VALUE 'AUDIO';
ALTER TYPE "MediaType" ADD VALUE 'VOICE';

-- AlterEnum
BEGIN;
CREATE TYPE "SessionStatus_new" AS ENUM ('COLLECTING', 'SETTING', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."UploadSession" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "UploadSession" ALTER COLUMN "status" TYPE "SessionStatus_new" USING ("status"::text::"SessionStatus_new");
ALTER TYPE "SessionStatus" RENAME TO "SessionStatus_old";
ALTER TYPE "SessionStatus_new" RENAME TO "SessionStatus";
DROP TYPE "public"."SessionStatus_old";
ALTER TABLE "UploadSession" ALTER COLUMN "status" SET DEFAULT 'COLLECTING';
COMMIT;

-- DropForeignKey
ALTER TABLE "FileGroup" DROP CONSTRAINT "FileGroup_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "MediaFile" DROP CONSTRAINT "MediaFile_groupId_fkey";

-- DropIndex
DROP INDEX "MediaFile_groupId_idx";

-- DropIndex
DROP INDEX "MediaFile_telegramFileId_idx";

-- DropIndex
DROP INDEX "UploadSession_shareKey_idx";

-- DropIndex
DROP INDEX "UploadSession_shareKey_key";

-- AlterTable
ALTER TABLE "MediaFile" DROP COLUMN "groupId",
ADD COLUMN     "groupIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mediaGroupId" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "sessionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "UploadSession" DROP COLUMN "currentStep",
DROP COLUMN "keywords",
DROP COLUMN "shareKey",
ADD COLUMN     "keyword" TEXT,
ADD COLUMN     "preventForward" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareCode" TEXT,
ADD COLUMN     "shareLink" TEXT,
ADD COLUMN     "totalFiles" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalSize" BIGINT NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "FileGroup";

-- CreateIndex
CREATE INDEX "MediaFile_sessionId_idx" ON "MediaFile"("sessionId");

-- CreateIndex
CREATE INDEX "MediaFile_mediaGroupId_idx" ON "MediaFile"("mediaGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_shareCode_key" ON "UploadSession"("shareCode");

-- CreateIndex
CREATE INDEX "UploadSession_shareCode_idx" ON "UploadSession"("shareCode");

-- CreateIndex
CREATE INDEX "UploadSession_keyword_idx" ON "UploadSession"("keyword");

-- AddForeignKey
ALTER TABLE "MediaFile" ADD CONSTRAINT "MediaFile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
