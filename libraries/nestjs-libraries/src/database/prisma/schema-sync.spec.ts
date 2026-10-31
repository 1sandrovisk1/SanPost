const {
  buildPreservedSchema,
  assertAdditiveSql,
  buildSyncPlan,
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
  it('aceita o acrescimo exato do formato Facebook Story desde a versao 0.5', () => {
    const sql =
      'ALTER TYPE "RepostDestinationFormat" ADD VALUE \'FACEBOOK_STORY\';';
    expect(() => assertAdditiveSql(sql)).not.toThrow();
    expect(buildSyncPlan(sql)).toBe('BEGIN;\n' + sql + '\nCOMMIT;\n');
  });
  it.each([
    'ALTER TYPE "Other" ADD VALUE \'FACEBOOK_STORY\';',
    'ALTER TYPE "RepostDestinationFormat" ADD VALUE \'UNKNOWN\';',
    "ALTER TYPE \"RepostDestinationFormat\" RENAME VALUE 'INSTAGRAM_STORY' TO 'FACEBOOK_STORY';",
    "ALTER TYPE \"RepostDestinationFormat\" ADD VALUE 'FACEBOOK_STORY' BEFORE 'X_POST';",
    'ALTER TYPE "RepostDestinationFormat" ADD VALUE \'FACEBOOK_STORY\'; DROP TABLE "Post";',
  ])('recusa mudanca de enum fora do acrescimo conhecido: %s', (sql) => {
    expect(() => buildSyncPlan(sql)).toThrow();
  });
});

describe('migracao do indice legado de experimentos Mastra', () => {
  const oldDrop = 'DROP INDEX "idx_experiment_results_exp_item";';
  const replacement =
    'CREATE UNIQUE INDEX "idx_experiment_results_exp_item_attempt" ON "mastra_experiment_results"("experimentId", "itemId", "attempt");';
  const addColumn =
    'ALTER TABLE "mastra_experiment_results" ADD COLUMN "attempt" INTEGER;';
  it('mantem a transacao aditiva normal sem excecao de indice', () => {
    expect(buildSyncPlan(addColumn)).toBe(
      'BEGIN;\n' + addColumn + '\nCOMMIT;\n'
    );
    expect(() => assertAdditiveSql(oldDrop)).toThrow();
  });
  it('substitui so o indice legado conhecido, criando o novo antes de remover', () => {
    const plan = buildSyncPlan(
      '-- DropIndex\n' + oldDrop + '\n' + addColumn + '\n' + replacement
    );
    expect(plan).toContain(
      'LOCK TABLE public.mastra_experiment_results IN ACCESS EXCLUSIVE MODE'
    );
    expect(plan).toContain('pg_get_indexdef');
    expect(plan).toContain('pg_constraint');
    expect(plan).toContain(
      'UPDATE public.mastra_experiment_results SET "attempt" = 0 WHERE "attempt" IS NULL;'
    );
    expect(plan).toContain('pg_trigger');
    expect(plan).toContain('pg_rewrite');
    expect(plan).toContain('relrowsecurity');
    expect(plan.indexOf(replacement)).toBeLessThan(
      plan.indexOf('DROP INDEX public."idx_experiment_results_exp_item";')
    );
    expect(plan).not.toContain('CASCADE');
    expect(plan).toMatch(/^BEGIN;/);
    expect(plan).toMatch(/COMMIT;\n$/);
  });
  it.each([
    oldDrop,
    oldDrop + oldDrop + replacement,
    oldDrop + replacement + replacement,
    oldDrop + replacement + 'DROP TABLE "Post";',
    oldDrop + replacement + 'DROP INDEX "custom_index";',
    oldDrop +
      replacement +
      'ALTER TABLE "Post" ALTER COLUMN "id" TYPE INTEGER;',
    oldDrop +
      'CREATE UNIQUE INDEX "idx_experiment_results_exp_item_attempt" ON "Post"("id");',
    oldDrop +
      'CREATE UNIQUE INDEX "idx_experiment_results_exp_item_attempt" ON "mastra_experiment_results"("experimentId", "itemId", "attempt") WHERE "attempt" IS NOT NULL;',
    'DROP INDEX "IDX_EXPERIMENT_RESULTS_EXP_ITEM";' + replacement,
  ])('recusa plano fora da migracao exata: %s', (sql) => {
    expect(() => buildSyncPlan(sql)).toThrow();
  });
});
