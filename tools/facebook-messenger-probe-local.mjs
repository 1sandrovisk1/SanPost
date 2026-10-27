import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import {
  decryptCapture,
  exportCaptures,
} from './facebook-messenger-full-io.mjs';

const [action, configPath, duration = '60'] = process.argv.slice(2);
if (action === '--help') {
  console.log(
    'Uso: node tools/facebook-messenger-probe-local.mjs <arm|read|stop> <scope.json> [minutos: 1-1440]\nJSON completo: full-arm <scope.json> [minutos: 1-120]; full-read|full-export <scope.json> <nonce da sessao>. full-export grava arquivos 600 na pasta privada do scope, dentro de .secrets. Remova as copias apos comparar: arquivos locais nao expiram com Redis.\nSomente Docker local. Nao envia mensagens nem altera inscricoes na Meta. scope.json contem organizationId, profileId, integrationId, appId e pageId.'
  );
  process.exit(0);
}
const fail = () => {
  console.error(
    'PROBE_LOCAL_FAILED: confira Docker local, escopo e conexao autorizada.'
  );
  process.exit(1);
};
try {
  if (
    !['arm', 'read', 'stop', 'full-arm', 'full-read', 'full-export'].includes(
      action
    ) ||
    !configPath ||
    (['full-read', 'full-export'].includes(action)
      ? !/^[a-f0-9]{32}$/.test(duration)
      : !/^\d+$/.test(duration) ||
        Number(duration) < 1 ||
        Number(duration) > (action === 'full-arm' ? 120 : 1440))
  )
    fail();
  if (
    action === 'full-export' &&
    !realpathSync(configPath).startsWith(
      realpathSync(resolve('.secrets')) + sep
    )
  )
    fail();
  const scope = JSON.parse(readFileSync(configPath, 'utf8'));
  const keys = [
    'organizationId',
    'profileId',
    'integrationId',
    'appId',
    'pageId',
  ];
  if (
    Object.keys(scope).length !== 5 ||
    keys.some(
      (key) =>
        typeof scope[key] !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(scope[key])
    ) ||
    !/^\d{1,32}$/.test(scope.appId) ||
    !/^\d{1,32}$/.test(scope.pageId)
  )
    fail();
  const context = spawnSync(
    'docker',
    [
      'context',
      'inspect',
      ...(process.env.DOCKER_CONTEXT ? [process.env.DOCKER_CONTEXT] : []),
      '--format',
      '{{.Endpoints.docker.Host}}',
    ],
    { encoding: 'utf8', timeout: 10000 }
  );
  const endpoint = process.env.DOCKER_CONTEXT
    ? context.stdout.trim()
    : process.env.DOCKER_HOST || context.stdout.trim();
  if (!endpoint.startsWith('unix://')) fail();
  const env = { ...process.env };
  delete env.DOCKER_HOST;
  delete env.DOCKER_CONTEXT;
  const docker = (args, input) =>
    spawnSync('docker', ['--host', endpoint, ...args], {
      env,
      input,
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 4 * 1024 * 1024,
    });
  const container = 'multipost-facebook-local-app-1';
  const inspected = docker([
    'inspect',
    container,
    '--format',
    '{{json .Config.Labels}}',
  ]);
  if (inspected.status !== 0) fail();
  const labels = JSON.parse(inspected.stdout);
  if (
    labels['com.docker.compose.project'] !== 'multipost-facebook-local' ||
    labels['com.docker.compose.service'] !== 'app'
  )
    fail();
  // Program text is constant. Input is JSON over stdin, never shell interpolation.
  const script = String.raw`
const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');
const { randomBytes, createDecipheriv, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const input = JSON.parse(readFileSync(0, 'utf8'));
const { action, scope, minutes, nonce } = input;
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 0, connectTimeout: 5000 });
(async () => {
  const page = await prisma.integration.findFirst({ where: { id: scope.integrationId, organizationId: scope.organizationId, profileId: scope.profileId, internalId: scope.pageId, providerIdentifier: 'facebook', disabled: false, inBetweenSteps: false, deletedAt: null, clientProfile: { deletedAt: null } }, select: { id: true } });
  const auth = await prisma.providerCredential.findFirst({ where: { organizationId: scope.organizationId, profileId: scope.profileId, provider: 'facebook-automation:' + scope.appId + ':' + scope.pageId }, select: { id: true } });
  if (!page || !auth) throw new Error('SCOPE_MISMATCH');
  const suffix = [scope.organizationId, scope.profileId, scope.integrationId, scope.appId, scope.pageId].join(':');
  const armKey = 'fbauto:messenger-probe:' + suffix;
  const recordsKey = 'fbauto:messenger-probe-records:' + suffix;
  if (action === 'arm' || action === 'full-arm') {
    if (action === 'full-arm' && !(process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || '').trim()) throw new Error('KEY_REQUIRED');
    const issuedAt = Date.now();
    const arm = { ...scope, issuedAt, expiresAt: issuedAt + minutes * 60000, nonce: randomBytes(16).toString('hex') };
    if (action === 'full-arm') {
      const marker = randomBytes(3).toString('hex');
      arm.mode = 'full-json';
      arm.testTexts = ['Teste Story MultiPost ' + marker, 'Teste DM MultiPost ' + marker];
    }
    const result = await redis.set(armKey, JSON.stringify(arm), 'PXAT', arm.expiresAt, 'NX');
    console.log(JSON.stringify({ state: result ? 'ARMED' : 'ALREADY_ARMED', scope, expiresAt: result ? new Date(arm.expiresAt).toISOString() : undefined, nonce: result ? arm.nonce : undefined, testTexts: result ? arm.testTexts : undefined }));
  } else if (action === 'stop') {
    await redis.del(armKey);
    console.log(JSON.stringify({ state: 'STOPPED', scope }));
  } else if (action === 'full-read' || action === 'full-export') {
    const records = (await redis.lrange('fbauto:messenger-full-records:' + suffix + ':' + nonce, 0, 3)).map(item => JSON.parse(item));
    const current = JSON.parse(await redis.get(armKey) || 'null');
    const keySource = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || '';
    const projected = records.map(({ encryptedJson, ...row }) => {
      if (action === 'full-export' && row.status === 'captured') row.rawJson = decryptCapture({ ...row, encryptedJson }, keySource, scope, nonce);
      return row;
    });
    console.log(JSON.stringify({ active: current?.nonce === nonce && current.expiresAt > Date.now(), expiresAt: current?.nonce === nonce ? new Date(current.expiresAt).toISOString() : undefined, scope, records: projected, capacity: 4, remaining: 4 - records.length }));
  } else {
    const records = (await redis.lrange(recordsKey, 0, 19)).map(item => JSON.parse(item));
    console.log(JSON.stringify({ active: (await redis.pttl(armKey)) > 0, scope, records }));
  }
})().catch(() => { process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); redis.disconnect(); });
`;
  const result = docker(
    [
      'exec',
      '-i',
      container,
      'node',
      '-e',
      `const decryptCapture = ${decryptCapture.toString()};\n` + script,
    ],
    JSON.stringify({
      action,
      scope,
      minutes: Number(duration),
      nonce: duration,
    })
  );
  if (result.status !== 0) fail();
  if (action === 'full-export') {
    const parsed = JSON.parse(result.stdout);
    const files = exportCaptures(
      parsed.records,
      duration,
      dirname(realpathSync(configPath))
    );
    console.log(JSON.stringify({ state: 'EXPORTED', files }));
  } else process.stdout.write(result.stdout);
} catch {
  fail();
}
