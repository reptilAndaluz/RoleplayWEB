# Guía de Despliegue en Producción (https://rol.burgoslabs.es)

Esta guía detalla el procedimiento completo para desplegar la plataforma de forma segura y aislada en el servidor de producción utilizando **Docker Compose**, **Cloudflare Zero Trust (Tunnel)** y **Caddy**.

---

## 1. Arquitectura de Despliegue

```
                      Internet (HTTPS)
                            │
                            ▼
              ┌───────────────────────────┐
              │  Cloudflare Edge / Proxy  │
              │  SSL: Full (strict)       │
              └─────────────┬─────────────┘
                            │ Túnel cifrado saliente (sin puertos entrantes abiertos)
                            ▼
             ┌───────────────────────────────┐
             │ cloudflared (contenedor)      │
             └──────────────┬────────────────┘
                            │ Red interna de Docker (bridge)
                            ▼
             ┌───────────────────────────────┐
             │ caddy (:80 interno)           │
             │ - Servir SPA /apps/web/dist   │
             │ - Proxy /api/* -> api:3000    │
             └──────────────┬────────────────┘
                            │
                            ▼
             ┌───────────────────────────────┐
             │ api (:3000 interno)           │
             │ - Node.js 22 (usuario node)   │
             │ - Fastify + Prisma            │
             └──────────────┬────────────────┘
                            │
                            ▼
             ┌───────────────────────────────┐
             │ db (:5432 interno, sin ports) │
             │ - PostgreSQL 16 Alpine        │
             │ - Volumen persistente: pgdata │
             └───────────────────────────────┘
```

---

## 2. Pasos Previos en el Servidor

### 2.1. Seguridad del Host (Firewall y SSH)
El servidor **no debe exponer puertos al exterior** para la aplicación web ni la base de datos (todo el tráfico llega a través del túnel seguro de Cloudflare).

1. **Configurar el firewall (UFW)**:
   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow ssh
   sudo ufw enable
   ```

2. **Asegurar SSH**:
   - Acceder **únicamente mediante clave SSH pública**.
   - Desactivar autenticación por contraseña en `/etc/ssh/sshd_config`:
     ```text
     PasswordAuthentication no
     PubkeyAuthentication yes
     PermitRootLogin prohibit-password
     ```
   - Reiniciar el servicio SSH: `sudo systemctl restart ssh`.

3. **Verificación con Nmap**:
   Ejecutar desde otra máquina:
   ```bash
   nmap -p- TU_IP_DEL_SERVIDOR
   ```
   *Solo debe figurar abierto el puerto SSH (22).*

---

## 3. Configuración en Cloudflare Zero Trust

1. Acceder al panel de **Cloudflare Zero Trust** > **Networks** > **Tunnels**.
2. Crear un nuevo túnel llamado, por ejemplo, `burgoslabs-rol`.
3. Copiar el token proporcionado (`TUNNEL_TOKEN`).
4. En la pestaña **Public Hostname**:
   - **Public hostname**: `rol.burgoslabs.es`
   - **Service Type**: `HTTP`
   - **URL**: `caddy:80` (nombre del servicio Caddy en Docker Compose).
5. En el panel principal de Cloudflare para el dominio `burgoslabs.es`:
   - Ir a **SSL/TLS**.
   - Establecer el modo de cifrado en **Full (strict)**.
   - Activar **Always Use HTTPS**.

---

## 4. Configuración de Variables de Entorno

En el servidor, dentro del directorio del proyecto `/home/reptil/Documentos/personal/Catalogo_D-D`:

1. Crear el fichero `.env` a partir de la plantilla:
   ```bash
   cp .env.example .env
   ```

2. Generar secretos criptográficamente seguros para la base de datos y la sesión:
   ```bash
   # Generar contraseñas y secretos aleatorios
   openssl rand -base64 32
   ```

3. Rellenar las variables en `.env`:
   ```env
   NODE_ENV=production
   PORT=3000
   HOST=0.0.0.0
   ALLOWED_ORIGIN=https://rol.burgoslabs.es

   POSTGRES_USER=rol_user
   POSTGRES_PASSWORD=<generada_con_openssl>
   POSTGRES_DB=rol_db
   DATABASE_URL=postgresql://rol_user:<generada_con_openssl>@db:5432/rol_db?schema=public

   SESSION_SECRET=<generada_con_openssl_min_32_caracteres>

   TUNNEL_TOKEN=<token_obtenido_en_cloudflare_zero_trust>
   ```

---

## 5. Compilación del Frontend y Despliegue con Docker Compose

1. **Compilar los paquetes compartidos y la SPA del frontend**:
   ```bash
   npm --workspace=packages/shared run build
   npm --workspace=apps/web run build
   ```
   *Esto generará los ficheros estáticos listos para producción en `apps/web/dist`.*

2. **Levantar todos los servicios en segundo plano**:
   ```bash
   docker compose up -d --build
   ```

3. **Comprobar el estado de salud de los servicios**:
   ```bash
   docker compose ps
   ```
   *Los contenedores `db`, `api`, `caddy` y `cloudflared` deben mostrar estado `Up (healthy)`.*

4. **Verificar los logs del arranque**:
   ```bash
   docker compose logs -f api
   ```
   *Deberá verse la ejecución automática de `prisma migrate deploy` seguida de `API escuchando en http://0.0.0.0:3000 [production]`.*

---

## 6. Verificación Final de Aceptación

1. Abrir en el navegador: `https://rol.burgoslabs.es`.
2. Comprobar que responde con certificado HTTPS válido emitido por Cloudflare.
3. Realizar una prueba de registro de usuario, creación de ficha de D&D 5e y creación de campaña.
