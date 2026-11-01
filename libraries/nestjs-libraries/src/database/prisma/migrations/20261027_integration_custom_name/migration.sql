-- Nome do canal so no SanPost (upstream #2190) e indice de
-- UserOrganization por organizacao (upstream 7229c338). Aditivo e idempotente:
-- o stack padrao aplica por `prisma db push`; o overlay local, que so roda
-- `prisma validate`, aplica este arquivo.
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "customName" TEXT;
CREATE INDEX IF NOT EXISTS "UserOrganization_organizationId_idx" ON "UserOrganization"("organizationId");
