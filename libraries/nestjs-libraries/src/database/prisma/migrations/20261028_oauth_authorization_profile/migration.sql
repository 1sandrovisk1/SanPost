-- Token de app OAuth aprovado por membro USER fica preso ao perfil de quem
-- aprovou (null = org inteira, aprovado por ADMIN/SUPERADMIN). Aditivo e
-- idempotente: o stack padrao aplica por `prisma db push`; o overlay local,
-- que so roda `prisma validate`, aplica este arquivo.
ALTER TABLE "OAuthAuthorization" ADD COLUMN IF NOT EXISTS "profileId" TEXT;
CREATE INDEX IF NOT EXISTS "OAuthAuthorization_profileId_idx" ON "OAuthAuthorization"("profileId");
