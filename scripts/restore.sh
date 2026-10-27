#!/usr/bin/env bash
# ==============================================================================
# Script de Restauración de Copias de Seguridad para PostgreSQL (Docker)
# Plataforma: BurgosLabs Rol (rol.burgoslabs.es)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ "$#" -ne 1 ]; then
  echo "Uso: $0 <ruta_al_fichero_backup.sql.gz>"
  echo "Ejemplo: $0 ./backups/daily/backup_rol_db_daily_20261027_210000.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: El archivo de copia de seguridad no existe: ${BACKUP_FILE}" >&2
  exit 1
fi

# Cargar variables de entorno si existe .env
if [ -f "${ROOT_DIR}/.env" ]; then
  export $(grep -v '^#' "${ROOT_DIR}/.env" | xargs)
fi

POSTGRES_USER="${POSTGRES_USER:-rol_user}"
POSTGRES_DB="${POSTGRES_DB:-rol_db}"

echo "=================================================================="
echo " ADVERTENCIA: Esta operación sobreescribirá los datos actuales de"
echo " la base de datos '${POSTGRES_DB}' con el contenido de:"
echo " ${BACKUP_FILE}"
echo "=================================================================="

COMPOSE_FILE="${COMPOSE_FILE:-${ROOT_DIR}/docker-compose.yml}"
if [ ! -f "${COMPOSE_FILE}" ] && [ -f "${ROOT_DIR}/docker-compose.dev.yml" ]; then
  COMPOSE_FILE="${ROOT_DIR}/docker-compose.dev.yml"
fi

echo "==> Descomprimiendo y restaurando copia en PostgreSQL..."
gunzip -c "${BACKUP_FILE}" | docker compose -f "${COMPOSE_FILE}" exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

echo "==> Comprobando integridad de las tablas..."
docker compose -f "${COMPOSE_FILE}" exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"

echo "✓ Restauración completada con éxito."
