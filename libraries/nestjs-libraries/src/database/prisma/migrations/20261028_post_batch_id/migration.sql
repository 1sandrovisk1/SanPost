-- Posts salvos juntos para varios canais compartilham um lote (upstream
-- a194e3f4); posts antigos ficam com null e abrem sozinhos no editor. Aditivo e
-- idempotente: o stack padrao aplica por `prisma db push`; o overlay local, que
-- so roda `prisma validate`, aplica este arquivo.
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "batchId" TEXT;
CREATE INDEX IF NOT EXISTS "Post_batchId_idx" ON "Post"("batchId");
