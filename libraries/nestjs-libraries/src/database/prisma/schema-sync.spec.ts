const {
  buildPreservedSchema,
  assertAdditiveSql,
} = require('../../../../../tools/prisma-schema-sync.cjs');

const canonical =
  'datasource db {\n provider = "postgresql"\n url = env("DATABASE_URL")\n}\nmodel User {\n id String @id\n}';
describe('sincronizacao de schema sem perda de dados', () => {
  it('preserva o bloco vetorial integral usando a identidade @@map', () => {
    const block =
      'model Knowledge {\n id Int @id\n embedding Unsupported("vector(3)")?\n @@map("kb_profile")\n @@ignore\n}';
    expect(
      buildPreservedSchema(
        canonical,
        'model User {\n id String @id\n}\n' + block
      )
    ).toBe(canonical + '\n\n' + block + '\n');
  });
  it('recusa tabela desconhecida mesmo vazia antes de qualquer push', () => {
    expect(() =>
      buildPreservedSchema(canonical, 'model empty_unmanaged {\n id Int @id\n}')
    ).toThrow('empty_unmanaged');
  });
  it('recusa extracao incompleta ou nome ambiguo sem fallback destrutivo', () => {
    expect(() =>
      buildPreservedSchema(canonical, 'model kb_a {\n id Int')
    ).toThrow();
    expect(() =>
      buildPreservedSchema(
        canonical,
        'model A {\n id Int @id\n @@map("kb_x")\n}\nmodel B {\n id Int @id\n @@map("kb_x")\n}'
      )
    ).toThrow();
  });
  it.each([
    'DROP TABLE "empty";',
    'DROP INDEX "hnsw_idx";',
    'ALTER TABLE "User" DROP COLUMN "unused";',
    'ALTER TABLE "User" ALTER COLUMN "id" TYPE INTEGER;',
    'TRUNCATE TABLE "User";',
  ])('recusa SQL destrutivo: %s', (sql) => {
    expect(() => assertAdditiveSql(sql)).toThrow();
  });
  it('aceita somente operacoes aditivas previstas', () => {
    expect(() =>
      assertAdditiveSql(
        '-- CreateTable\nCREATE TABLE "new" ("id" TEXT);\nALTER TABLE "User" ADD COLUMN "timezone" TEXT;\nCREATE INDEX "safe" ON "User"("id");\nALTER TABLE "new" ADD CONSTRAINT "fk" FOREIGN KEY ("id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;'
      )
    ).not.toThrow();
    expect(() => assertAdditiveSql('UPDATE "User" SET "id"=1;')).toThrow();
  });
});
