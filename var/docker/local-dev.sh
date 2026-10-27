#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."

if [[ -n "${DOCKER_CONTEXT:-}" ]]; then
  docker_endpoint=$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')
else
  docker_endpoint=${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}
fi
if [[ "$docker_endpoint" != unix://* ]]; then
  echo 'Este comando exige um Docker local (socket Unix). Selecione o contexto local antes de continuar.' >&2
  exit 1
fi

compose=(docker compose --env-file .secrets/multipost-local.env
  -f docker-compose.local.yaml -f docker-compose.tunnel.yaml
  -f docker-compose.restored.yaml -f docker-compose.meta-proof.yaml
  -f docker-compose.dev-local.yaml)

docker info >/dev/null
test "$(node -p 'process.versions.node.split(".")[0]')" = 22 || {
  echo 'Use Node.js 22 para desenvolver o MultiPost.' >&2; exit 1;
}

# Refuse incompatible image dependencies rather than mounting host node_modules.
image_hashes=$(docker run --rm --network none --entrypoint sha256sum multipost-facebook-local:source /app/pnpm-lock.yaml /app/libraries/nestjs-libraries/src/database/prisma/schema.prisma)
image_lock=$(printf '%s\n' "$image_hashes" | head -1 | cut -d' ' -f1)
image_schema=$(printf '%s\n' "$image_hashes" | tail -1 | cut -d' ' -f1)
host_lock=$(shasum -a 256 pnpm-lock.yaml | cut -d' ' -f1)
host_schema=$(shasum -a 256 libraries/nestjs-libraries/src/database/prisma/schema.prisma | cut -d' ' -f1)
if [[ "$image_lock" != "$host_lock" ]]; then
  echo 'As dependências mudaram. Atualize a imagem antes de iniciar este modo.' >&2
  exit 1
fi
if [[ "$image_schema" != "$host_schema" ]]; then
  echo 'Schema alterado: o cliente Prisma Linux será gerado no contêiner. A migração do banco deve ser aplicada explicitamente antes de iniciar.'
fi

mkdir -p tmp
source_hash=$(node tools/local-dev-source-hash.mjs)
previous_hash=$(cat tmp/local-dev-server.sha256 2>/dev/null || true)
if [[ "$source_hash" != "$previous_hash" || ! -f apps/backend/dist/apps/backend/src/main.js || ! -f apps/orchestrator/dist/apps/orchestrator/src/main.js ]]; then
  echo 'Compilando backend e worker alterados, sem criar imagem Docker...'
  # Builds replace dist; stop readers first. Failure leaves the app stopped.
  "${compose[@]}" stop app
  pnpm build:backend
  pnpm build:orchestrator
  printf '%s' "$source_hash" > tmp/local-dev-server.sha256
fi

# The restored schema service validates only; it never pushes/migrates data.
"${compose[@]}" up -d --no-build postgres redis temporal schema app
echo 'Frontend com atualização automática. Acesse https://localmultipost.automacaosemlimites.com.br'
"${compose[@]}" ps app
