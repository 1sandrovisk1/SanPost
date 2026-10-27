#!/usr/bin/env bash
set -Eeuo pipefail
cd /app

# Do not call the root pm2 scripts or synchronize the database on restart.
# Schema initialization is an explicit, isolated Compose service.
if [[ "${MULTIPOST_DEV_PRISMA:-}" == 1 ]]; then
  # Generate Linux binaries/client in the container, never mount host node_modules.
  # This changes no database data and creates no Docker image.
  if ! node -e "const fs=require('node:fs'); const a='libraries/nestjs-libraries/src/database/prisma/schema.prisma'; const b='node_modules/.prisma/client/schema.prisma'; process.exit(fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b)) ? 0 : 1)"; then
    pnpm exec prisma generate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
  fi
fi

pids=()
cleanup() {
  trap - EXIT INT TERM
  if ((${#pids[@]})); then
    kill "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

(cd apps/backend && NODE_ENV=production node --experimental-require-module dist/apps/backend/src/main.js) &
pids+=("$!")
(cd apps/orchestrator && NODE_ENV=production node --experimental-require-module dist/apps/orchestrator/src/main.js) &
pids+=("$!")
# Development frontend avoids baking OAuth/tunnel URLs into a production build.
# The /launches compilation exceeds the previous 4 GiB heap and restarts Next.
# Turbopack avoids concurrent Webpack page compilers exhausting the local VM.
# Keep this frontend-only; Docker needs headroom for native memory and workers.
# Version static chunks once per local startup: tunnel/browser caches may keep
# development chunk names unchanged even after a new image is installed.
NODE_ENV=development NODE_OPTIONS=--max-old-space-size=6144 \
  NEXT_DEPLOYMENT_ID="local-$(date +%s)" \
  pnpm --filter postiz-frontend exec next dev --turbopack --hostname 0.0.0.0 --port 4200 &
pids+=("$!")
nginx -g 'daemon off;' &
pids+=("$!")

# Any failed child stops the container; Compose can restart the whole app coherently.
set +e
wait -n
result=$?
exit "$result"
