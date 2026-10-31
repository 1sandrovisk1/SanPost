// Opt-in schema/storage upgrade matrix. Never accepts a production database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { PostgresStore } = require('@mastra/pg');

async function main() {
  const url = new URL(process.env.QA_DATABASE_URL || 'invalid:');
  assert(['postgres:', 'postgresql:'].includes(url.protocol));
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert(/^\/multipost_v05_proof_[a-z0-9_]+$/.test(url.pathname));
  assert(!url.search, 'Proof refuses connection query overrides.');
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'multipost-v05-'));
  const root = path.resolve(__dirname, '..');
  const cli = require.resolve('prisma/build/index.js');
  const run = (command, args) => {
    const result = spawnSync(command, args, {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url.toString() },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    assert.equal(
      result.status,
      0,
      'Proof subprocess failed; inspect the local fixture.'
    );
    return result.stdout;
  };
  const sync = () => run(process.execPath, ['tools/prisma-schema-sync.cjs']);
  const tables = [
    'Organization',
    'User',
    'UserOrganization',
    'Profile',
    'Integration',
    'Post',
    'RepostRule',
    'RepostRuleDestination',
  ];
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
      'Proof requires an initially empty database.'
    );
    const tags = run('git', ['tag', '-l', 'v0.5*']).trim().split('\n');
    assert(tags.includes('v0.5.0') && tags.includes('v0.5.6'));
    const groups = new Map();
    for (const tag of tags) {
      assert(/^v0\.5\.\d+(?:-rc\.\d+)?$/.test(tag));
      const schema = run('git', [
        'show',
        `${tag}:libraries/nestjs-libraries/src/database/prisma/schema.prisma`,
      ]);
      const hash = createHash('sha256').update(schema).digest('hex');
      const group = groups.get(hash) || { schema, tags: [] };
      group.tags.push(tag);
      groups.set(hash, group);
    }
    let first = true;
    for (const { schema, tags: represented } of groups.values()) {
      if (!first) {
        // Only this initially empty, explicitly disposable loopback DB is reset.
        await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      }
      first = false;
      const beforeFile = path.join(temp, 'before.prisma');
      fs.writeFileSync(beforeFile, schema);
      await pool.query(
        run(process.execPath, [
          cli,
          'migrate',
          'diff',
          '--from-empty',
          '--to-schema-datamodel',
          beforeFile,
          '--script',
        ])
      );
      await pool.query(`
        INSERT INTO "Organization" (id,name,"updatedAt") VALUES ('org','Organização preservada',now());
        INSERT INTO "User" (id,email,"providerName",timezone,"updatedAt") VALUES ('user','fixture@example.invalid','LOCAL',-180,now());
        INSERT INTO "UserOrganization" (id,"userId","organizationId",role,"updatedAt") VALUES ('member','user','org','SUPERADMIN',now());
        INSERT INTO "Profile" (id,name,slug,"organizationId","isDefault","updatedAt") VALUES ('profile','Perfil','perfil','org',true,now());
        INSERT INTO "Integration" (id,"internalId","organizationId",name,"providerIdentifier",type,token,"refreshToken","profileId") VALUES ('channel','external-fixture','org','Canal preservado','youtube','social','synthetic-credential','synthetic-refresh','profile');
        INSERT INTO "Post" (id,"publishDate","organizationId","profileId","integrationId",content,"group",settings,image,"updatedAt") VALUES ('queued','2030-01-01T15:00:00Z','org','profile','channel','<p>Texto e mídia preservados</p>','group','{"title":"Original"}','[{"id":"media","path":"https://example.invalid/fixture.mp4"}]',now());
        INSERT INTO "Post" (id,state,"publishDate","organizationId","profileId","integrationId",content,"group","releaseId","releaseURL","updatedAt") VALUES ('published','PUBLISHED','2026-01-01T15:00:00Z','org','profile','channel','Publicado','published-group','external-post','https://example.invalid/published',now());
        INSERT INTO "RepostRule" (id,"organizationId","profileId",name,"sourceIntegrationId","updatedAt") VALUES ('rule','org','profile','Regra preservada','channel',now());
        INSERT INTO "RepostRuleDestination" (id,"ruleId","integrationId",format) VALUES ('destination','rule','channel','FACEBOOK_REEL');
      `);
      const snapshots = new Map();
      for (const table of tables) {
        snapshots.set(
          table,
          (await pool.query(`SELECT * FROM "${table}" ORDER BY id`)).rows
        );
      }
      sync();
      const store = new PostgresStore({
        id: 'upgrade-proof',
        connectionString: url.toString(),
      });
      try {
        await store.init();
        await store.init();
        sync();
        sync();
        for (const [table, before] of snapshots) {
          const after = (
            await pool.query(`SELECT * FROM "${table}" ORDER BY id`)
          ).rows;
          assert.equal(
            after.length,
            before.length,
            `Row count changed: ${table}`
          );
          before.forEach((row, i) => {
            for (const [key, value] of Object.entries(row)) {
              assert.deepEqual(
                after[i][key],
                value,
                `Changed existing value: ${table}.${key}`
              );
            }
          });
        }
        // PostgreSQL enum additions become usable only after the sync commits.
        await pool.query(
          `INSERT INTO "RepostRuleDestination" (id,"ruleId","integrationId",format) VALUES ('story-destination','rule','channel','FACEBOOK_STORY');`
        );
        assert.equal(
          (
            await pool.query(
              `SELECT format FROM "RepostRuleDestination" WHERE id='story-destination'`
            )
          ).rows[0].format,
          'FACEBOOK_STORY'
        );
        console.log(
          'PASS schema/storage upgrade + repeated boot + populated rows + enum:',
          represented.join(', ')
        );
      } finally {
        await store.close();
      }
    }
    console.log(
      `PASS ${tags.length} tags represented by ${groups.size} distinct schemas. Temporal/provider behavior is outside this proof.`
    );
  } finally {
    await pool.end();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch(() => {
  console.error(
    '0.5 upgrade proof failed. Inspect only the disposable local fixture.'
  );
  process.exitCode = 1;
});
