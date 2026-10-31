// Opt-in PostgreSQL regression. Refuses non-loopback or non-empty databases.
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { buildSyncPlan } = require('./prisma-schema-sync.cjs');

async function main() {
  const url = new URL(process.env.QA_DATABASE_URL || 'invalid:');
  assert(['postgres:', 'postgresql:'].includes(url.protocol));
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert(/^\/multipost_schema_proof_[a-z0-9_]+$/.test(url.pathname));
  assert(!url.search, 'Proof refuses connection query overrides.');
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  const client = await pool.connect();
  const oldIndex =
    'CREATE UNIQUE INDEX "idx_experiment_results_exp_item" ON public.mastra_experiment_results("experimentId", "itemId");';
  const sql = `DROP INDEX "idx_experiment_results_exp_item";
ALTER TABLE "mastra_experiment_results" ADD COLUMN "attempt" INTEGER;
CREATE UNIQUE INDEX "idx_experiment_results_exp_item_attempt" ON "mastra_experiment_results"("experimentId", "itemId", "attempt");`;
  const absentAttempt = async () => {
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='mastra_experiment_results' AND column_name='attempt'"
    );
    assert.equal(rows[0].n, 0, 'Rejected migration changed the table.');
    assert.equal(
      (
        await client.query(
          "SELECT to_regclass('public.idx_experiment_results_exp_item_attempt') AS name"
        )
      ).rows[0].name,
      null,
      'Rejected migration created an index.'
    );
  };
  const reject = async (name, setup, cleanup, message, expectedRows = 0) => {
    await client.query(setup);
    let error;
    try {
      await client.query(buildSyncPlan(sql));
    } catch (caught) {
      error = caught;
      await client.query('ROLLBACK');
    }
    assert(error, `Migration unexpectedly accepted ${name}.`);
    assert.match(error.message, message);
    await absentAttempt();
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS n FROM mastra_experiment_results'
        )
      ).rows[0].n,
      expectedRows,
      'Rejected migration changed experiment rows.'
    );
    await client.query(cleanup);
    console.log('PASS reject:', name);
  };
  try {
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'"
    );
    assert.equal(rows[0].n, 0, 'Proof refuses a non-empty database.');
    await client.query(`CREATE TABLE public.mastra_experiment_results (
      id TEXT PRIMARY KEY, "experimentId" TEXT NOT NULL, "itemId" TEXT NOT NULL
    ); ${oldIndex}`);
    await reject(
      'same name on another table',
      `DROP INDEX idx_experiment_results_exp_item;
       CREATE TABLE unrelated ("experimentId" TEXT, "itemId" TEXT);
       CREATE UNIQUE INDEX idx_experiment_results_exp_item ON unrelated("experimentId", "itemId");`,
      `DROP TABLE unrelated; ${oldIndex}`,
      /Indice de experimentos inesperado/
    );
    await reject(
      'partial index',
      `DROP INDEX idx_experiment_results_exp_item;
       CREATE UNIQUE INDEX idx_experiment_results_exp_item ON mastra_experiment_results("experimentId", "itemId") WHERE "itemId" <> '';`,
      `DROP INDEX idx_experiment_results_exp_item; ${oldIndex}`,
      /Indice de experimentos inesperado/
    );
    await reject(
      'constraint-owned index',
      `DROP INDEX idx_experiment_results_exp_item;
       ALTER TABLE mastra_experiment_results ADD CONSTRAINT idx_experiment_results_exp_item UNIQUE("experimentId", "itemId");`,
      `ALTER TABLE mastra_experiment_results DROP CONSTRAINT idx_experiment_results_exp_item; ${oldIndex}`,
      /Indice de experimentos inesperado/
    );
    await reject(
      'foreign key dependency',
      'CREATE TABLE dependent (e TEXT, i TEXT, FOREIGN KEY (e,i) REFERENCES mastra_experiment_results("experimentId","itemId"));',
      'DROP TABLE dependent;',
      /Indice de experimentos inesperado/
    );
    await reject(
      'different search path',
      'CREATE SCHEMA proof_other; SET search_path=proof_other,public;',
      'RESET search_path; DROP SCHEMA proof_other;',
      /Schema de experimentos inesperado/
    );
    await reject(
      'nullable legacy keys',
      'ALTER TABLE mastra_experiment_results ALTER COLUMN "itemId" DROP NOT NULL;',
      'ALTER TABLE mastra_experiment_results ALTER COLUMN "itemId" SET NOT NULL;',
      /Tabela de experimentos personalizada/
    );
    await reject(
      'custom update trigger',
      `CREATE FUNCTION proof_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
       CREATE TRIGGER custom_update BEFORE UPDATE ON mastra_experiment_results FOR EACH ROW EXECUTE FUNCTION proof_trigger();`,
      'DROP TRIGGER custom_update ON mastra_experiment_results; DROP FUNCTION proof_trigger();',
      /Tabela de experimentos personalizada/
    );
    await reject(
      'custom rewrite rule',
      'CREATE RULE custom_update AS ON UPDATE TO mastra_experiment_results DO INSTEAD NOTHING;',
      'DROP RULE custom_update ON mastra_experiment_results;',
      /Tabela de experimentos personalizada/
    );
    await reject(
      'row-level security',
      'ALTER TABLE mastra_experiment_results ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mastra_experiment_results DISABLE ROW LEVEL SECURITY;',
      /Tabela de experimentos personalizada/
    );
    await reject(
      'inherited table',
      'CREATE TABLE proof_child () INHERITS (mastra_experiment_results);',
      'DROP TABLE proof_child;',
      /Tabela de experimentos personalizada/
    );
    await client.query(buildSyncPlan(sql));
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS n FROM mastra_experiment_results'
        )
      ).rows[0].n,
      0
    );
    console.log('PASS empty legacy upgrade');
    // Recreate a partial legacy upgrade with existing NULL and non-NULL attempts.
    await client.query(`DROP INDEX idx_experiment_results_exp_item_attempt;
      ${oldIndex}
      INSERT INTO mastra_experiment_results VALUES ('legacy-null','e1','i',NULL),('legacy-seven','e2','i',7);`);
    const before = (
      await client.query(
        'SELECT id,"experimentId","itemId" FROM mastra_experiment_results ORDER BY id'
      )
    ).rows;
    const partial = sql.replace(
      'ALTER TABLE "mastra_experiment_results" ADD COLUMN "attempt" INTEGER;',
      ''
    );
    await client.query(buildSyncPlan(partial));
    assert.deepEqual(
      (
        await client.query(
          'SELECT id,"experimentId","itemId" FROM mastra_experiment_results ORDER BY id'
        )
      ).rows,
      before
    );
    assert.deepEqual(
      (
        await client.query(
          'SELECT id,attempt FROM mastra_experiment_results ORDER BY id'
        )
      ).rows,
      [
        { id: 'legacy-null', attempt: 0 },
        { id: 'legacy-seven', attempt: 7 },
      ]
    );
    console.log(
      'PASS populated partial upgrade preserves IDs/payload and normalizes NULL only'
    );
    assert.equal(
      (
        await client.query(
          "SELECT to_regclass('public.idx_experiment_results_exp_item') AS name"
        )
      ).rows[0].name,
      null
    );
    assert.equal(
      (
        await client.query(
          "SELECT indexdef FROM pg_indexes WHERE indexname='idx_experiment_results_exp_item_attempt'"
        )
      ).rows[0].indexdef,
      'CREATE UNIQUE INDEX idx_experiment_results_exp_item_attempt ON public.mastra_experiment_results USING btree ("experimentId", "itemId", attempt)'
    );
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS n FROM mastra_experiment_results'
        )
      ).rows[0].n,
      2
    );
    await client.query(buildSyncPlan('-- This is an empty migration.'));
    await client.query(buildSyncPlan('-- This is an empty migration.'));
    console.log(
      'PASS replacement definition, row preservation and repeat boot.'
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(() => {
  // Never print an exception that could contain a connection string.
  console.error(
    'Legacy index proof failed; inspect only the disposable local database.'
  );
  process.exitCode = 1;
});
