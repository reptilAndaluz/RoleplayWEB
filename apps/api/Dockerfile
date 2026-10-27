# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Dependencias nativas para compilar argon2 si fuera necesario
RUN apk add --no-cache python3 make g++

# Copiar manifiestos del monorepo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Instalación reproducible
RUN npm ci

# Copiar código fuente
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Compilación de shared y api
RUN npm --workspace=packages/shared run build
RUN npm --workspace=apps/api run build

# Stage 2: Production Runner
FROM node:22-alpine AS runner

WORKDIR /app

# Dependencias de producción: openssl (para Prisma engine) y dumb-init
RUN apk add --no-cache openssl dumb-init

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copiar manifiestos y artefactos con propietario no root 'node'
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node packages/shared/package.json ./packages/shared/
COPY --chown=node:node apps/api/package.json ./apps/api/

COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=builder /app/apps/api/prisma ./apps/api/prisma

COPY --chown=node:node apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
RUN chmod +x ./apps/api/docker-entrypoint.sh

USER node

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--", "./apps/api/docker-entrypoint.sh"]
