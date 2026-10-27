import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

// Frontend-only edits do not rebuild the servers. Configuration and shared
// domain/helpers do; Linux native dependencies remain in the Docker image.
const digest = createHash('sha256');
function visit(path) {
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) visit(file);
    else if (entry.isFile() && !/\.(spec|test)\.[jt]sx?$/.test(file)) {
      digest.update(file).update('\0').update(readFileSync(file)).update('\0');
    }
  }
}
for (const path of ['apps/backend/src', 'apps/orchestrator/src', 'libraries/nestjs-libraries/src', 'libraries/helpers/src']) visit(path);
for (const path of ['package.json', 'pnpm-lock.yaml', 'tsconfig.base.json', ...['backend', 'orchestrator'].flatMap(app => ['package.json', 'nest-cli.json', 'tsconfig.json', 'tsconfig.build.json'].map(file => `apps/${app}/${file}`))]) {
  digest.update(path).update('\0').update(readFileSync(path)).update('\0');
}
process.stdout.write(digest.digest('hex'));
