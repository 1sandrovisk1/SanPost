/** Guarded boot sync. Preserve knowledge tables; never accept generic data loss. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function models(schema) {
  const starts = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)];
  return starts.map((match) => {
    // Prisma model bodies have no nested braces. Match a whole block, including
    // Unsupported vector fields and @@map, rather than reconstructing its fields.
    const end = schema.indexOf('\n}', match.index);
    if (
      end < 0 ||
      starts.some((next) => next.index > match.index && next.index < end)
    ) {
      throw new Error(
        'Schema introspectado incompleto; sincronizacao cancelada.'
      );
    }
    const block = schema.slice(match.index, end + 2);
    const mapped = [...block.matchAll(/@@map\("([^"\\]+)"\)/g)];
    if (mapped.length > 1) throw new Error('Identidade de tabela ambigua.');
    return { table: mapped[0]?.[1] || match[1], block };
  });
}

function buildPreservedSchema(canonical, introspected) {
  const known = new Set(models(canonical).map(({ table }) => table));
  const seen = new Set();
  const kept = [];
  for (const { table, block } of models(introspected)) {
    if (seen.has(table)) throw new Error('Identidade de tabela duplicada.');
    seen.add(table);
    if (known.has(table)) continue;
    if (!/^kb_[A-Za-z0-9_]+$/.test(table)) {
      throw new Error(
        `Tabela fora do schema: ${table}. Sincronizacao cancelada; revisar manualmente.`
      );
    }
    kept.push(
      block.includes('@@ignore') ? block : block.slice(0, -1) + '  @@ignore\n}'
    );
  }
  return canonical + (kept.length ? '\n\n' + kept.join('\n\n') + '\n' : '');
}

function assertAdditiveSql(sql) {
  const statements = sql
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    // Pre-0.5.3 databases lack this additive enum member. Keep this exception
    // exact: arbitrary ALTER TYPE (including renames) stays rejected. PG17
    // makes the new member usable after this plan's COMMIT.
    if (
      statement ===
      'ALTER TYPE "RepostDestinationFormat" ADD VALUE \'FACEBOOK_STORY\''
    )
      continue;
    if (
      /\b(DROP|TRUNCATE|ALTER\s+COLUMN|RENAME)\b/i.test(statement) ||
      !/^(CREATE\s+(TABLE|TYPE|(?:UNIQUE\s+)?INDEX)|ALTER\s+TABLE\s+"[^"]+"\s+ADD\s+(COLUMN|CONSTRAINT))\b/i.test(
        statement
      )
    ) {
      throw new Error(
        'Plano de banco contem alteracao nao aditiva; sincronizacao cancelada. Revisar SQL manualmente.'
      );
    }
  }
}

// Mastra 1.25 replaces its legacy experiment/item uniqueness with attempt-aware
// uniqueness. Recognize only the exact Prisma plan, then check the actual index
// under the same lock/transaction as the replacement. The SDK reads legacy
// NULL attempts as zero; normalize only that field before retiring uniqueness.
const LEGACY_DROP = 'DROP INDEX "idx_experiment_results_exp_item"';
const EXPERIMENT_REPLACEMENT =
  'CREATE UNIQUE INDEX "idx_experiment_results_exp_item_attempt" ON "mastra_experiment_results"("experimentId", "itemId", "attempt")';

function experimentIndexGuard(name, definition) {
  // Both arguments are fixed constants below, never introspected SQL or input.
  return `DO $guard$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_class x ON x.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = x.relnamespace
      JOIN pg_am a ON a.oid = x.relam
      WHERE n.nspname = 'public' AND x.relname = '${name}'
        AND i.indrelid = 'public.mastra_experiment_results'::regclass
        AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive
        AND NOT i.indisprimary AND NOT i.indisreplident
        AND a.amname = 'btree' AND i.indpred IS NULL AND i.indexprs IS NULL
        AND i.indnatts = i.indnkeyatts
        AND pg_get_indexdef(i.indexrelid) = '${definition}'
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
    ) THEN
      RAISE EXCEPTION 'Indice de experimentos inesperado; migracao cancelada';
    END IF;
  END $guard$;`;
}

function buildSyncPlan(sql) {
  const statements = sql
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const legacyDrops = statements.filter((s) => s === LEGACY_DROP).length;
  if (!legacyDrops) {
    assertAdditiveSql(sql);
    return 'BEGIN;\n' + sql + '\nCOMMIT;\n';
  }
  if (
    legacyDrops !== 1 ||
    statements.filter((s) => s === EXPERIMENT_REPLACEMENT).length !== 1
  ) {
    throw new Error(
      'Plano legado de experimentos inesperado; sincronizacao cancelada.'
    );
  }
  const additive = statements
    .filter((s) => s !== LEGACY_DROP)
    .map((s) => s + ';')
    .join('\n');
  assertAdditiveSql(additive);
  const oldGuard = experimentIndexGuard(
    'idx_experiment_results_exp_item',
    'CREATE UNIQUE INDEX idx_experiment_results_exp_item ON public.mastra_experiment_results USING btree ("experimentId", "itemId")'
  );
  const newGuard = experimentIndexGuard(
    'idx_experiment_results_exp_item_attempt',
    'CREATE UNIQUE INDEX idx_experiment_results_exp_item_attempt ON public.mastra_experiment_results USING btree ("experimentId", "itemId", attempt)'
  );
  return `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $guard$ BEGIN
  IF current_schema() IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'Schema de experimentos inesperado; migracao cancelada';
  END IF;
END $guard$;
LOCK TABLE public.mastra_experiment_results IN ACCESS EXCLUSIVE MODE;
${oldGuard}
DO $guard$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class t WHERE t.oid = 'public.mastra_experiment_results'::regclass
      AND t.relkind = 'r' AND NOT t.relispartition
      AND NOT t.relrowsecurity AND NOT t.relforcerowsecurity
  ) OR (SELECT count(*) FROM pg_attribute a
    WHERE a.attrelid = 'public.mastra_experiment_results'::regclass
      AND a.attname IN ('experimentId', 'itemId') AND a.attnotnull
      AND a.attnum > 0 AND NOT a.attisdropped) <> 2
    OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhparent = 'public.mastra_experiment_results'::regclass
      OR inhrelid = 'public.mastra_experiment_results'::regclass)
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.mastra_experiment_results'::regclass AND NOT tgisinternal)
    OR EXISTS (SELECT 1 FROM pg_rewrite WHERE ev_class = 'public.mastra_experiment_results'::regclass)
  THEN
    RAISE EXCEPTION 'Tabela de experimentos personalizada; migracao revisada necessaria';
  END IF;
END $guard$;
${additive}
${newGuard}
DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.mastra_experiment_results'::regclass
      AND a.attname = 'attempt' AND a.atttypid = 'pg_catalog.int4'::regtype
      AND NOT a.attisdropped AND a.attgenerated = '' AND a.attidentity = '')
  THEN
    RAISE EXCEPTION 'Coluna attempt inesperada; migracao cancelada';
  END IF;
END $guard$;
UPDATE public.mastra_experiment_results SET "attempt" = 0 WHERE "attempt" IS NULL;
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM public.mastra_experiment_results WHERE "attempt" IS NULL) THEN
    RAISE EXCEPTION 'Normalizacao de attempt incompleta; migracao cancelada';
  END IF;
END $guard$;
DROP INDEX public."idx_experiment_results_exp_item";
COMMIT;
`;
}

function main() {
  const root = path.resolve(__dirname, '..');
  const schema = path.join(
    root,
    'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
  );
  const cli = require.resolve('prisma/build/index.js');
  const run = (args) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  const checked = (args, phase) => {
    const result = run(args);
    if (result.status !== 0) {
      // Do not leak connection URLs or introspected business data into boot logs.
      const code = /\bP\d{4}\b/.exec(result.stderr || '')?.[0];
      throw new Error(
        `${phase} falhou${
          code ? ` (${code})` : ''
        }; nenhuma aceitacao automatica de perda de dados.`
      );
    }
    return result.stdout;
  };
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multipost-schema-'));
  let applied = false;
  try {
    const canonical = fs.readFileSync(schema, 'utf8');
    const pulled = run(['db', 'pull', '--print', '--schema', schema]);
    let introspected = pulled.stdout;
    if (pulled.status !== 0) {
      if (!/\bP4001\b/.test(pulled.stderr || ''))
        throw new Error(
          'Introspeccao do banco falhou; sincronizacao cancelada.'
        );
      introspected = '';
    }
    const preserved = path.join(tempDir, 'schema.prisma');
    fs.writeFileSync(preserved, buildPreservedSchema(canonical, introspected), {
      mode: 0o600,
    });
    const sql = checked(
      [
        'migrate',
        'diff',
        '--from-schema-datasource',
        schema,
        '--to-schema-datamodel',
        preserved,
        '--script',
      ],
      'Inspecao do plano'
    );
    const planFile = path.join(tempDir, 'additive.sql');
    fs.writeFileSync(planFile, buildSyncPlan(sql), {
      mode: 0o600,
    });
    checked(
      ['db', 'execute', '--schema', preserved, '--file', planFile],
      'Atualizacao do banco'
    );
    applied = true;
    checked(
      ['generate', '--schema', schema],
      'Geracao do cliente (banco ja atualizado)'
    );
    process.stdout.write(
      'Schema atualizado com plano validado; tabelas de conhecimento preservadas.\n'
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (applied) process.stdout.write('Sincronizacao do banco aplicada.\n');
  }
}

module.exports = { buildPreservedSchema, assertAdditiveSql, buildSyncPlan };
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
