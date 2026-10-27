# Isolated local homologation image. No production credentials or database at build time.
FROM node:22.23.4-trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates openssl python3 make g++ bash nginx \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@10.6.1 --activate

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN --mount=type=cache,id=multipost-local-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
RUN NODE_OPTIONS=--max-old-space-size=6144 pnpm build:backend \
    && NODE_OPTIONS=--max-old-space-size=6144 pnpm build:orchestrator

RUN addgroup --system www && adduser --system --ingroup www --home /www www \
    && mkdir -p /uploads /www
COPY var/docker/nginx.conf /etc/nginx/nginx.conf
EXPOSE 5000
CMD ["bash", "/app/var/docker/local-start.sh"]
