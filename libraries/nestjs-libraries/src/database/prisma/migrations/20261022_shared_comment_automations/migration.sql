-- AlterTable
ALTER TABLE "Flow" ADD COLUMN     "definition" JSONB,
ADD COLUMN     "definitionVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "executionVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "FlowChannel" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "remoteAccountId" TEXT NOT NULL,
    "postMode" TEXT NOT NULL,
    "postIds" TEXT[],
    "boundPostId" TEXT,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "FlowChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "remoteAccountId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "externalPostId" TEXT NOT NULL,
    "externalActorId" TEXT NOT NULL,
    "actorName" TEXT,
    "text" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationDispatch" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowExecutionV2" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "remoteAccountId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FlowExecutionV2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowDelivery" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "effectKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENDING',
    "remoteId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlowChannel_integrationId_idx" ON "FlowChannel"("integrationId");

-- CreateIndex
CREATE INDEX "FlowChannel_platform_remoteAccountId_idx" ON "FlowChannel"("platform", "remoteAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowChannel_flowId_integrationId_key" ON "FlowChannel"("flowId", "integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationEvent_integrationId_eventType_externalEventId_key" ON "AutomationEvent"("integrationId", "eventType", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationDispatch_executionId_key" ON "AutomationDispatch"("executionId");

-- CreateIndex
CREATE INDEX "AutomationDispatch_state_createdAt_idx" ON "AutomationDispatch"("state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationDispatch_flowId_channelId_eventId_key" ON "AutomationDispatch"("flowId", "channelId", "eventId");

-- CreateIndex
CREATE INDEX "FlowExecutionV2_flowId_createdAt_idx" ON "FlowExecutionV2"("flowId", "createdAt");

-- CreateIndex
CREATE INDEX "FlowExecutionV2_integrationId_status_idx" ON "FlowExecutionV2"("integrationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FlowDelivery_effectKey_key" ON "FlowDelivery"("effectKey");

-- CreateIndex
CREATE UNIQUE INDEX "FlowDelivery_executionId_actionKey_key" ON "FlowDelivery"("executionId", "actionKey");

-- AddForeignKey
ALTER TABLE "FlowChannel" ADD CONSTRAINT "FlowChannel_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowExecutionV2" ADD CONSTRAINT "FlowExecutionV2_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowDelivery" ADD CONSTRAINT "FlowDelivery_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "FlowExecutionV2"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
