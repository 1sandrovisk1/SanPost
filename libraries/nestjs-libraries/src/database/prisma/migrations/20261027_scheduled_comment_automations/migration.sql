-- CreateTable
CREATE TABLE "ScheduledAutomationTarget" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "publishedReleaseId" TEXT,
    "boundPostIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "boundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledAutomationTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledAutomationEvent" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "event" JSONB NOT NULL,
    "flowUpdatedAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledAutomationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledAutomationTarget_integrationId_idx" ON "ScheduledAutomationTarget"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledAutomationTarget_flowId_integrationId_key" ON "ScheduledAutomationTarget"("flowId", "integrationId");

-- CreateIndex
CREATE INDEX "ScheduledAutomationEvent_state_availableAt_idx" ON "ScheduledAutomationEvent"("state", "availableAt");

-- CreateIndex
CREATE INDEX "ScheduledAutomationEvent_expiresAt_idx" ON "ScheduledAutomationEvent"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledAutomationEvent_targetId_externalEventId_key" ON "ScheduledAutomationEvent"("targetId", "externalEventId");

-- AddForeignKey
ALTER TABLE "ScheduledAutomationTarget" ADD CONSTRAINT "ScheduledAutomationTarget_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAutomationTarget" ADD CONSTRAINT "ScheduledAutomationTarget_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAutomationEvent" ADD CONSTRAINT "ScheduledAutomationEvent_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "ScheduledAutomationTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
