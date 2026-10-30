// Opt-in upgrade proof. Requires an EMPTY disposable local Postgres + pgvector database.
const { Pool } = require('pg');
const { PostgresStore, PgVector } = require('@mastra/pg');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function main() {
  const url = new URL(process.env.QA_DATABASE_URL || 'invalid:');
  assert(
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    'Use only a disposable loopback database.'
  );
  assert(
    /^\/multipost_ai_proof_[a-z0-9_]+$/.test(url.pathname),
    'Database must be named multipost_ai_proof_*.'
  );
  const pool = new Pool({ connectionString: url.toString() });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mastra-proof-'));
  let store, vector;
  const root = path.resolve(__dirname, '..');
  const cli = require.resolve('prisma/build/index.js');
  const env = { ...process.env, DATABASE_URL: url.toString() };
  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, {
      cwd: root,
      env,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    assert.equal(
      r.status,
      0,
      'Local proof subprocess failed; inspect the disposable database.'
    );
    return r.stdout;
  };
  const sync = () => run(process.execPath, ['tools/prisma-schema-sync.cjs']);
  try {
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT count(*) FROM pg_tables WHERE schemaname='public'"
          )
        ).rows[0].count
      ),
      0,
      'Proof refuses a non-empty database.'
    );
    // This fixed ancestor is the complete pre-upgrade schema, including the fork.
    const before = run('git', [
      'show',
      '15c1acc7:libraries/nestjs-libraries/src/database/prisma/schema.prisma',
    ]);
    const beforeFile = path.join(temp, 'before.prisma');
    fs.writeFileSync(beforeFile, before);
    const ddl = run(process.execPath, [
      cli,
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema-datamodel',
      beforeFile,
      '--script',
    ]);
    await pool.query(ddl);
    await pool.query(`CREATE EXTENSION vector;
      INSERT INTO mastra_threads(id,"resourceId",title,"createdAt","updatedAt") VALUES ('legacy','org','Conversa antiga',now(),now());
      INSERT INTO mastra_messages(id,thread_id,content,role,type,"createdAt","resourceId") VALUES ('message','legacy','Mensagem antiga','user','text',now(),'org');
      CREATE TABLE kb_proof(id SERIAL PRIMARY KEY,vector_id TEXT UNIQUE NOT NULL,embedding vector(3),metadata JSONB);
      INSERT INTO kb_proof(vector_id,embedding,metadata) VALUES ('legacy','[1,0,0]','{"before":true}');
      CREATE INDEX kb_proof_hnsw ON kb_proof USING hnsw(embedding vector_cosine_ops);`);
    const hnswBefore = (
      await pool.query(
        "SELECT indexdef FROM pg_indexes WHERE indexname='kb_proof_hnsw'"
      )
    ).rows;
    sync();
    store = new PostgresStore({
      id: 'proof',
      connectionString: url.toString(),
    });
    await store.init();
    await store.init();
    const memory = await store.getStore('memory');
    assert.equal(
      (await memory.getThreadById({ threadId: 'legacy' })).title,
      'Conversa antiga'
    );
    assert.equal(
      (
        await pool.query(
          "SELECT content FROM mastra_messages WHERE id='message'"
        )
      ).rows[0].content,
      'Mensagem antiga'
    );
    await memory.saveThread({
      thread: {
        id: 'new',
        resourceId: 'new-org',
        title: 'Nova',
        metadata: { profileId: 'new-profile' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    assert.equal(
      (await memory.getThreadById({ threadId: 'new' })).resourceId,
      'new-org'
    );
    vector = new PgVector({ id: 'proof', connectionString: url.toString() });
    await vector.createIndex({ indexName: 'kb_proof', dimension: 3 });
    const found = await vector.query({
      indexName: 'kb_proof',
      queryVector: [1, 0, 0],
      topK: 1,
    });
    assert.equal(found[0].id, 'legacy');
    assert.equal(found[0].metadata.before, true);
    await vector.upsert({
      indexName: 'kb_proof',
      vectors: [[0, 1, 0]],
      ids: ['new'],
      metadata: [{ before: false }],
    });
    assert.deepEqual(
      (
        await pool.query(
          "SELECT indexdef FROM pg_indexes WHERE indexname='kb_proof_hnsw'"
        )
      ).rows,
      hnswBefore
    );
    const indexes = async () =>
      (
        await pool.query(
          "SELECT indexname,indexdef FROM pg_indexes WHERE tablename='kb_proof' ORDER BY indexname"
        )
      ).rows;
    const expectedIndexes = await indexes();
    for (let n = 0; n < 2; n++) {
      sync();
      assert.deepEqual(await indexes(), expectedIndexes);
      assert.equal(
        Number(
          (await pool.query('SELECT count(*) FROM kb_proof')).rows[0].count
        ),
        2
      );
    }
    const tables = (
      await pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'mastra_%'"
      )
    ).rows;
    assert.equal(tables.length, 45);
    await pool.query('CREATE TABLE unknown_empty_table(id int)');
    const refused = spawnSync(
      process.execPath,
      ['tools/prisma-schema-sync.cjs'],
      { cwd: root, env, encoding: 'utf8' }
    );
    assert.equal(refused.status, 1);
    assert(refused.stderr.includes('unknown_empty_table'));
    assert.equal(
      (await pool.query("SELECT to_regclass('unknown_empty_table') name"))
        .rows[0].name,
      'unknown_empty_table'
    );
    console.log(
      'PASS: old/new memory, vectors, exact HNSW/index definitions, 45 Mastra tables, two repeat syncs, unknown empty table preserved.'
    );
  } finally {
    if (vector) await vector.disconnect();
    if (store) await store.close();
    await pool.end();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(() => {
  console.error(
    'Storage proof failed. No production database is permitted by this script.'
  );
  process.exitCode = 1;
});
