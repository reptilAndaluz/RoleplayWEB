#!/usr/bin/env bash
# ==============================================================================
# Script de Copias de Seguridad Automatizadas para PostgreSQL (Docker)
# Plataforma: BurgosLabs Rol (rol.burgoslabs.es)
# Política de retención: 7 copias diarias y 4 copias semanales
# ==============================================================================

set -euo pipefail

# Directorio raíz del proyecto
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Cargar variables de entorno si existe .env
if [ -f "${ROOT_DIR}/.env" ]; then
  # Exportar variables sin comentarios ni líneas vacías
  export $(grep -v '^#' "${ROOT_DIR}/.env" | xargs)
fi

POSTGRES_USER="${POSTGRES_USER:-rol_user}"
POSTGRES_DB="${POSTGRES_DB:-rol_db}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
DAY_OF_WEEK="$(date +'%u')" # 1 (Lunes) a 7 (Domingo)

# Crear directorio de copias si no existe
mkdir -p "${BACKUP_DIR}/daily"
mkdir -p "${BACKUP_DIR}/weekly"

echo "[$(date +'%Y-%m-%d %H:%M:%S')] ==> Iniciando copia de seguridad de '${POSTGRES_DB}'..."

# Nombre del archivo diario
DAILY_FILE="${BACKUP_DIR}/daily/backup_${POSTGRES_DB}_daily_${TIMESTAMP}.sql.gz"

COMPOSE_FILE="${COMPOSE_FILE:-${ROOT_DIR}/docker-compose.yml}"
if [ ! -f "${COMPOSE_FILE}" ] && [ -f "${ROOT_DIR}/docker-compose.dev.yml" ]; then
  COMPOSE_FILE="${ROOT_DIR}/docker-compose.dev.yml"
fi

# Ejecutar pg_dump a través de Docker Compose con compresión gzip
if docker compose -f "${COMPOSE_FILE}" exec -T db pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists | gzip > "${DAILY_FILE}"; then
  chmod 600 "${DAILY_FILE}"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✓ Copia diaria generada con éxito: ${DAILY_FILE} ($(du -h "${DAILY_FILE}" | cut -f1))"
else
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✗ Error: Falló la generación de la copia de seguridad." >&2
  rm -f "${DAILY_FILE}"
  exit 1
fi

# Si es domingo (7), duplicar como copia semanal
if [ "${DAY_OF_WEEK}" -eq 7 ]; then
  WEEKLY_FILE="${BACKUP_DIR}/weekly/backup_${POSTGRES_DB}_weekly_${TIMESTAMP}.sql.gz"
  cp "${DAILY_FILE}" "${WEEKLY_FILE}"
  chmod 600 "${WEEKLY_FILE}"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✓ Copia semanal archivada: ${WEEKLY_FILE}"
fi

# Rotación: conservar las últimas 7 diarias
echo "[$(date +'%Y-%m-%d %H:%M:%S')] ==> Aplicando rotación (máx 7 diarias)..."
find "${BACKUP_DIR}/daily" -name "backup_${POSTGRES_DB}_daily_*.sql.gz" -type f | sort -r | tail -n +8 | xargs -r rm -f

# Rotación: conservar las últimas 4 semanales
echo "[$(date +'%Y-%m-%d %H:%M:%S')] ==> Aplicando rotación (máx 4 semanales)..."
find "${BACKUP_DIR}/weekly" -name "backup_${POSTGRES_DB}_weekly_*.sql.gz" -type f | sort -r | tail -n +5 | xargs -r rm -f

echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✓ Proceso de backup y rotación completado satisfactoriamente."
