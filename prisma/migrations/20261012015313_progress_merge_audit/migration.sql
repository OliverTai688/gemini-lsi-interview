-- AlterEnum
ALTER TYPE "AssetKind" ADD VALUE 'INTERVIEW_AUDIO_MERGED';

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "tokenEnc" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "activeClientId" TEXT,
ADD COLUMN     "progressStep" TEXT;

-- CreateTable
CREATE TABLE "AdminLog" (
    "id" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminLog_createdAt_idx" ON "AdminLog"("createdAt");

-- 新資料表一樣要開 RLS（理由見 init migration）
ALTER TABLE "AdminLog" ENABLE ROW LEVEL SECURITY;
