# Procedimiento de Copias de Seguridad y Restauración (PostgreSQL)

Este documento detalla la política de respaldos, la automatización y el procedimiento de recuperación ante desastres para la base de datos de **BurgosLabs Rol**.

---

## 1. Política de Copias de Seguridad

- **Frecuencia**:
  - **Diaria**: Se genera automáticamente cada noche a las 03:00 AM. Se conservan las últimas **7 copias diarias**.
  - **Semanal**: Cada domingo se archiva una copia semanal. Se conservan las últimas **4 copias semanales**.
- **Formato**: Volcado SQL completo con `--clean --if-exists` comprimido con `gzip` (`.sql.gz`).
- **Permisos**: `chmod 600` restringido exclusivamente al usuario del sistema.

---

## 2. Automatización con Cron

Para programar la ejecución desatendida diaria en el servidor anfitrión:

1. Abrir el crontab del usuario del servidor:
   ```bash
   crontab -e
   ```

2. Añadir la siguiente línea para ejecutar el script cada noche a las 03:00 AM y redirigir los registros:
   ```cron
   0 3 * * * /home/reptil/Documentos/personal/Catalogo_D-D/scripts/backup.sh >> /home/reptil/Documentos/personal/Catalogo_D-D/backups/backup.log 2>&1
   ```

---

## 3. Sincronización Fuera del Servidor (Off-site Backups)

Las copias locales en `./backups` protegen ante errores de software o corrupción de datos, pero **deben sincronizarse en un almacenamiento externo** para protegerse contra fallos de disco o pérdida del servidor.

### Opción Recomendada: `rclone` (Hacia Cloudflare R2 / AWS S3 / Backblaze B2)
1. Instalar y configurar rclone:
   ```bash
   sudo apt-get install -y rclone
   rclone config
   ```
2. Añadir sincronización al final de `scripts/backup.sh` o en una tarea cron:
   ```bash
   rclone sync /home/reptil/Documentos/personal/Catalogo_D-D/backups/ remote:burgoslabs-rol-backups/
   ```

---

## 4. Procedimiento de Restauración (Disaster Recovery)

Para restaurar una copia de seguridad en un contenedor nuevo o existente:

1. **Asegurarse de que el contenedor de base de datos está activo**:
   ```bash
   docker compose up -d db
   ```

2. **Identificar la copia que se desea restaurar**:
   ```bash
   ls -la backups/daily/
   # o
   ls -la backups/weekly/
   ```

3. **Ejecutar el script de restauración**:
   ```bash
   ./scripts/restore.sh backups/daily/backup_rol_db_daily_YYYYMMDD_HHMMSS.sql.gz
   ```

4. **Verificación de la restauración**:
   El script imprimirá automáticamente el listado de tablas (`User`, `Session`, `Campaign`, `CampaignMember`, `Character`). Para verificar el número de registros:
   ```bash
   docker compose exec -T db psql -U rol_user -d rol_db -c "SELECT 'User' as tbl, count(*) from \"User\" UNION SELECT 'Character', count(*) from \"Character\" UNION SELECT 'Campaign', count(*) from \"Campaign\";"
   ```

5. **Reiniciar la API** (para que reconozca los nuevos datos y limpie cachés):
   ```bash
   docker compose restart api
   ```
