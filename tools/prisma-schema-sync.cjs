/** Additive boot sync. Preserve dynamic knowledge tables; never accept data loss. */
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
    assertAdditiveSql(sql);
    const planFile = path.join(tempDir, 'additive.sql');
    fs.writeFileSync(planFile, 'BEGIN;\n' + sql + '\nCOMMIT;\n', {
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
      'Schema atualizado sem operacoes destrutivas; tabelas de conhecimento preservadas.\n'
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (applied) process.stdout.write('Sincronizacao do banco aplicada.\n');
  }
}

module.exports = { buildPreservedSchema, assertAdditiveSql };
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
