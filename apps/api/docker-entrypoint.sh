#!/bin/sh
set -e

echo "==> [API] Ejecutando migraciones de base de datos con Prisma..."
npx prisma migrate deploy --schema=./apps/api/prisma/schema.prisma

echo "==> [API] Iniciando servidor Fastify en producción..."
exec node apps/api/dist/server.js
