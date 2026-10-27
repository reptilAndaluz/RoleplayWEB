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

---

## 7. Lista de Verificación de Seguridad Externa para el Propietario (Fase 5)

Las siguientes tareas requieren acceso a los paneles administrativos de Vercel, Neon y GitHub y deben ser completadas manualmente por el propietario del proyecto:

- [ ] **Rotación y confirmación de `CRON_SECRET`**:
  En el panel de Vercel (**Settings > Environment Variables**), confirmar que la variable `CRON_SECRET` de producción tiene un valor aleatorio generado mediante `openssl rand -hex 32` (al menos 32 caracteres criptográficos) y **nunca** el valor de ejemplo (`change_this_cron_secret...`). Si en algún momento se utilizó el valor por defecto, **rotarlo inmediatamente**.
- [ ] **Rotación de credenciales de Neon**:
  Rotar la contraseña del usuario de base de datos en Neon Console (**Settings > Reset password**) y actualizar tanto `DATABASE_URL` como `DIRECT_URL` en las variables de entorno de Vercel. Asegurarse de que ningún secreto antiguo del historial de Git siga activo.
- [ ] **Separación estricta de bases de datos entre entornos**:
  Comprobar que el entorno de **Production** en Vercel apunta a la rama `main` de Neon y que el entorno de **Preview** apunta a una base de datos o rama separada (`dev`). Nunca compartir la base de datos de producción con despliegues de preview.
- [ ] **Protección de despliegues en Vercel**:
  En Vercel (**Settings > Deployment Protection**), activar la protección de despliegues (Vercel Authentication o contraseña compartida) para los despliegues de *Preview* si no se desea que sean públicos.
- [ ] **Seguridad del repositorio en GitHub**:
  - Activar **Dependabot alerts** y **Dependabot security updates** en **Settings > Code security and analysis**.
  - Activar **Secret scanning** y **Push protection** para bloquear en tiempo real commits que contengan credenciales o tokens.
  - Configurar las reglas de protección de rama en `main` exigiendo Pull Request y comprobación de tests en verde.
- [ ] **Verificación de `ALLOWED_ORIGIN` en Producción**:
  Confirmar que en el entorno de producción de Vercel el valor de `ALLOWED_ORIGIN` está configurado exactamente a `https://rol.burgoslabs.es` (sin barra final ni comodines).

