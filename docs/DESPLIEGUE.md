# Guía de Despliegue en Producción (Vercel + Neon)
Dominio: **https://rol.burgoslabs.es**

Esta guía describe el procedimiento paso a paso para desplegar la plataforma utilizando **Vercel** para la API serverless y la SPA de React, **Neon** para PostgreSQL serverless, y **Cloudflare** para la gestión de DNS.

---

## 1. Arquitectura de Despliegue

```
                      Usuario / Navegador
                               │
                               ▼
                   Cloudflare DNS (DNS Only)
                    rol.burgoslabs.es (CNAME)
                               │
                               ▼
                   Vercel Edge & Serverless
             ┌───────────────────────────────────┐
             │ vercel.json                       │
             │ ├─ /api/*   -> Hono (Node.js)     │
             │ ├─ /health  -> Hono (Node.js)     │
             │ └─ /*       -> SPA apps/web/dist  │
             └─────────────────┬─────────────────┘
                               │
                               ▼ (SSL seguro)
                    Neon PostgreSQL Serverless
             ┌───────────────────────────────────┐
             │ DATABASE_URL (-pooler PgBouncer)  │
             │ DIRECT_URL   (conexión directa)   │
             │ Rama: 'main' (Prod) / 'dev' (Prev)│
             └───────────────────────────────────┘
```

---

## 2. Configuración en Neon (Base de Datos)

1. Crear un proyecto en [Neon](https://neon.tech) llamado `burgoslabs-rol`.
2. Crear dos ramas en Neon:
   - **`main`**: Base de datos de Producción.
   - **`dev`**: Base de datos para entornos de Preview / Desarrollo.
3. Copiar las cadenas de conexión para ambas ramas:
   - **Pooled connection string** (con `-pooler`): para `DATABASE_URL`.
   - **Direct connection string** (sin `-pooler`): para `DIRECT_URL`.
4. **Política de Backups en Neon**:
   - En el plan gratuito/hobby de Neon, la restauración de punto en el tiempo (PITR) y el historial de ramas permiten revertir la base de datos a cualquier punto en los últimos días.
   - Adicionalmente, el propietario dispone del script local `scripts/backup.sh` para realizar volcados independientes con `pg_dump`.

---

## 3. Configuración en Vercel

1. Iniciar sesión en [Vercel](https://vercel.com) e importar el repositorio Git de `Catalogo_D-D`.
2. Configuración del proyecto:
   - **Framework Preset**: *Other* / *Vite*
   - **Root Directory**: `./` (la raíz del monorepo)
   - **Build Command**: `npm --workspace=packages/shared run build && npm --workspace=apps/web run build`
   - **Output Directory**: `apps/web/dist`
3. Variables de Entorno en Vercel:
   Configurar los siguientes valores en **Settings > Environment Variables**:

   | Variable | Entorno Production | Entorno Preview | Descripción |
   |---|---|---|---|
   | `DATABASE_URL` | Rama `main` de Neon (con `-pooler`) | Rama `dev` de Neon (con `-pooler`) | Cadena de conexión para runtime |
   | `DIRECT_URL` | Rama `main` de Neon (directa) | Rama `dev` de Neon (directa) | Cadena directa para migraciones |
   | `ALLOWED_ORIGIN` | `https://rol.burgoslabs.es` | `https://*.vercel.app` | Origen autorizado para CORS y CSRF |
   | `SESSION_SECRET` | Generado con `openssl rand -base64 32` | Generado con `openssl rand -base64 32` | Clave secreta para cookies de sesión |
   | `CRON_SECRET` | Generado con `openssl rand -hex 32` | Generado con `openssl rand -hex 32` | Token de autorización de Vercel Cron |
   | `NODE_ENV` | `production` | `production` | Entorno de ejecución |

---

## 4. Configuración del Dominio en Cloudflare

1. En Vercel, ir a **Settings > Domains** y añadir `rol.burgoslabs.es`.
2. Vercel indicará el registro DNS esperado (típicamente un `CNAME` apuntando a `cname.vercel-dns.com`).
3. En el panel de **Cloudflare DNS**:
   - Crear un registro `CNAME`:
     - **Nombre**: `rol`
     - **Objetivo**: `cname.vercel-dns.com`
     - **Proxy status**: **DNS only** (nube gris, **sin** proxy naranja).
4. Vercel aprovisionará y renovará automáticamente el certificado SSL/TLS Let's Encrypt para `rol.burgoslabs.es`.

---

## 5. Migraciones de Base de Datos y Despliegue

Las migraciones DDL nunca deben ejecutarse a ciegas dentro del build serverless sin control.

1. **Aplicar migraciones a Producción**:
   Desde la máquina local del desarrollador o terminal de despliegue con la variable `DIRECT_URL` de producción:
   ```bash
   DATABASE_URL="<neon_pooler_main>" DIRECT_URL="<neon_direct_main>" npx prisma migrate deploy --schema=./apps/api/prisma/schema.prisma
   ```

2. **Despliegue Automático**:
   Cada push a la rama `main` en GitHub disparará un despliegue en Vercel.

3. **Verificación**:
   - Visitar `https://rol.burgoslabs.es/health` (debe responder `{"status":"ok", ...}`).
   - Probar flujo de registro, creación de ficha D&D 5e y creación de campaña.

---

## 6. Protección de Ramas en GitHub

Para garantizar la estabilidad en producción:
1. En GitHub, ir a **Settings > Branches**.
2. Añadir una regla de protección para `main`:
   - Marcar **Require a pull request before merging**.
   - Marcar **Require status checks to pass before merging** (verificando que los tests de Vitest pasen en CI antes del merge).
