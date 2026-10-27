import { spawnSync } from 'node:child_process';
const name = `multipost_shared_test_scheduled_${Date.now()}`;
const postgres = 'multipost-facebook-local-postgres-1';
const app = 'multipost-facebook-local-app-1';
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
};
const inside = (args) =>
  run('docker', [
    'exec',
    '-e',
    `SCHEDULED_TEST_DB=${name}`,
    app,
    'node',
    '-e',
    `
 const {spawnSync}=require('node:child_process');
 const url=new URL(process.env.DATABASE_URL);url.pathname='/'+process.env.SCHEDULED_TEST_DB;
 const env={...process.env,DATABASE_URL:url.toString(),SHARED_FLOW_TEST_DATABASE_URL:url.toString(),REDIS_URL:'',NODE_OPTIONS:'--max-old-space-size=4096'};
 process.exit(spawnSync('pnpm',${JSON.stringify(
   args
 )},{env,stdio:'inherit'}).status??1);
`,
  ]);
let created = false;
try {
  run('docker', ['exec', postgres, 'createdb', '-U', 'multipost', name]);
  created = true;
  run('docker', [
    'exec',
    app,
    'pnpm',
    'exec',
    'prisma',
    'generate',
    '--schema',
    'libraries/nestjs-libraries/src/database/prisma/schema.prisma',
  ]);
  inside([
    'exec',
    'prisma',
    'db',
    'push',
    '--skip-generate',
    '--schema',
    'libraries/nestjs-libraries/src/database/prisma/schema.prisma',
  ]);
  inside([
    'exec',
    'jest',
    '--selectProjects',
    'nestjs-libraries',
    '--runInBand',
    '--no-coverage',
    '--globals={"ts-jest":{"isolatedModules":true}}',
    '--testPathPattern=scheduled-posts.database.spec.ts|shared-flows.database.spec.ts|post-management.database.spec.ts',
  ]);
} finally {
  if (created)
    run('docker', ['exec', postgres, 'dropdb', '-U', 'multipost', name]);
}
