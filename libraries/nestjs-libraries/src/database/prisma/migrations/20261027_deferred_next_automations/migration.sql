-- Fila independente para preservar a proxima publicacao durante resolucao de IDs.
CREATE TABLE "DeferredNextAutomationEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "externalEventId" TEXT NOT NULL,
  "event" JSONB NOT NULL,
  "candidates" JSONB NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeferredNextAutomationEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeferredNextAutomationEvent_integrationId_externalEventId_key" ON "DeferredNextAutomationEvent"("integrationId", "externalEventId");
CREATE INDEX "DeferredNextAutomationEvent_state_availableAt_idx" ON "DeferredNextAutomationEvent"("state", "availableAt");
CREATE INDEX "DeferredNextAutomationEvent_expiresAt_idx" ON "DeferredNextAutomationEvent"("expiresAt");
