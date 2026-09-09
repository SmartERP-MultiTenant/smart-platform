-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "lastReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "lastReminderStage" TEXT;
