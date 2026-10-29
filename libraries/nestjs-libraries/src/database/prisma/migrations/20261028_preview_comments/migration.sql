-- Comentarios no preview (upstream #2079): respostas, trecho do texto e
-- resolvido. Aditivo e idempotente: o stack padrao aplica por `prisma db
-- push`; o overlay local, que so roda `prisma validate`, aplica este arquivo.
ALTER TABLE "Comments" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "Comments" ADD COLUMN IF NOT EXISTS "anchorStart" INTEGER;
ALTER TABLE "Comments" ADD COLUMN IF NOT EXISTS "anchorEnd" INTEGER;
ALTER TABLE "Comments" ADD COLUMN IF NOT EXISTS "anchorQuote" TEXT;
ALTER TABLE "Comments" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Comments_parentId_idx" ON "Comments"("parentId");
CREATE INDEX IF NOT EXISTS "Comments_resolvedAt_idx" ON "Comments"("resolvedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Comments_parentId_fkey'
  ) THEN
    ALTER TABLE "Comments" ADD CONSTRAINT "Comments_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "Comments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
